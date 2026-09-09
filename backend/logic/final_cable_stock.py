"""Finalize cable stock exactly once from the latest field observations.

Field cable captures are evidence/preview. The durable stock ledger is derived
from the latest completed observation for every logical cable segment when the
responsible Agent validates the intervention.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import TechnicianFieldAction, User
from backend.logic.observed_cable_stock import record_observed_cable_consumption
from backend.logic.technician_jobs import TechnicianJobMutationError


_SEGMENT_KEYS = ("cable_segment_id", "segment_id", "cable_block_id")


def _text(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        raw = payload.get(key)
        if raw is None:
            continue
        value = str(raw).strip()
        if value:
            return value
    return None


def _segment_key(action: TechnicianFieldAction, payload: dict[str, Any]) -> str:
    stable = _text(payload, *_SEGMENT_KEYS)
    if stable:
        return f"segment:{stable.casefold()}"

    # Legacy fallback. New mobile captures always carry a stable segment id,
    # but older data can still be finalized without merging unrelated pairs.
    paired = _text(payload, "paired_event_id")
    if paired:
        ids = sorted((str(action.event_id), paired))
        return f"pair:{ids[0]}:{ids[1]}"
    return f"event:{action.event_id}"


def _computed_length(payload: dict[str, Any]) -> int:
    raw = payload.get("computed_length_m")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0
    if value <= 0:
        return 0
    return int(round(value))


async def commit_final_cable_stock(
    db: AsyncSession,
    *,
    job_id: int,
    technician_id: int,
    actor_user_id: int,
    occurred_at: datetime | None = None,
) -> dict[str, int]:
    """Commit the latest value of every logical cable segment to stock.

    Corrections are naturally replacement-based: if SEG-1 was first measured
    at 100 m and later corrected to 92 m before Agent validation, only the
    newest SEG-1 payload is selected and only 92 m reaches the ledger.
    """

    actions = (
        await db.execute(
            select(TechnicianFieldAction)
            .where(
                TechnicianFieldAction.job_id == job_id,
                TechnicianFieldAction.technician_id == technician_id,
                TechnicianFieldAction.action_type.in_(("cable_entry", "cable_exit")),
            )
            .order_by(
                TechnicianFieldAction.occurred_at.asc(),
                TechnicianFieldAction.id.asc(),
            )
        )
    ).scalars().all()

    latest: dict[str, tuple[TechnicianFieldAction, dict[str, Any]]] = {}
    for action in actions:
        payload = action.payload if isinstance(action.payload, dict) else {}
        if _computed_length(payload) <= 0:
            continue
        latest[_segment_key(action, payload)] = (action, payload)

    if not latest:
        return {"segments": 0, "meters": 0}

    technician_user = await db.scalar(
        select(User)
        .where(
            User.technician_id == technician_id,
            User.is_active.is_(True),
        )
        .order_by(User.id.asc())
        .limit(1)
    )
    if technician_user is None:
        raise TechnicianJobMutationError(
            "rejected",
            "technician_user_missing",
            "Compte technicien actif introuvable pour finaliser le stock câble",
        )

    committed_segments = 0
    committed_m = 0
    finalized_at = occurred_at or datetime.now(timezone.utc)
    for key, (_action, payload) in latest.items():
        quantity_m = _computed_length(payload)
        raw_item_id = payload.get("cable_item_id")
        try:
            item_id = int(raw_item_id)
        except (TypeError, ValueError):
            item_id = 0
        if item_id <= 0 or quantity_m <= 0:
            continue

        await record_observed_cable_consumption(
            db,
            job_id=job_id,
            item_id=item_id,
            quantity_m=quantity_m,
            current_user=technician_user,
            event_id=f"final-{job_id}-{key}",
            occurred_at=finalized_at,
            cable_reference=_text(payload, "cable_reference", "cable_type_code"),
            commit=True,
            actor_user_id=actor_user_id,
        )
        committed_segments += 1
        committed_m += quantity_m

    await db.flush()
    return {
        "segments": committed_segments,
        "meters": committed_m,
    }
