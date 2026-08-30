from dataclasses import replace
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import get_allowed_origins, get_fortyguard_settings
from backend.app.schemas import (
    FortyGuardSubmitRequest,
)
from backend.app.services.fortyguard_client import (
    FortyGuardAPIError,
    FortyGuardClient,
    FortyGuardConfigurationError,
    FortyGuardIntegrationError,
)
from backend.app.services.fortyguard_temperature import (
    FortyGuardTemperatureService,
)

app = FastAPI(title="CoolCity AI", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type", "X-FortyGuard-API-Key"],
)


def get_fortyguard_service(
    user_api_key: Annotated[
        str | None,
        Header(alias="X-FortyGuard-API-Key"),
    ] = None,
) -> FortyGuardTemperatureService:
    settings = get_fortyguard_settings()
    if user_api_key is not None:
        normalized_key = user_api_key.strip()
        if len(normalized_key) > 1024:
            raise HTTPException(status_code=400, detail="FortyGuard API key is too long.")
        if normalized_key:
            settings = replace(settings, api_key=normalized_key)
    return FortyGuardTemperatureService(FortyGuardClient(settings))


def raise_safe_fortyguard_error(error: Exception) -> None:
    if isinstance(error, FortyGuardAPIError):
        raise HTTPException(
            status_code=error.status_code,
            detail=error.safe_message,
        ) from error

    if isinstance(error, FortyGuardConfigurationError):
        raise HTTPException(status_code=403, detail=error.safe_message) from error

    if isinstance(error, FortyGuardIntegrationError):
        raise HTTPException(status_code=502, detail=error.safe_message) from error

    raise error


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "project": "CoolCity AI",
        "frontend_api_key": True,
    }


@app.post("/api/temperature/submit")
async def submit_temperature_analysis(
    request: FortyGuardSubmitRequest,
    service: FortyGuardTemperatureService = Depends(get_fortyguard_service),
) -> dict[str, Any]:
    try:
        return await service.submit(request)
    except (
        FortyGuardAPIError,
        FortyGuardConfigurationError,
        FortyGuardIntegrationError,
    ) as error:
        raise_safe_fortyguard_error(error)
        raise AssertionError("Unreachable")


@app.get("/api/temperature/status/{activity_id}")
async def get_temperature_analysis_status(
    activity_id: str,
    service: FortyGuardTemperatureService = Depends(get_fortyguard_service),
) -> dict[str, Any]:
    try:
        return await service.status(activity_id)
    except (
        FortyGuardAPIError,
        FortyGuardConfigurationError,
        FortyGuardIntegrationError,
    ) as error:
        raise_safe_fortyguard_error(error)
        raise AssertionError("Unreachable")
