import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.config import FortyGuardSettings
from backend.app.main import app, get_fortyguard_service
from backend.app.schemas import FortyGuardSubmitRequest
from backend.app.services.fortyguard_client import (
    FortyGuardAPIError,
    FortyGuardClient,
    FortyGuardConfigurationError,
    FortyGuardIntegrationError,
)
from backend.app.services.fortyguard_temperature import (
    FORTYGUARD_TCM_PROPERTY,
    FortyGuardTemperatureService,
    build_fortyguard_payload,
    create_request_id,
    extract_activity_id,
    normalize_fortyguard_temporal,
)

FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "fortyguard_completed_fake.json"
)
OPEN_RING_GEOMETRY = {
    "type": "Polygon",
    "coordinates": [
        [
            [-112.0805, 33.4450],
            [-112.0715, 33.4450],
            [-112.0715, 33.4515],
            [-112.0805, 33.4515],
        ]
    ],
}

VALID_SUBMIT_BODY = {
    "geometry": OPEN_RING_GEOMETRY,
    "date": "2026-08-26",
    "time": "14:30",
    "granularity": 100,
}


def make_settings(*, api_key: str = "fake-test-key"):
    return FortyGuardSettings(
        api_key=api_key,
        base_url="https://api.fortyguard.test",
    )


def run(coroutine):
    return asyncio.run(coroutine)


def load_completed_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_missing_api_key_refuses_before_http() -> None:
    client = FortyGuardClient(make_settings(api_key=""))

    with pytest.raises(FortyGuardConfigurationError) as error:
        client.ensure_live_request_allowed()

    assert error.value.safe_message == "FortyGuard API key is missing or invalid."


def test_missing_key_endpoint_returns_safe_message(monkeypatch) -> None:
    monkeypatch.setenv("FORTYGUARD_API_KEY", "")

    response = TestClient(app).post(
        "/api/temperature/submit",
        json=VALID_SUBMIT_BODY,
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": "FortyGuard API key is missing or invalid."
    }


def test_browser_key_overrides_optional_server_fallback(monkeypatch) -> None:
    monkeypatch.setenv("FORTYGUARD_API_KEY", "server-fallback-key")

    service = get_fortyguard_service("  user-provided-key  ")

    assert service.client.settings.api_key == "user-provided-key"


def test_cors_preflight_allows_browser_api_key_header() -> None:
    response = TestClient(app).options(
        "/api/temperature/submit",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-fortyguard-api-key,content-type",
        },
    )

    assert response.status_code == 200
    assert "x-fortyguard-api-key" in response.headers["access-control-allow-headers"].lower()


def test_valid_submission_extracts_activity_and_closes_polygon(tmp_path: Path) -> None:
    captured_payload: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_payload
        captured_payload = json.loads(request.content)
        assert request.headers["api-key"] == "fake-test-key"
        return httpx.Response(
            200,
            json={"data": {"activity_id": "fake-submit-id"}},
        )

    service = FortyGuardTemperatureService(
        FortyGuardClient(
            make_settings(),
            transport=httpx.MockTransport(handler),
        ),
        cache_directory=tmp_path,
    )
    request = FortyGuardSubmitRequest.model_validate(VALID_SUBMIT_BODY)
    response = run(service.submit(request))
    submitted_ring = captured_payload["polygon_aoi"]["features"][0]["geometry"][
        "coordinates"
    ][0]

    assert response["status"] == "Processing"
    assert response["activity_id"] == "fake-submit-id"
    assert response["cached"] is False
    assert submitted_ring[0] == submitted_ring[-1]
    assert captured_payload["analytic_type"] == "tcm"
    assert captured_payload["date_time"]["filter_type"] == 1
    assert captured_payload["granularity"] == 100


def test_activity_id_extraction() -> None:
    assert extract_activity_id({"data": {"activity_id": "fake-id"}}) == "fake-id"


