"""Configuration-driven Praxedo REST transport.

No Praxedo endpoint path is hard-coded here. Exact operation paths must be
copied from the customer's Praxedo API documentation into PRAXEDO_ENDPOINTS_JSON.
This prevents a staging/production tenant from being called with guessed API
contracts while still letting BlueVector ship the integration plumbing early.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import json
import os
from typing import Any, Mapping
from urllib.parse import urljoin, urlparse

import httpx


class PraxedoError(RuntimeError):
    """Safe integration failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class PraxedoConfig:
    base_url: str
    auth_mode: str
    endpoints: Mapping[str, str]
    username: str | None = None
    password: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    token_url: str | None = None
    scope: str | None = None
    timeout_seconds: float = 20.0
    max_retries: int = 2
    extra_headers: Mapping[str, str] = field(default_factory=dict)
    idempotency_header: str | None = None

    def __post_init__(self) -> None:
        parsed = urlparse(self.base_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("PRAXEDO_BASE_URL doit être une URL HTTPS absolue")
        mode = self.auth_mode.strip().lower()
        if mode not in {"basic", "oauth2"}:
            raise ValueError("PRAXEDO_AUTH_MODE doit valoir basic ou oauth2")
        if mode == "basic" and (not self.username or not self.password):
            raise ValueError("Identifiants Praxedo Basic manquants")
        if mode == "oauth2" and (
            not self.client_id or not self.client_secret or not self.token_url
        ):
            raise ValueError("Configuration OAuth2 Praxedo incomplète")
        if self.token_url:
            token = urlparse(self.token_url)
            if token.scheme != "https" or not token.netloc:
                raise ValueError("PRAXEDO_TOKEN_URL doit être une URL HTTPS absolue")
        for operation, path in self.endpoints.items():
            if not operation.strip() or not str(path).strip():
                raise ValueError("Chaque endpoint Praxedo doit avoir une clé et un chemin")
            parsed_path = urlparse(str(path))
            if parsed_path.scheme or parsed_path.netloc or str(path).startswith("//"):
                raise ValueError("Les endpoints Praxedo doivent être des chemins relatifs")
        if self.idempotency_header is not None:
            header = self.idempotency_header.strip()
            if not header or any(char in header for char in "\r\n:"):
                raise ValueError("PRAXEDO_IDEMPOTENCY_HEADER est invalide")

    @classmethod
    def from_env(cls) -> "PraxedoConfig":
        raw_endpoints = os.getenv("PRAXEDO_ENDPOINTS_JSON", "{}")
        raw_headers = os.getenv("PRAXEDO_HEADERS_JSON", "{}")
        try:
            endpoints = json.loads(raw_endpoints)
            headers = json.loads(raw_headers)
        except json.JSONDecodeError as exc:
            raise ValueError("Configuration JSON Praxedo invalide") from exc
        if not isinstance(endpoints, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in endpoints.items()
        ):
            raise ValueError("PRAXEDO_ENDPOINTS_JSON doit être un objet clé/chemin")
        if not isinstance(headers, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in headers.items()
        ):
            raise ValueError("PRAXEDO_HEADERS_JSON doit être un objet clé/valeur")
        return cls(
            base_url=os.getenv("PRAXEDO_BASE_URL", ""),
            auth_mode=os.getenv("PRAXEDO_AUTH_MODE", "basic"),
            endpoints=endpoints,
            username=os.getenv("PRAXEDO_USERNAME"),
            password=os.getenv("PRAXEDO_PASSWORD"),
            client_id=os.getenv("PRAXEDO_CLIENT_ID"),
            client_secret=os.getenv("PRAXEDO_CLIENT_SECRET"),
            token_url=os.getenv("PRAXEDO_TOKEN_URL"),
            scope=os.getenv("PRAXEDO_SCOPE"),
            timeout_seconds=float(os.getenv("PRAXEDO_TIMEOUT_SECONDS", "20")),
            max_retries=int(os.getenv("PRAXEDO_MAX_RETRIES", "2")),
            extra_headers=headers,
            idempotency_header=os.getenv("PRAXEDO_IDEMPOTENCY_HEADER"),
        )


class PraxedoClient:
    """Small async REST client with Basic/OAuth2 auth and bounded retries."""

    RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

    def __init__(
        self,
        config: PraxedoConfig,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.config = config
        self._external_client = client is not None
        self._client = client or httpx.AsyncClient(
            timeout=config.timeout_seconds,
            headers={"Accept": "application/json", **dict(config.extra_headers)},
        )
        self._access_token: str | None = None

    async def __aenter__(self) -> "PraxedoClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if not self._external_client:
            await self._client.aclose()

    def endpoint(self, operation: str, **path_params: Any) -> str:
        template = self.config.endpoints.get(operation)
        if template is None:
            raise PraxedoError(
                "operation_not_configured",
                f"Opération Praxedo non configurée : {operation}",
            )
        try:
            path = template.format_map({key: str(value) for key, value in path_params.items()})
        except KeyError as exc:
            raise PraxedoError(
                "endpoint_parameter_missing",
                f"Paramètre d'endpoint Praxedo manquant : {exc.args[0]}",
            ) from exc
        parsed = urlparse(path)
        if parsed.scheme or parsed.netloc or path.startswith("//"):
            raise PraxedoError("unsafe_endpoint", "Endpoint Praxedo non relatif")
        return urljoin(self.config.base_url.rstrip("/") + "/", path.lstrip("/"))

    async def _oauth_token(self, *, force_refresh: bool = False) -> str:
        if self._access_token and not force_refresh:
            return self._access_token
        assert self.config.token_url is not None
        assert self.config.client_id is not None
        assert self.config.client_secret is not None
        data: dict[str, str] = {"grant_type": "client_credentials"}
        if self.config.scope:
            data["scope"] = self.config.scope
        try:
            response = await self._client.post(
                self.config.token_url,
                data=data,
                auth=(self.config.client_id, self.config.client_secret),
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise PraxedoError("oauth_transport_error", str(exc)) from exc
        if response.status_code >= 400:
            raise PraxedoError(
                "oauth_rejected",
                "Authentification OAuth2 Praxedo refusée",
                status_code=response.status_code,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise PraxedoError("oauth_invalid_response", "Réponse OAuth2 Praxedo invalide") from exc
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not token or not isinstance(token, str):
            raise PraxedoError("oauth_token_missing", "Token OAuth2 Praxedo manquant")
        self._access_token = token
        return token

    async def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json", **dict(self.config.extra_headers)}
        if self.config.auth_mode.strip().lower() == "oauth2":
            headers["Authorization"] = f"Bearer {await self._oauth_token()}"
        return headers

    def _request_is_replay_safe(self, method: str, idempotency_key: str | None) -> bool:
        if method in self.SAFE_METHODS:
            return True
        return bool(
            idempotency_key
            and self.config.idempotency_header
            and str(self.config.idempotency_header).strip()
        )

    async def request(
        self,
        method: str,
        operation: str,
        *,
        path_params: Mapping[str, Any] | None = None,
        params: Mapping[str, Any] | None = None,
        json_body: Any | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        url = self.endpoint(operation, **dict(path_params or {}))
        method = method.upper().strip()
        headers = await self._headers()
        if idempotency_key and self.config.idempotency_header:
            # Enabled only when the tenant/API documentation confirms that the
            # chosen Praxedo operation supports such a header.
            headers[self.config.idempotency_header] = idempotency_key

        basic_auth = None
        if self.config.auth_mode.strip().lower() == "basic":
            basic_auth = (self.config.username or "", self.config.password or "")

        replay_safe = self._request_is_replay_safe(method, idempotency_key)
        attempts = max(0, int(self.config.max_retries)) + 1
        for attempt in range(attempts):
            try:
                response = await self._client.request(
                    method,
                    url,
                    params=params,
                    json=json_body,
                    headers=headers,
                    auth=basic_auth,
                    timeout=self.config.timeout_seconds,
                )
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if not replay_safe:
                    # For a non-idempotent write, the connection outcome alone
                    # cannot prove that Praxedo did not persist the request.
                    raise PraxedoError("indeterminate_write", str(exc)) from exc
                if attempt + 1 >= attempts:
                    raise PraxedoError("transport_error", str(exc)) from exc
                await asyncio.sleep(min(0.25 * (2**attempt), 2.0))
                continue

            if response.status_code == 401 and self.config.auth_mode.strip().lower() == "oauth2":
                # A 401 is a definite authentication rejection, so refreshing
                # the token and retrying does not duplicate a business write.
                if attempt + 1 < attempts:
                    headers["Authorization"] = f"Bearer {await self._oauth_token(force_refresh=True)}"
                    continue

            if response.status_code in self.RETRYABLE_STATUS_CODES:
                if not replay_safe:
                    raise PraxedoError(
                        "indeterminate_write",
                        f"Praxedo a répondu HTTP {response.status_code} à une écriture non idempotente",
                        status_code=response.status_code,
                    )
                if attempt + 1 < attempts:
                    retry_after = response.headers.get("Retry-After")
                    try:
                        delay = min(max(float(retry_after or 0), 0.0), 5.0)
                    except ValueError:
                        delay = 0.0
                    if delay <= 0:
                        delay = min(0.25 * (2**attempt), 2.0)
                    await asyncio.sleep(delay)
                    continue

            if response.status_code >= 400:
                raise PraxedoError(
                    "http_error",
                    f"Praxedo a répondu HTTP {response.status_code}",
                    status_code=response.status_code,
                )
            if response.status_code == 204 or not response.content:
                return None
            content_type = response.headers.get("content-type", "").lower()
            if "json" in content_type:
                try:
                    return response.json()
                except ValueError as exc:
                    raise PraxedoError(
                        "invalid_json_response", "Réponse JSON Praxedo invalide"
                    ) from exc
            return response.text

        raise PraxedoError("retry_exhausted", "Tentatives Praxedo épuisées")

    async def get(
        self,
        operation: str,
        *,
        path_params: Mapping[str, Any] | None = None,
        params: Mapping[str, Any] | None = None,
    ) -> Any:
        return await self.request(
            "GET", operation, path_params=path_params, params=params
        )

    async def post(
        self,
        operation: str,
        *,
        path_params: Mapping[str, Any] | None = None,
        json_body: Any | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        return await self.request(
            "POST",
            operation,
            path_params=path_params,
            json_body=json_body,
            idempotency_key=idempotency_key,
        )

    async def patch(
        self,
        operation: str,
        *,
        path_params: Mapping[str, Any] | None = None,
        json_body: Any | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        return await self.request(
            "PATCH",
            operation,
            path_params=path_params,
            json_body=json_body,
            idempotency_key=idempotency_key,
        )
