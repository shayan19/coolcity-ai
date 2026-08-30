from collections.abc import Mapping
import hashlib
from typing import Any

import httpx

from backend.app.config import FortyGuardSettings

REQUEST_TIMEOUT_SECONDS = 30.0

HTTP_ERROR_MESSAGES = {
    400: "The selected area or date/time is not accepted by FortyGuard.",
    401: "FortyGuard API key is missing or invalid.",
    403: "Your FortyGuard plan does not allow this request.",
    404: "The FortyGuard activity is not available yet.",
    422: "The selected area or date/time is not accepted by FortyGuard.",
    429: "FortyGuard rate limit reached. Please try again later.",
    500: "FortyGuard could not process the request.",
}


class FortyGuardError(Exception):
    """Base exception containing only safe, frontend-facing information."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.safe_message = message


class FortyGuardConfigurationError(FortyGuardError):
    pass


class FortyGuardAPIError(FortyGuardError):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


class FortyGuardIntegrationError(FortyGuardError):
    pass


class FortyGuardClient:
    def __init__(
        self,
        settings: FortyGuardSettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = REQUEST_TIMEOUT_SECONDS,
    ) -> None:
        self.settings = settings
        self.transport = transport
        self.timeout = timeout

    def credential_scope(self) -> str:
        """Return a non-reversible cache namespace without persisting the key."""
        if not self.settings.api_key:
            return ""
        return hashlib.sha256(self.settings.api_key.encode("utf-8")).hexdigest()

    def ensure_live_request_allowed(self) -> None:
        if not self.settings.api_key:
            raise FortyGuardConfigurationError(
                "FortyGuard API key is missing or invalid."
            )

    async def submit_heatmap(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        self.ensure_live_request_allowed()
        return await self._request("POST", "/v1/heatmap", json=dict(payload))

    async def get_activity_status(self, activity_id: str) -> dict[str, Any]:
        self.ensure_live_request_allowed()
        return await self._request("GET", f"/v1/status/{activity_id}")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers = {
            "api-key": self.settings.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(
                base_url=self.settings.base_url,
                headers=headers,
                timeout=self.timeout,
                transport=self.transport,
            ) as client:
                response = await client.request(method, path, json=json)
        except httpx.RequestError as exc:
            raise FortyGuardAPIError(
                503,
                "FortyGuard is temporarily unavailable. Please try again later.",
                retryable=True,
            ) from exc

        if not response.is_success:
            message = HTTP_ERROR_MESSAGES.get(
                response.status_code,
                "FortyGuard returned an unexpected response.",
            )
            raise FortyGuardAPIError(
                response.status_code,
                message,
                retryable=response.status_code == 404 or response.status_code >= 500,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise FortyGuardIntegrationError(
                "FortyGuard returned an invalid JSON response."
            ) from exc

        if not isinstance(payload, dict):
            raise FortyGuardIntegrationError(
                "FortyGuard returned an unexpected response structure."
            )

        return payload
