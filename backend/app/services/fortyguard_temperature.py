import hashlib
import json
from pathlib import Path
from typing import Any

from backend.app.config import PROJECT_ROOT
from backend.app.schemas import (
    FortyGuardSubmitRequest,
    NormalizedTemperatureResult,
    TemperatureSummary,
)
from backend.app.services.fortyguard_client import (
    FortyGuardAPIError,
    FortyGuardClient,
    FortyGuardIntegrationError,
)

FILTER_TYPE = 1
TEMPORAL_FILTER_TYPE = 3
FORTYGUARD_TCM_PROPERTY = "average_temperature"
TEMPORAL_PROPERTIES = {
    "time_of_measure": "time_of_measure",
    "exceedance": "exceedance",
    "persistence": "persistence",
}
DEFAULT_CACHE_DIRECTORY = PROJECT_ROOT / "data" / "cache" / "fortyguard"


def build_fortyguard_payload(request: FortyGuardSubmitRequest) -> dict[str, Any]:
    geometry = request.geometry.model_dump(mode="json")
    date_time: dict[str, Any] = {
        "start_date": request.date,
        "filter_type": FILTER_TYPE if request.analytic_type == "tcm" else TEMPORAL_FILTER_TYPE,
    }
    if request.analytic_type == "tcm":
        date_time["start_time"] = request.time
    payload: dict[str, Any] = {
        "polygon_aoi": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": geometry,
                }
            ],
        },
        "date_time": date_time,
        "granularity": request.granularity,
        "analytic_type": request.analytic_type,
    }
    if request.analytic_type in {"exceedance", "persistence"}:
        payload["threshold"] = request.threshold_c
        payload["direction"] = "above"
    return payload


def create_request_id(
    request: FortyGuardSubmitRequest,
    credential_scope: str = "",
) -> str:
    request_material = {
        "coordinates": request.geometry.model_dump(mode="json")["coordinates"],
        "date": request.date,
        "time": request.time,
        "granularity": request.granularity,
        "analytic_type": request.analytic_type,
        "threshold_c": request.threshold_c if request.analytic_type in {"exceedance", "persistence"} else None,
    }
    if credential_scope:
        request_material["credential_scope"] = credential_scope
    canonical = json.dumps(request_material, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _case_insensitive_value(mapping: dict[str, Any], key: str) -> Any:
    normalized_key = key.casefold()

    for candidate_key, value in mapping.items():
        if candidate_key.casefold() == normalized_key:
            return value

    return None


def _required_number(mapping: dict[str, Any], key: str) -> float:
    value = _case_insensitive_value(mapping, key)

    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FortyGuardIntegrationError(
            f"FortyGuard stats_data is missing a numeric {key} value."
        )

    return float(value)


def _extract_temperature_stats(stats_data: Any) -> tuple[float, float, float]:
    if not isinstance(stats_data, dict):
        raise FortyGuardIntegrationError(
            "FortyGuard result is missing stats_data."
        )

    temperature_stats = _case_insensitive_value(stats_data, "Temperature_stats")

    if not isinstance(temperature_stats, dict):
        raise FortyGuardIntegrationError(
            "FortyGuard stats_data is missing Temperature_stats."
        )

    return (
        _required_number(temperature_stats, "Minimum"),
        _required_number(temperature_stats, "Maximum"),
        _required_number(temperature_stats, "Mean"),
    )


def _normalize_feature(feature: Any) -> dict[str, Any]:
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise FortyGuardIntegrationError(
            "FortyGuard map_data contains an invalid GeoJSON feature."
        )

    geometry = feature.get("geometry")
    properties = feature.get("properties")

    if not isinstance(geometry, dict) or geometry.get("type") != "Polygon":
        raise FortyGuardIntegrationError(
            "FortyGuard map_data contains a non-polygon feature."
        )

    if not isinstance(properties, dict):
        raise FortyGuardIntegrationError(
            "FortyGuard map_data contains a feature without properties."
        )

    temperature = properties.get(FORTYGUARD_TCM_PROPERTY)

    if isinstance(temperature, bool) or not isinstance(temperature, (int, float)):
        available_keys = sorted(str(key) for key in properties)
        key_description = ", ".join(available_keys) if available_keys else "none"
        raise FortyGuardIntegrationError(
            f"FortyGuard tcm property {FORTYGUARD_TCM_PROPERTY!r} is missing. "
            f"Available feature property keys: {key_description}."
        )

    normalized_properties = dict(properties)
    normalized_properties["temperature_c"] = float(temperature)
    normalized_properties["source"] = "fortyguard"

    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": normalized_properties,
    }


def _feature_centroid(feature: dict[str, Any]) -> tuple[float, float]:
    ring = feature["geometry"]["coordinates"][0]
    points = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    divisor = max(1, len(points))
    return (
        sum(float(point[0]) for point in points) / divisor,
        sum(float(point[1]) for point in points) / divisor,
    )


