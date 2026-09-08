"""Atomic state transitions for durable external exchange attempts."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.integration_models import IntegrationExchange
from backend.integrations.journal import IntegrationConflict


TERMINAL_EXCHANGE_STATUSES = frozenset({"acknowledged", "rejected", "indeterminate"})
ACTIONABLE_EXCHANGE_STATUSES = frozenset(
    {"pending", "sending", "retryable", "rejected", "indeterminate"}
)


async def claim_exchange_attempt(
    db: AsyncSession,
    *,
    exchange_id: int,
    now: datetime | None = None,
) -> IntegrationExchange:
    """Lock and claim one pending/due-retry exchange for an external attempt."""

    current_time = now or datetime.now(timezone.utc)
    exchange = await db.scalar(
        select(IntegrationExchange)
        .where(IntegrationExchange.id == exchange_id)
        .with_for_update()
    )
    if exchange is None:
        raise IntegrationConflict("exchange_not_found", "Échange d'intégration introuvable")
    if exchange.status not in {"pending", "retryable"}:
        raise IntegrationConflict(
            "exchange_not_claimable",
            f"Échange non exécutable depuis le statut {exchange.status}",
        )
    if (
        exchange.status == "retryable"
        and exchange.next_attempt_at is not None
        and exchange.next_attempt_at > current_time
    ):
        raise IntegrationConflict(
            "exchange_retry_not_due",
            "La prochaine tentative de cet échange n'est pas encore due",
        )

    exchange.status = "sending"
    exchange.attempts = int(exchange.attempts or 0) + 1
    exchange.last_http_status = None
    exchange.last_error = None
    exchange.response_meta = {}
    exchange.next_attempt_at = None
    exchange.processed_at = None
    await db.flush()
    return exchange


async def finish_exchange_attempt(
    db: AsyncSession,
    *,
    exchange_id: int,
    status: str,
    http_status: int | None = None,
    error: str | None = None,
    response_meta: dict | None = None,
    next_attempt_at: datetime | None = None,
) -> IntegrationExchange:
    """Persist one outcome without incrementing the already-counted attempt."""

    allowed = {"acknowledged", "retryable", "rejected", "indeterminate"}
    if status not in allowed:
        raise IntegrationConflict("invalid_exchange_status", "Statut d'intégration invalide")
    if status == "retryable" and next_attempt_at is None:
        raise IntegrationConflict(
            "retry_schedule_required",
            "Une tentative retryable doit avoir une prochaine échéance",
        )

    exchange = await db.scalar(
        select(IntegrationExchange)
        .where(IntegrationExchange.id == exchange_id)
        .with_for_update()
    )
    if exchange is None:
        raise IntegrationConflict("exchange_not_found", "Échange d'intégration introuvable")
    if exchange.status != "sending":
        raise IntegrationConflict(
            "exchange_not_sending",
            f"Impossible de terminer un échange au statut {exchange.status}",
        )

    exchange.status = status
    exchange.last_http_status = http_status
    exchange.last_error = error
    exchange.response_meta = response_meta or {}
    exchange.next_attempt_at = next_attempt_at if status == "retryable" else None
    exchange.processed_at = (
        datetime.now(timezone.utc)
        if status in TERMINAL_EXCHANGE_STATUSES
        else None
    )
    await db.flush()
    return exchange
