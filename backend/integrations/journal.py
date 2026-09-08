"""Idempotent journal helpers shared by external adapters."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.integration_models import (
    IntegrationExchange,
    IntegrationExternalReference,
)


class IntegrationConflict(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def canonical_payload_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
        default=str,
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def _advisory_lock_id(namespace: str) -> int:
    """Map an integration identity to a stable signed PostgreSQL bigint lock."""

    return int.from_bytes(
        sha256(namespace.encode("utf-8")).digest()[:8],
        byteorder="big",
        signed=True,
    )


async def _acquire_advisory_locks(db: AsyncSession, *namespaces: str) -> None:
    """Serialize create-if-absent decisions for the duration of the transaction.

    ``SELECT ... FOR UPDATE`` cannot lock a row that does not exist yet. Stable
    transaction-scoped advisory locks close that gap so concurrent workers see
    one deterministic receipt/reference instead of racing into a unique-key
    ``IntegrityError``. Locks are acquired in sorted numeric order to avoid
    deadlocks when two reference identities need to be protected together.
    """

    lock_ids = sorted({_advisory_lock_id(namespace) for namespace in namespaces})
    for lock_id in lock_ids:
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id)"),
            {"lock_id": lock_id},
        )


async def bind_external_reference(
    db: AsyncSession,
    *,
    system: str,
    entity_type: str,
    local_entity_id: int,
    external_id: str,
    meta_data: dict[str, Any] | None = None,
) -> IntegrationExternalReference:
    """Create or verify a stable local/external identity mapping.

    A local object may never silently switch to another Praxedo identifier and
    a Praxedo identifier may never be rebound to another BlueVector object.
    """

    system = system.strip().lower()
    entity_type = entity_type.strip().lower()
    external_id = external_id.strip()
    if not system or not entity_type or not external_id or local_entity_id <= 0:
        raise IntegrationConflict("invalid_external_reference", "Référence externe invalide")

    await _acquire_advisory_locks(
        db,
        f"integration-ref:local:{system}:{entity_type}:{local_entity_id}",
        f"integration-ref:external:{system}:{entity_type}:{external_id}",
    )

    local = await db.scalar(
        select(IntegrationExternalReference)
        .where(
            IntegrationExternalReference.system == system,
            IntegrationExternalReference.entity_type == entity_type,
            IntegrationExternalReference.local_entity_id == local_entity_id,
        )
        .with_for_update()
    )
    if local is not None:
        if local.external_id != external_id:
            raise IntegrationConflict(
                "local_reference_conflict",
                "L'entité BlueVector est déjà liée à un autre identifiant externe",
            )
        if meta_data:
            local.meta_data = {**(local.meta_data or {}), **meta_data}
        await db.flush()
        return local

    external = await db.scalar(
        select(IntegrationExternalReference)
        .where(
            IntegrationExternalReference.system == system,
            IntegrationExternalReference.entity_type == entity_type,
            IntegrationExternalReference.external_id == external_id,
        )
        .with_for_update()
    )
    if external is not None:
        if external.local_entity_id != local_entity_id:
            raise IntegrationConflict(
                "external_reference_conflict",
                "L'identifiant externe est déjà lié à une autre entité BlueVector",
            )
        return external

    reference = IntegrationExternalReference(
        system=system,
        entity_type=entity_type,
        local_entity_id=local_entity_id,
        external_id=external_id,
        meta_data=meta_data or {},
    )
    db.add(reference)
    await db.flush()
    return reference


async def find_external_reference(
    db: AsyncSession,
    *,
    system: str,
    entity_type: str,
    local_entity_id: int,
) -> IntegrationExternalReference | None:
    return await db.scalar(
        select(IntegrationExternalReference).where(
            IntegrationExternalReference.system == system.strip().lower(),
            IntegrationExternalReference.entity_type == entity_type.strip().lower(),
            IntegrationExternalReference.local_entity_id == local_entity_id,
        )
    )


async def reserve_exchange(
    db: AsyncSession,
    *,
    system: str,
    direction: str,
    operation: str,
    idempotency_key: str,
    payload: dict[str, Any],
    entity_type: str | None = None,
    local_entity_id: int | None = None,
    external_id: str | None = None,
    occurred_at: datetime | None = None,
) -> tuple[IntegrationExchange, bool]:
    """Reserve an idempotent exchange receipt safely under concurrency.

    Returns ``(exchange, created)``. Replays with the same key and identical
    payload return the existing receipt. Reusing the key for another payload is
    rejected before any external side effect can happen.
    """

    normalized_system = system.strip().lower()
    normalized_direction = direction.strip().lower()
    normalized_operation = operation.strip()
    normalized_key = idempotency_key.strip()
    if normalized_direction not in {"inbound", "outbound"}:
        raise IntegrationConflict("invalid_direction", "Direction d'intégration invalide")
    if not normalized_system or not normalized_operation or not normalized_key:
        raise IntegrationConflict("invalid_exchange", "Échange d'intégration incomplet")

    await _acquire_advisory_locks(
        db,
        f"integration-exchange:{normalized_system}:{normalized_direction}:{normalized_key}",
    )

    request_hash = canonical_payload_hash(payload)
    existing = await db.scalar(
        select(IntegrationExchange)
        .where(
            IntegrationExchange.system == normalized_system,
            IntegrationExchange.direction == normalized_direction,
            IntegrationExchange.idempotency_key == normalized_key,
        )
        .with_for_update()
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise IntegrationConflict(
                "idempotency_key_reused",
                "La clé d'idempotence existe déjà avec un contenu différent",
            )
        return existing, False

    exchange = IntegrationExchange(
        system=normalized_system,
        direction=normalized_direction,
        operation=normalized_operation,
        idempotency_key=normalized_key,
        entity_type=entity_type.strip().lower() if entity_type else None,
        local_entity_id=local_entity_id,
        external_id=external_id.strip() if external_id else None,
        request_hash=request_hash,
        payload=payload,
        status="pending",
        occurred_at=occurred_at,
    )
    db.add(exchange)
    await db.flush()
    return exchange, True


async def mark_exchange_result(
    db: AsyncSession,
    exchange: IntegrationExchange,
    *,
    status: str,
    http_status: int | None = None,
    error: str | None = None,
    response_meta: dict[str, Any] | None = None,
    next_attempt_at: datetime | None = None,
) -> IntegrationExchange:
    allowed = {"pending", "sending", "acknowledged", "retryable", "rejected"}
    if status not in allowed:
        raise IntegrationConflict("invalid_exchange_status", "Statut d'intégration invalide")

    exchange.attempts = int(exchange.attempts or 0) + 1
    exchange.status = status
    exchange.last_http_status = http_status
    exchange.last_error = error
    exchange.response_meta = response_meta or {}
    exchange.next_attempt_at = next_attempt_at if status == "retryable" else None
    exchange.processed_at = (
        datetime.now(timezone.utc)
        if status in {"acknowledged", "rejected"}
        else None
    )
    await db.flush()
    return exchange