def _add_stable_cell_ids(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(
        enumerate(features),
        key=lambda entry: (
            -_feature_centroid(entry[1])[1],
            _feature_centroid(entry[1])[0],
            entry[0],
        ),
    )
    width = max(2, len(str(len(features))))
    ids = {original_index: f"FG-{rank:0{width}d}" for rank, (original_index, _) in enumerate(ordered, 1)}
    for index, feature in enumerate(features):
        feature["properties"]["cell_id"] = ids[index]
    return features


def _normalized_map_data(result: dict[str, Any]) -> tuple[list[Any], Any]:
    map_data = _case_insensitive_value(result, "map_data")
    stats_data = _case_insensitive_value(result, "stats_data")
    if not isinstance(map_data, dict) or map_data.get("type") != "FeatureCollection":
        raise FortyGuardIntegrationError(
            "FortyGuard result is missing a GeoJSON map_data FeatureCollection."
        )
    features = map_data.get("features")
    if not isinstance(features, list):
        raise FortyGuardIntegrationError(
            "FortyGuard map_data is missing its features array."
        )
    return features, stats_data


def normalize_fortyguard_heatmap(
    activity_id: str,
    result: Any,
    *,
    cached: bool,
) -> NormalizedTemperatureResult:
    if not isinstance(result, dict):
        raise FortyGuardIntegrationError(
            "FortyGuard completed without a usable result."
        )

    features, stats_data = _normalized_map_data(result)
    normalized_features = _add_stable_cell_ids([_normalize_feature(feature) for feature in features])
    minimum, maximum, mean = _extract_temperature_stats(stats_data)

    return NormalizedTemperatureResult(
        analysis_id=activity_id,
        cached=cached,
        summary=TemperatureSummary(
            cell_count=len(normalized_features),
            mean_temperature_c=mean,
            min_temperature_c=minimum,
            max_temperature_c=maximum,
        ),
        heatmap={
            "type": "FeatureCollection",
            "features": normalized_features,
        },
    )


def normalize_fortyguard_temporal(
    activity_id: str,
    result: Any,
    *,
    analytic_type: str,
    threshold_c: float | None,
    cached: bool,
) -> dict[str, Any]:
    if not isinstance(result, dict) or analytic_type not in TEMPORAL_PROPERTIES:
        raise FortyGuardIntegrationError("FortyGuard completed without a usable temporal result.")
    features, stats_data = _normalized_map_data(result)
    property_name = TEMPORAL_PROPERTIES[analytic_type]
    normalized_features: list[dict[str, Any]] = []
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            raise FortyGuardIntegrationError("FortyGuard map_data contains an invalid GeoJSON feature.")
        geometry = feature.get("geometry")
        properties = feature.get("properties")
        if not isinstance(geometry, dict) or geometry.get("type") != "Polygon" or not isinstance(properties, dict):
            raise FortyGuardIntegrationError("FortyGuard temporal map_data contains an invalid polygon feature.")
        value = properties.get(property_name)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            available = ", ".join(sorted(str(key) for key in properties)) or "none"
            raise FortyGuardIntegrationError(
                f"FortyGuard {analytic_type} property {property_name!r} is missing. Available feature property keys: {available}."
            )
        copied = dict(properties)
        copied["analysis_value"] = float(value)
        copied["source"] = "fortyguard"
        normalized_features.append({"type": "Feature", "geometry": geometry, "properties": copied})
    minimum, maximum, mean = _extract_temperature_stats(stats_data)
    return {
        "analysis_id": activity_id,
        "source": "fortyguard",
        "is_mock": False,
        "cached": cached,
        "analytic_type": analytic_type,
        "threshold_c": threshold_c if analytic_type in {"exceedance", "persistence"} else None,
        "units": "hour",
        "summary": {"cell_count": len(normalized_features), "minimum": minimum, "maximum": maximum, "mean": mean},
        "heatmap": {"type": "FeatureCollection", "features": _add_stable_cell_ids(normalized_features)},
    }


def normalize_fortyguard_result(
    activity_id: str,
    result: Any,
    *,
    analytic_type: str,
    threshold_c: float | None,
    cached: bool,
) -> dict[str, Any]:
    if analytic_type == "tcm":
        return normalize_fortyguard_heatmap(activity_id, result, cached=cached).model_dump(mode="json")
    return normalize_fortyguard_temporal(
        activity_id,
        result,
        analytic_type=analytic_type,
        threshold_c=threshold_c,
        cached=cached,
    )


def _find_case_insensitive(mapping: dict[str, Any], key: str) -> Any:
    return _case_insensitive_value(mapping, key)


def extract_activity_id(payload: dict[str, Any]) -> str:
    data = _find_case_insensitive(payload, "data")
    candidates = [payload]

    if isinstance(data, dict):
        candidates.insert(0, data)

    for candidate in candidates:
        activity_id = _find_case_insensitive(candidate, "activity_id")

        if isinstance(activity_id, str) and activity_id.strip():
            return activity_id.strip()

    raise FortyGuardIntegrationError(
        "FortyGuard submission did not return an activity ID."
    )


def extract_activity_state(payload: dict[str, Any]) -> tuple[str, Any]:
    data = _find_case_insensitive(payload, "data")
    container = data if isinstance(data, dict) else payload
    status = _find_case_insensitive(container, "status")

    if not isinstance(status, str):
        message = _find_case_insensitive(payload, "message")
        status = message if isinstance(message, str) else ""

    normalized_status = status.strip().casefold()

    if normalized_status == "processing":
        return "Processing", None

    if normalized_status == "completed":
        return "Completed", _find_case_insensitive(container, "result")

    if normalized_status == "failed":
        return "Failed", None

    raise FortyGuardIntegrationError(
        "FortyGuard returned an unknown activity status."
    )


class FortyGuardTemperatureService:
    def __init__(
        self,
        client: FortyGuardClient,
        *,
        cache_directory: Path = DEFAULT_CACHE_DIRECTORY,
    ) -> None:
        self.client = client
        self.cache_directory = cache_directory

    def _cache_path(self, request_id: str) -> Path:
        return self.cache_directory / f"{request_id}.json"

    def _read_cache(self, request_id: str) -> dict[str, Any] | None:
        path = self._cache_path(request_id)

        if not path.is_file():
            return None

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

        return payload if isinstance(payload, dict) else None

    def _write_cache(self, request_id: str, payload: dict[str, Any]) -> None:
        self.cache_directory.mkdir(parents=True, exist_ok=True)
        destination = self._cache_path(request_id)
        temporary = destination.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        temporary.replace(destination)

    def _find_request_id(
        self,
        activity_id: str,
        credential_scope: str,
    ) -> str | None:
        if not self.cache_directory.is_dir():
            return None

        for path in self.cache_directory.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue

            if (
                isinstance(payload, dict)
                and payload.get("activity_id") == activity_id
                and payload.get("credential_scope") == credential_scope
            ):
                request_id = payload.get("request_id")
                return request_id if isinstance(request_id, str) else None

        return None

    async def submit(self, request: FortyGuardSubmitRequest) -> dict[str, Any]:
        self.client.ensure_live_request_allowed()
        request_id = create_request_id(request, self.client.credential_scope())
        cached_entry = self._read_cache(request_id)

        if cached_entry and cached_entry.get("status") == "Completed":
            cached_result = cached_entry.get("result")

            if isinstance(cached_result, dict):
                result = dict(cached_result)
                result["cached"] = True
                return {
                    "status": "Completed",
                    "cached": True,
                    "request_id": request_id,
                    "result": result,
                }

        if cached_entry and cached_entry.get("status") == "Processing":
            existing_activity_id = cached_entry.get("activity_id")

            if isinstance(existing_activity_id, str) and existing_activity_id:
                return {
                    "status": "Processing",
                    "cached": False,
                    "resumed": True,
                    "activity_id": existing_activity_id,
                    "request_id": request_id,
                }

        upstream = await self.client.submit_heatmap(build_fortyguard_payload(request))
        activity_id = extract_activity_id(upstream)
        self._write_cache(
            request_id,
            {
                "request_id": request_id,
                "activity_id": activity_id,
                "credential_scope": self.client.credential_scope(),
                "status": "Processing",
                "request": {
                    "geometry": request.geometry.model_dump(mode="json"),
                    "date": request.date,
                    "time": request.time,
                    "granularity": request.granularity,
                    "analytic_type": request.analytic_type,
                    "threshold_c": request.threshold_c if request.analytic_type in {"exceedance", "persistence"} else None,
                },
            },
        )

        return {
            "status": "Processing",
            "cached": False,
            "activity_id": activity_id,
            "request_id": request_id,
        }

    async def status(self, activity_id: str) -> dict[str, Any]:
        try:
            upstream = await self.client.get_activity_status(activity_id)
        except FortyGuardAPIError as exc:
            if exc.status_code == 404:
                return {
                    "status": "Processing",
                    "retryable": True,
                    "activity_id": activity_id,
                }
            raise

        status, raw_result = extract_activity_state(upstream)

        if status == "Processing":
            return {
                "status": "Processing",
                "retryable": True,
                "activity_id": activity_id,
            }

        if status == "Failed":
            return {
                "status": "Failed",
                "retryable": False,
                "activity_id": activity_id,
                "error": "FortyGuard analysis failed.",
            }

        request_id = self._find_request_id(
            activity_id,
            self.client.credential_scope(),
        )
        previous = self._read_cache(request_id) if request_id else None
        request_metadata = previous.get("request", {}) if isinstance(previous, dict) else {}
        analytic_type = request_metadata.get("analytic_type", "tcm") if isinstance(request_metadata, dict) else "tcm"
        threshold_c = request_metadata.get("threshold_c") if isinstance(request_metadata, dict) else None
        normalized = normalize_fortyguard_result(
            activity_id, raw_result, analytic_type=analytic_type,
            threshold_c=float(threshold_c) if isinstance(threshold_c, (int, float)) else None,
            cached=False,
        )

        if request_id:
            previous = previous or {}
            previous.update(
                {
                    "request_id": request_id,
                    "activity_id": activity_id,
                    "status": "Completed",
                    "result": normalized,
                }
            )
            self._write_cache(request_id, previous)

        return {
            "status": "Completed",
            "cached": False,
            "activity_id": activity_id,
            "request_id": request_id,
            "result": normalized,
        }
