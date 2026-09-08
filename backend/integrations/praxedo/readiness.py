"""Non-secret Praxedo tenant readiness diagnostics.

The delivery connector deliberately uses stable BlueVector operation aliases
whose relative paths are supplied by the customer's official Praxedo contract.
This module inspects configuration without ever returning credentials, tenant
headers, or secret values.
"""

from __future__ import annotations

import json
import math
import os
from typing import Mapping
from urllib.parse import urlparse


# Stable BlueVector aliases. Their actual relative URLs remain tenant-specific.
DELIVERY_REQUIRED_READ_OPERATIONS = (
    "technician_list",
    "intervention_get",
    "article_list",
)
DELIVERY_REQUIRED_WRITE_OPERATIONS = (
    "work_report_write",
    "stock_movement_write",
)


def _present(value: str | None) -> bool:
    return bool(str(value or "").strip())


def _https_url(value: str | None) -> bool:
    if not _present(value):
        return False
    parsed = urlparse(str(value).strip())
    return parsed.scheme == "https" and bool(parsed.netloc)


def _json_object(raw: str | None) -> tuple[dict[str, str], bool]:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}, False
    if not isinstance(value, dict):
        return {}, False
    if not all(isinstance(key, str) and isinstance(item, str) for key, item in value.items()):
        return {}, False
    return value, True


def _positive_float(value: str | None, *, default: float) -> bool:
    raw = str(value).strip() if value is not None else str(default)
    try:
        parsed = float(raw)
    except ValueError:
        return False
    return math.isfinite(parsed) and parsed > 0


def _non_negative_int(value: str | None, *, default: int) -> bool:
    raw = str(value).strip() if value is not None else str(default)
    try:
        parsed = int(raw)
    except ValueError:
        return False
    return parsed >= 0


def _idempotency_header_valid(value: str | None) -> bool:
    if not _present(value):
        return False
    header = str(value).strip()
    return not any(char in header for char in "\r\n:")


def inspect_praxedo_readiness(
    env: Mapping[str, str] | None = None,
) -> dict[str, object]:
    """Return a safe delivery-readiness report for the current Praxedo config."""

    source = env if env is not None else os.environ
    base_url = source.get("PRAXEDO_BASE_URL")
    auth_mode = str(source.get("PRAXEDO_AUTH_MODE") or "basic").strip().lower()
    endpoints, endpoints_json_valid = _json_object(source.get("PRAXEDO_ENDPOINTS_JSON"))
    _headers, headers_json_valid = _json_object(source.get("PRAXEDO_HEADERS_JSON"))
    timeout_valid = _positive_float(source.get("PRAXEDO_TIMEOUT_SECONDS"), default=20.0)
    retries_valid = _non_negative_int(source.get("PRAXEDO_MAX_RETRIES"), default=2)

    auth_mode_valid = auth_mode in {"basic", "oauth2"}
    if auth_mode == "basic":
        auth_configured = _present(source.get("PRAXEDO_USERNAME")) and _present(
            source.get("PRAXEDO_PASSWORD")
        )
        token_url_valid = True
    elif auth_mode == "oauth2":
        auth_configured = all(
            _present(source.get(key))
            for key in ("PRAXEDO_CLIENT_ID", "PRAXEDO_CLIENT_SECRET", "PRAXEDO_TOKEN_URL")
        )
        token_url_valid = _https_url(source.get("PRAXEDO_TOKEN_URL"))
    else:
        auth_configured = False
        token_url_valid = False

    endpoint_aliases = sorted(
        key.strip()
        for key, value in endpoints.items()
        if key.strip() and str(value).strip()
    )
    configured_aliases = set(endpoint_aliases)
    missing_read = [
        operation
        for operation in DELIVERY_REQUIRED_READ_OPERATIONS
        if operation not in configured_aliases
    ]
    missing_write = [
        operation
        for operation in DELIVERY_REQUIRED_WRITE_OPERATIONS
        if operation not in configured_aliases
    ]

    base_url_valid = _https_url(base_url)
    transport_configured = (
        base_url_valid
        and auth_mode_valid
        and auth_configured
        and token_url_valid
        and endpoints_json_valid
        and headers_json_valid
        and timeout_valid
        and retries_valid
    )
    ready_for_read = transport_configured and not missing_read
    ready_for_write = transport_configured and not missing_write

    idempotency_header_present = _present(source.get("PRAXEDO_IDEMPOTENCY_HEADER"))
    idempotency_header_valid = _idempotency_header_valid(
        source.get("PRAXEDO_IDEMPOTENCY_HEADER")
    )

    missing: list[str] = []
    if not _present(base_url):
        missing.append("base_url")
    elif not base_url_valid:
        missing.append("base_url_https")
    if not auth_mode_valid:
        missing.append("auth_mode")
    elif not auth_configured:
        missing.append("auth_credentials")
    if auth_mode == "oauth2" and not token_url_valid:
        missing.append("oauth_token_url_https")
    if not endpoints_json_valid:
        missing.append("endpoints_json")
    if not headers_json_valid:
        missing.append("headers_json")
    if not timeout_valid:
        missing.append("timeout_seconds")
    if not retries_valid:
        missing.append("max_retries")
    if idempotency_header_present and not idempotency_header_valid:
        missing.append("idempotency_header")
    missing.extend(f"operation:{operation}" for operation in [*missing_read, *missing_write])

    return {
        "configured": transport_configured,
        "auth_mode": auth_mode if auth_mode_valid else "invalid",
        "base_url_https": base_url_valid,
        "endpoints_json_valid": endpoints_json_valid,
        "headers_json_valid": headers_json_valid,
        "timeout_valid": timeout_valid,
        "max_retries_valid": retries_valid,
        "configured_operation_aliases": endpoint_aliases,
        "required_read_operations": list(DELIVERY_REQUIRED_READ_OPERATIONS),
        "required_write_operations": list(DELIVERY_REQUIRED_WRITE_OPERATIONS),
        "missing_read_operations": missing_read,
        "missing_write_operations": missing_write,
        "ready_for_read": ready_for_read,
        "ready_for_write": ready_for_write,
        "idempotency_header_configured": idempotency_header_present,
        "idempotency_header_valid": idempotency_header_valid,
        "automated_write_replay_safe": (
            ready_for_write and idempotency_header_present and idempotency_header_valid
        ),
        "missing": missing,
        "secrets_exposed": False,
    }
