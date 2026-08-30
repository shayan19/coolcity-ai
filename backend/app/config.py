import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ROOT_ENV_FILE = PROJECT_ROOT / ".env"
DEFAULT_FORTYGUARD_BASE_URL = "https://api.fortyguard.com"
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


@dataclass(frozen=True)
class FortyGuardSettings:
    api_key: str
    base_url: str


def _configured_value(name: str, file_values: dict[str, str | None]) -> str:
    value = os.environ.get(name)

    if value is None:
        value = file_values.get(name)

    return (value or "").strip()


def get_fortyguard_settings() -> FortyGuardSettings:
    """Read server-only FortyGuard settings from the root environment."""
    file_values = dict(dotenv_values(ROOT_ENV_FILE))
    base_url = _configured_value("FORTYGUARD_BASE_URL", file_values)

    return FortyGuardSettings(
        api_key=_configured_value("FORTYGUARD_API_KEY", file_values),
        base_url=(base_url or DEFAULT_FORTYGUARD_BASE_URL).rstrip("/"),
    )


def get_allowed_origins() -> list[str]:
    """Return explicitly configured browser origins for the public backend."""
    file_values = dict(dotenv_values(ROOT_ENV_FILE))
    configured = _configured_value("COOLCITY_ALLOWED_ORIGINS", file_values)
    if not configured:
        return list(DEFAULT_ALLOWED_ORIGINS)

    origins = [origin.strip().rstrip("/") for origin in configured.split(",")]
    return [origin for origin in origins if origin.startswith(("http://", "https://"))]