@pytest.mark.parametrize(
    ("analytic_type", "property_name"),
    [
        ("time_of_measure", "time_of_measure"),
        ("exceedance", "exceedance"),
        ("persistence", "persistence"),
    ],
)
def test_temporal_analytics_normalize_documented_hour_property(
    analytic_type: str,
    property_name: str,
) -> None:
    fixture = load_completed_fixture()["data"]["result"]
    for index, feature in enumerate(fixture["map_data"]["features"]):
        feature["properties"] = {"tile_id": f"tile-{index}", property_name: 12 + index}

    normalized = normalize_fortyguard_temporal(
        "temporal-test",
        fixture,
        analytic_type=analytic_type,
        threshold_c=40.0,
        cached=False,
    )

    assert normalized["analytic_type"] == analytic_type
    assert normalized["units"] == "hour"
    assert normalized["heatmap"]["features"][0]["properties"][property_name] == 12
    assert normalized["heatmap"]["features"][0]["properties"]["analysis_value"] == 12.0
    assert normalized["heatmap"]["features"][0]["properties"]["cell_id"].startswith("FG-")


@pytest.mark.parametrize("analytic_type", ["time_of_measure", "exceedance", "persistence"])
def test_temporal_payload_uses_single_day_and_optional_threshold(analytic_type: str) -> None:
    request = FortyGuardSubmitRequest.model_validate(
        {**VALID_SUBMIT_BODY, "analytic_type": analytic_type, "threshold_c": 40}
    )

    payload = build_fortyguard_payload(request)

    assert payload["analytic_type"] == analytic_type
    assert payload["date_time"] == {"start_date": VALID_SUBMIT_BODY["date"], "filter_type": 3}
    if analytic_type in {"exceedance", "persistence"}:
        assert payload["threshold"] == 40
        assert payload["direction"] == "above"
    else:
        assert "threshold" not in payload


def test_processing_status(tmp_path: Path) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={"data": {"activity_id": "fake-id", "status": "Processing"}},
        )
    )
    service = FortyGuardTemperatureService(
        FortyGuardClient(make_settings(), transport=transport),
        cache_directory=tmp_path,
    )

    response = run(service.status("fake-id"))

    assert response == {
        "status": "Processing",
        "retryable": True,
        "activity_id": "fake-id",
    }


def test_temporary_404_is_retryable_processing(tmp_path: Path) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(404, json={"message": "Not found yet"})
    )
    service = FortyGuardTemperatureService(
        FortyGuardClient(make_settings(), transport=transport),
        cache_directory=tmp_path,
    )

    response = run(service.status("fake-id"))

    assert response["status"] == "Processing"
    assert response["retryable"] is True


def test_completed_result_uses_authoritative_stats_and_preserves_properties(
    tmp_path: Path,
) -> None:
    fixture = load_completed_fixture()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=fixture)
    )
    service = FortyGuardTemperatureService(
        FortyGuardClient(make_settings(), transport=transport),
        cache_directory=tmp_path,
    )

    response = run(service.status("fake-test-activity-id"))
    result = response["result"]

    assert response["status"] == "Completed"
    assert result["source"] == "fortyguard"
    assert result["is_mock"] is False
    assert result["summary"] == {
        "cell_count": 2,
        "mean_temperature_c": 41.0,
        "min_temperature_c": 40.25,
        "max_temperature_c": 41.75,
    }
    assert (
        result["heatmap"]["features"][0]["properties"]["fixture_notice"]
        == "Synthetic test value, not a real observation"
    )


def test_unknown_temperature_property_reports_available_keys(tmp_path: Path) -> None:
    fixture = load_completed_fixture()
    properties = fixture["data"]["result"]["map_data"]["features"][0][
        "properties"
    ]
    properties["undocumented_heat_value"] = properties.pop(
        FORTYGUARD_TCM_PROPERTY
    )
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=fixture)
    )
    service = FortyGuardTemperatureService(
        FortyGuardClient(make_settings(), transport=transport),
        cache_directory=tmp_path,
    )

    with pytest.raises(FortyGuardIntegrationError) as error:
        run(service.status("fake-test-activity-id"))

    assert "undocumented_heat_value" in error.value.safe_message
    assert "fixture_notice" in error.value.safe_message


def test_failed_result_returns_safe_message(tmp_path: Path) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={"data": {"activity_id": "fake-id", "status": "Failed"}},
        )
    )
    service = FortyGuardTemperatureService(
        FortyGuardClient(make_settings(), transport=transport),
        cache_directory=tmp_path,
    )

    response = run(service.status("fake-id"))

    assert response["status"] == "Failed"
    assert response["error"] == "FortyGuard analysis failed."


