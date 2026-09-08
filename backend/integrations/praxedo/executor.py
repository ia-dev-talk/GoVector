"""Durable Praxedo outbound execution on top of the integration journal.

This module deliberately accepts a *tenant-mapped* request body.  BlueVector's
canonical payloads must first be converted by a tenant adapter using the exact
Praxedo contract.  Sending the canonical shape directly would silently assume
field names that are not part of the customer's documented API.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.integration_models import IntegrationExchange
from backend.integrations.journal import mark_exchange_result, reserve_exchange
from backend.integrations.praxedo.client import PraxedoClient, PraxedoError


_TERMINAL = {"acknowledged", "rejected"}
_ALLOWED_METHODS = {"POST", "PATCH"}
_RETRYABLE_ERROR_CODES = {
    "transport_error",
    "retry_exhausted",
    "oauth_transport_error",
}


class PraxedoDispatchError(RuntimeError):
    """Raised for an unsafe or inconsistent local dispatch request."""


def retry_delay(attempts_completed: int) -> timedelta:
    """Bounded application-level retry delay after client-level retries finish."""

    attempts = max(1, int(attempts_completed))
    seconds = min(30 * (2 ** (attempts - 1)), 15 * 60)
    return timedelta(seconds=seconds)


def error_outcome(error: PraxedoError) -> str:
    """Classify a Praxedo failure as retryable or terminal for this receipt."""

    if error.code in _RETRYABLE_ERROR_CODES:
        return "retryable"
    if error.status_code in PraxedoClient.RETRYABLE_STATUS_CODES:
        return "retryable"
    # OAuth rejection, tenant validation errors, unsupported operations and
    # other deterministic 4xx/config failures require human/config correction.
    return "rejected"


def safe_response_meta(value: Any) -> dict[str, Any]:
    """Keep small, useful response metadata without assuming a tenant schema."""

    if value is None:
        return {"kind": "empty"}
    if isinstance(value, Mapping):
        keys = sorted(str(key) for key in value.keys())[:25]
        return {"kind": "json_object", "keys": keys}
    if isinstance(value, list):
        return {"kind": "json_array", "length": len(value)}
    return {"kind": type(value).__name__}


async def dispatch_outbound(
    db: AsyncSession,
    client: PraxedoClient,
    *,
    endpoint_operation: str,
    idempotency_key: str,
    mapped_payload: dict[str, Any],
    method: str = "POST",
    path_params: Mapping[str, Any] | None = None,
    entity_type: str | None = None,
    local_entity_id: int | None = None,
    external_id: str | None = None,
    occurred_at: datetime | None = None,
    now: datetime | None = None,
) -> IntegrationExchange:
    """Reserve and execute one tenant-mapped Praxedo request safely.

    Replaying the same idempotency key with the same request returns the same
    receipt.  Already acknowledged/rejected receipts are never sent again.
    Retryable receipts may be called again once ``next_attempt_at`` is due.
    """

    normalized_method = method.upper().strip()
    if normalized_method not in _ALLOWED_METHODS:
        raise PraxedoDispatchError("Only POST/PATCH Praxedo writes are allowed")
    if not isinstance(mapped_payload, dict):
        raise PraxedoDispatchError("Praxedo mapped payload must be a JSON object")

    receipt_payload = {
        "method": normalized_method,
        "endpoint_operation": endpoint_operation,
        "path_params": dict(path_params or {}),
        "body": mapped_payload,
    }
    exchange, _created = await reserve_exchange(
        db,
        system="praxedo",
        direction="outbound",
        operation=endpoint_operation,
        idempotency_key=idempotency_key,
        payload=receipt_payload,
        entity_type=entity_type,
        local_entity_id=local_entity_id,
        external_id=external_id,
        occurred_at=occurred_at,
    )

    if exchange.status in _TERMINAL:
        return exchange

    clock = now or datetime.now(timezone.utc)
    if exchange.status == "retryable" and exchange.next_attempt_at:
        due_at = exchange.next_attempt_at
        if due_at.tzinfo is None or due_at.utcoffset() is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        if due_at > clock:
            return exchange

    # Do not increment the business attempt count until the remote call has
    # produced an outcome.  ``mark_exchange_result`` increments exactly once.
    exchange.status = "sending"
    exchange.next_attempt_at = None
    await db.flush()

    try:
        if normalized_method == "POST":
            response = await client.post(
                endpoint_operation,
                path_params=path_params,
                json_body=mapped_payload,
                idempotency_key=idempotency_key,
            )
        else:
            response = await client.patch(
                endpoint_operation,
                path_params=path_params,
                json_body=mapped_payload,
                idempotency_key=idempotency_key,
            )
    except PraxedoError as exc:
        outcome = error_outcome(exc)
        next_attempt_at = None
        if outcome == "retryable":
            next_attempt_at = clock + retry_delay(int(exchange.attempts or 0) + 1)
        return await mark_exchange_result(
            db,
            exchange,
            status=outcome,
            http_status=exc.status_code,
            error=f"{exc.code}: {exc.message}",
            response_meta={"error_code": exc.code},
            next_attempt_at=next_attempt_at,
        )
    except Exception:
        # Programming errors must not be converted to business receipts.  Leave
        # the row as ``sending`` so operators can see an interrupted execution.
        raise

    return await mark_exchange_result(
        db,
        exchange,
        status="acknowledged",
        response_meta=safe_response_meta(response),
    )
