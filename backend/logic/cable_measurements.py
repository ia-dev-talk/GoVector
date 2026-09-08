"""Automatic FTTH cable-length projection from field entry/exit observations.

Cable entry and exit remain immutable technician field actions.  When both
observations carry a physical cable meter/counter reading, BlueVector computes
the used length as the absolute delta and projects it onto ``Job.cable_length_m``.

The module deliberately does *not* infer cable length from GPS distance: a
straight-line geographic distance is not a reliable representation of routed
cable length.  It also does not consume a stock item automatically until a
client/operator cable catalogue mapping is explicitly configured.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Job, TechnicianFieldAction, User
from backend.logic.technician_jobs import TechnicianJobMutationError


METER_READING_KEYS = (
    "meter_mark_m",
    "meter_reading_m",
    "cable_counter_m",
    "counter_m",
    "meter_mark",
)

CABLE_REFERENCE_KEYS = (
    "cable_reference",
    "cable_id",
    "reference",
    "cable_ref",
)


def parse_meter_mark(payload: dict[str, Any]) -> float | None:
    """Return a normalized non-negative meter mark, or ``None`` when absent."""

    raw: Any | None = None
    for key in METER_READING_KEYS:
        value = payload.get(key)
        if value is not None and (not isinstance(value, str) or value.strip()):
            raw = value
            break

    if raw is None:
        return None
    if isinstance(raw, bool):
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_cable_meter",
            "Le repère métrique du câble doit être numérique",
        )

    try:
        parsed = float(str(raw).strip().replace(",", "."))
    except (TypeError, ValueError) as exc:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_cable_meter",
            "Le repère métrique du câble doit être numérique",
        ) from exc

    if not math.isfinite(parsed) or parsed < 0:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_cable_meter",
            "Le repère métrique du câble doit être une valeur positive ou nulle",
        )
    return parsed


def calculate_cable_length_m(entry_meter_m: float, exit_meter_m: float) -> float:
    """Compute cable length from two physical meter/counter readings."""

    return abs(float(exit_meter_m) - float(entry_meter_m))


def _cable_reference(payload: dict[str, Any]) -> str | None:
    for key in CABLE_REFERENCE_KEYS:
        raw = payload.get(key)
        if raw is None:
            continue
        value = str(raw).strip()
        if value:
            return value.casefold()
    return None


def _same_cable(
    current_payload: dict[str, Any],
    candidate_payload: dict[str, Any],
) -> bool:
    current_ref = _cable_reference(current_payload)
    candidate_ref = _cable_reference(candidate_payload)
    if current_ref is None:
        # Do not silently pair an unreferenced endpoint with an explicitly
        # referenced cable: that can mix two reels/cables on the same job.
        return candidate_ref is None
    return candidate_ref == current_ref


async def apply_cable_endpoint_projection(
    db: AsyncSession,
    *,
    job_id: int,
    event_type: str,
    payload: dict[str, Any],
    current_user: User,
    occurred_at: datetime,
) -> float | None:
    """Project a cable entry/exit pair into the canonical job cable length.

    The caller executes this inside the technician-sync savepoint.  If the
    subsequent field-action validation fails, the job projection is rolled back
    with the event, preserving atomicity and idempotency.
    """

    if event_type not in {"cable_entry", "cable_exit"}:
        return None

    current_meter = parse_meter_mark(payload)
    if current_meter is None:
        # Existing GPS-only cable endpoint events remain valid and unchanged.
        return None

    payload["meter_mark_m"] = current_meter
    payload.setdefault("unit", "m")

    technician_id = current_user.technician_id
    if technician_id is None:
        raise TechnicianJobMutationError(
            "rejected",
            "technician_profile_missing",
            "Profil technicien manquant",
        )

    job = await db.scalar(
        select(Job).where(Job.id == job_id).with_for_update()
    )
    if job is None:
        raise TechnicianJobMutationError(
            "rejected",
            "job_not_found",
            "Intervention introuvable",
        )

    opposite_type = "cable_entry" if event_type == "cable_exit" else "cable_exit"
    statement = select(TechnicianFieldAction).where(
        TechnicianFieldAction.job_id == job_id,
        TechnicianFieldAction.technician_id == technician_id,
        TechnicianFieldAction.action_type == opposite_type,
    )

    # Prefer the chronologically matching endpoint.  This also supports delayed
    # offline sync where exit may reach the server before entry.
    if event_type == "cable_exit":
        statement = statement.where(
            TechnicianFieldAction.occurred_at <= occurred_at
        ).order_by(TechnicianFieldAction.occurred_at.desc(), TechnicianFieldAction.id.desc())
    else:
        statement = statement.where(
            TechnicianFieldAction.occurred_at >= occurred_at
        ).order_by(TechnicianFieldAction.occurred_at.asc(), TechnicianFieldAction.id.asc())

    candidates = (await db.execute(statement)).scalars().all()
    for candidate in candidates:
        candidate_payload = candidate.payload if isinstance(candidate.payload, dict) else {}
        if not _same_cable(payload, candidate_payload):
            continue
        candidate_meter = parse_meter_mark(candidate_payload)
        if candidate_meter is None:
            continue

        if event_type == "cable_entry":
            entry_meter = current_meter
            exit_meter = candidate_meter
        else:
            entry_meter = candidate_meter
            exit_meter = current_meter

        computed = calculate_cable_length_m(entry_meter, exit_meter)
        payload.update(
            {
                "cable_entry_meter_m": entry_meter,
                "cable_exit_meter_m": exit_meter,
                "computed_length_m": computed,
                "measurement_type": "cable_length",
                "calculation": "absolute_meter_delta",
                "paired_event_id": candidate.event_id,
            }
        )
        job.cable_length_m = int(round(computed))
        await db.flush()
        return computed

    return None
