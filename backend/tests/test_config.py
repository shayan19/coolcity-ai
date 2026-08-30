from backend.app.config import get_allowed_origins


def test_allowed_origins_are_configurable_without_wildcards(monkeypatch) -> None:
    monkeypatch.setenv(
        "COOLCITY_ALLOWED_ORIGINS",
        "https://coolcity.example, https://api.example/, javascript:unsafe, *",
    )

    assert get_allowed_origins() == [
        "https://coolcity.example",
        "https://api.example",
    ]