@pytest.mark.parametrize(
    ("status_code", "expected_message"),
    [
        (400, "The selected area or date/time is not accepted by FortyGuard."),
        (401, "FortyGuard API key is missing or invalid."),
        (403, "Your FortyGuard plan does not allow this request."),
        (422, "The selected area or date/time is not accepted by FortyGuard."),
        (429, "FortyGuard rate limit reached. Please try again later."),
        (500, "FortyGuard could not process the request."),
    ],
)
def test_safe_http_errors(status_code: int, expected_message: str) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(status_code, json={"secret": "not exposed"})
    )
    client = FortyGuardClient(make_settings(), transport=transport)

    with pytest.raises(FortyGuardAPIError) as error:
        run(client.get_activity_status("fake-id"))

    assert error.value.status_code == status_code
    assert error.value.safe_message == expected_message
    assert "secret" not in error.value.safe_message


def test_invalid_granularity_is_rejected() -> None:
    response = TestClient(app).post(
        "/api/temperature/submit",
        json={**VALID_SUBMIT_BODY, "granularity": 75},
    )

    assert response.status_code == 422


def test_invalid_date_is_rejected() -> None:
    response = TestClient(app).post(
        "/api/temperature/submit",
        json={**VALID_SUBMIT_BODY, "date": "26-08-2026"},
    )

    assert response.status_code == 422


def test_invalid_time_is_rejected() -> None:
    response = TestClient(app).post(
        "/api/temperature/submit",
        json={**VALID_SUBMIT_BODY, "time": "2:30 PM"},
    )

    assert response.status_code == 422


def test_completed_cache_is_reused_without_resubmission(tmp_path: Path) -> None:
    fixture = load_completed_fixture()
    calls = {"submit": 0, "status": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            calls["submit"] += 1
            return httpx.Response(
                200,
                json={"data": {"activity_id": "fake-test-activity-id"}},
            )

        calls["status"] += 1
        return httpx.Response(200, json=fixture)

    service = FortyGuardTemperatureService(
        FortyGuardClient(
            make_settings(),
            transport=httpx.MockTransport(handler),
        ),
        cache_directory=tmp_path,
    )
    request = FortyGuardSubmitRequest.model_validate(VALID_SUBMIT_BODY)

    first = run(service.submit(request))
    completed = run(service.status(first["activity_id"]))
    second = run(service.submit(request))

    assert completed["status"] == "Completed"
    assert second["status"] == "Completed"
    assert second["cached"] is True
    assert second["request_id"] == create_request_id(
        request,
        service.client.credential_scope(),
    )
    assert calls == {"submit": 1, "status": 1}


def test_cache_is_scoped_without_storing_raw_api_key(tmp_path: Path) -> None:
    request = FortyGuardSubmitRequest.model_validate(VALID_SUBMIT_BODY)
    keys = ("first-user-secret", "second-user-secret")
    request_ids: list[str] = []

    for index, api_key in enumerate(keys, 1):
        transport = httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                json={"data": {"activity_id": f"activity-{index}"}},
            )
        )
        service = FortyGuardTemperatureService(
            FortyGuardClient(make_settings(api_key=api_key), transport=transport),
            cache_directory=tmp_path,
        )
        request_ids.append(run(service.submit(request))["request_id"])

    assert request_ids[0] != request_ids[1]
    serialized_cache = "\n".join(path.read_text(encoding="utf-8") for path in tmp_path.glob("*.json"))
    assert all(api_key not in serialized_cache for api_key in keys)


def test_processing_request_is_resumed_without_duplicate_submission(
    tmp_path: Path,
) -> None:
    calls = {"submit": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["submit"] += 1
        return httpx.Response(
            200,
            json={"data": {"activity_id": "fake-pending-id"}},
        )

    service = FortyGuardTemperatureService(
        FortyGuardClient(
            make_settings(),
            transport=httpx.MockTransport(handler),
        ),
        cache_directory=tmp_path,
    )
    request = FortyGuardSubmitRequest.model_validate(VALID_SUBMIT_BODY)

    first = run(service.submit(request))
    second = run(service.submit(request))

    assert first["activity_id"] == "fake-pending-id"
    assert second["activity_id"] == "fake-pending-id"
    assert second["resumed"] is True
    assert calls["submit"] == 1


def test_payload_builder_uses_single_hour_contract() -> None:
    request = FortyGuardSubmitRequest.model_validate(VALID_SUBMIT_BODY)
    payload = build_fortyguard_payload(request)

    assert payload["date_time"] == {
        "start_date": "2026-08-26",
        "start_time": "14:30",
        "filter_type": 1,
    }
    assert payload["analytic_type"] == "tcm"
