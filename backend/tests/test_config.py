from pathlib import Path

from backend.app.config import DEFAULT_CACHE_ROOT, get_allowed_origins, get_cache_root


def test_allowed_origins_are_configurable_without_wildcards(monkeypatch) -> None:
    monkeypatch.setenv(
        "COOLCITY_ALLOWED_ORIGINS",
        "https://coolcity.example, https://api.example/, javascript:unsafe, *",
    )

    assert get_allowed_origins() == [
        "https://coolcity.example",
        "https://api.example",
    ]


def test_cache_root_defaults_to_repository_cache(monkeypatch) -> None:
    monkeypatch.delenv("COOLCITY_CACHE_ROOT", raising=False)
    assert get_cache_root() == DEFAULT_CACHE_ROOT


def test_cache_root_can_use_host_writable_storage(monkeypatch) -> None:
    monkeypatch.setenv("COOLCITY_CACHE_ROOT", "/tmp/coolcity-cache")
    assert get_cache_root() == Path("/tmp/coolcity-cache")
