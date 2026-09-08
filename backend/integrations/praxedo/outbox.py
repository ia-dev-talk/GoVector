"""Durable Praxedo outbound execution with fail-closed tenant contracts.

This module does not create business mappings.  A caller must first reserve an
``IntegrationExchange`` whose payload is already shaped for the customer's
reviewed Praxedo contract.  The executor then provides the delivery mechanics:
claim -> persist sending -> call Praxedo -> persist one unambiguous outcome.

Ambiguous non-idempotent writes are never replayed automatically.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
import re
from typing import Any, Mapping

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.integration_models import IntegrationExchange
from backend.integrations.journal import claim_exchange_attempt, finish_exchange_attempt
from backend.integrations.praxedo.client import PraxedoClient, PraxedoConfig, PraxedoError
from backend.integrations.praxedo.smoke import describe_response
from backend.integrations.praxedo.write_contract import (
    PraxedoWriteContract,
    PraxedoWriteContractError,
)


class PraxedoOutboxError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


_PARAM_KEY = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
_MAX_PARAMS = 30
_MAX_VALUE_LENGTH = 512
_RETRYABLE_HTTP = frozenset(PraxedoClient.RETRYABLE_STATUS_CODES)


def _safe_parameters(raw: Any, *, field: str) -> dict[str, str | int | float | bool]:
    if raw is None:
        return {}
    if not isinstance(raw, Mapping) or len(raw) > _MAX_PARAMS:
        raise PraxedoOutboxError("outbox_parameters_invalid", f"{field} invalide")
    result: dict[str, str | int | float | bool] = {}
    for key, value in raw.items():
        name = str(key)
        if not _PARAM_KEY.fullmatch(name):
            raise PraxedoOutboxError(
                "outbox_parameter_name_invalid",
                f"Nom de paramètre invalide dans {field}",
            )
        if isinstance(value, bool):
            result[name] = value
        elif isinstance(value, int):
            result[name] = value
        elif isinstance(value, float):
            if not math.isfinite(value):
                raise PraxedoOutboxError(
                    "outbox_parameter_value_invalid",
                    f"Valeur invalide dans {field}",
                )
            result[name] = value
        elif isinstance(value, str):
            if len(value) > _MAX_VALUE_LENGTH or any(char in value for char in "\r\n"):
                raise PraxedoOutboxError(
                    "outbox_parameter_value_invalid",
                    f"Valeur invalide dans {field}",
                )
            result[name] = value
        else:
            raise PraxedoOutboxError(
                "outbox_parameter_value_invalid",
                f"{field} accepte uniquement chaîne, nombre ou booléen",
            )
    return result


def prepare_outbound_request(
    exchange: IntegrationExchange,
    *,
    contract: PraxedoWriteContract,
    config: PraxedoConfig,
) -> dict[str, Any]:
    """Validate one reserved exchange without performing network or DB writes."""

    if str(exchange.system or "").strip().lower() != "praxedo":
        raise PraxedoOutboxError("outbox_system_invalid", "L'échange n'est pas destiné à Praxedo")
    if str(exchange.direction or "").strip().lower() != "outbound":
        raise PraxedoOutboxError("outbox_direction_invalid", "L'échange n'est pas sortant")
    if exchange.status not in {"pending", "retryable"}:
        raise PraxedoOutboxError(
            "outbox_status_not_executable",
            f"Statut d'échange non exécutable : {exchange.status}",
        )

    try:
        method = contract.method_for(exchange.operation)
    except PraxedoWriteContractError as exc:
        raise PraxedoOutboxError(exc.code, exc.message) from exc

    if exchange.operation not in config.endpoints:
        raise PraxedoOutboxError(
            "outbox_endpoint_not_configured",
            f"Endpoint Praxedo non configuré : {exchange.operation}",
        )

    payload = exchange.payload
    if not isinstance(payload, Mapping):
        raise PraxedoOutboxError("outbox_envelope_invalid", "Enveloppe Praxedo invalide")
    allowed_keys = {"contract_version", "body", "path_params", "params"}
    unknown = sorted(str(key) for key in payload.keys() if str(key) not in allowed_keys)
    if unknown:
        raise PraxedoOutboxError(
            "outbox_envelope_unknown_fields",
            "L'enveloppe Praxedo contient des champs non reconnus",
        )

    version = str(payload.get("contract_version") or "").strip()
    if version != contract.contract_version:
        raise PraxedoOutboxError(
            "outbox_contract_version_mismatch",
            "La version du payload ne correspond pas au contrat Praxedo confirmé",
        )
    body = payload.get("body")
    if not isinstance(body, Mapping):
        raise PraxedoOutboxError(
            "outbox_body_invalid",
            "Le body Praxedo tenant doit être un objet JSON explicitement mappé",
        )

    path_params = _safe_parameters(payload.get("path_params"), field="path_params")
    params = _safe_parameters(payload.get("params"), field="params")

    replay = exchange.status == "retryable" or int(exchange.attempts or 0) > 0
    idempotency_supported = bool(str(config.idempotency_header or "").strip())
    if replay and not idempotency_supported:
        raise PraxedoOutboxError(
            "automatic_replay_not_safe",
            "Un échange Praxedo déjà tenté ne peut pas être rejoué sans idempotence confirmée",
        )

    return {
        "method": method,
        "operation": exchange.operation,
        "path_params": path_params,
        "params": params,
        "body": dict(body),
        "idempotency_key": exchange.idempotency_key if idempotency_supported else None,
        "replay_safe": idempotency_supported,
    }


def classify_failure(error: PraxedoError, *, replay_safe: bool) -> str:
    """Map a transport failure to a durable state without guessing persistence."""

    if error.code in {"indeterminate_write", "invalid_json_response", "retry_exhausted"}:
        return "indeterminate"
    if error.code in {"transport_error", "oauth_transport_error"}:
        return "retryable" if replay_safe else "indeterminate"
    if error.status_code in _RETRYABLE_HTTP:
        return "retryable" if replay_safe else "indeterminate"
    return "rejected"


async def execute_exchange(
    db: AsyncSession,
    exchange_id: int,
    *,
    config: PraxedoConfig | None = None,
    contract: PraxedoWriteContract | None = None,
    client: PraxedoClient | None = None,
    retry_delay_seconds: int = 300,
) -> IntegrationExchange:
    """Execute exactly one reserved Praxedo exchange.

    The ``sending`` state is committed before the network call.  If the process
    dies after Praxedo receives a non-idempotent write but before BlueVector
    records the response, the receipt remains ``sending`` and is intentionally
    not eligible for an automatic replay.  Operators can inspect it manually.
    """

    if not isinstance(exchange_id, int) or isinstance(exchange_id, bool) or exchange_id <= 0:
        raise PraxedoOutboxError("outbox_exchange_id_invalid", "Identifiant d'échange invalide")
    if retry_delay_seconds < 0 or retry_delay_seconds > 86400:
        raise PraxedoOutboxError("outbox_retry_delay_invalid", "Délai de retry invalide")

    resolved_config = config or PraxedoConfig.from_env()
    resolved_contract = contract or PraxedoWriteContract.from_env()

    # Lock/read first so validation happens against the exact receipt that will
    # be claimed.  claim_exchange_attempt repeats the lock before state change.
    exchange = await db.get(IntegrationExchange, exchange_id)
    if exchange is None:
        raise PraxedoOutboxError("outbox_exchange_not_found", "Échange d'intégration introuvable")
    request = prepare_outbound_request(
        exchange,
        contract=resolved_contract,
        config=resolved_config,
    )

    claimed = await claim_exchange_attempt(db, exchange_id=exchange_id)
    await db.commit()  # persist `sending` before any external side effect

    owns_client = client is None
    resolved_client = client or PraxedoClient(resolved_config)
    try:
        response = await resolved_client.request(
            request["method"],
            request["operation"],
            path_params=request["path_params"],
            params=request["params"],
            json_body=request["body"],
            idempotency_key=request["idempotency_key"],
        )
    except PraxedoError as exc:
        state = classify_failure(exc, replay_safe=bool(request["replay_safe"]))
        next_attempt_at = None
        if state == "retryable":
            next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=retry_delay_seconds)
        result = await finish_exchange_attempt(
            db,
            exchange_id=claimed.id,
            status=state,
            http_status=exc.status_code,
            error=f"{exc.code}: {exc.message}"[:4000],
            response_meta={"error_code": exc.code},
            next_attempt_at=next_attempt_at,
        )
        await db.commit()
        return result
    finally:
        if owns_client:
            await resolved_client._client.aclose()

    result = await finish_exchange_attempt(
        db,
        exchange_id=claimed.id,
        status="acknowledged",
        response_meta={
            "response": describe_response(response),
            "business_values_exposed": False,
        },
    )
    await db.commit()
    return result
