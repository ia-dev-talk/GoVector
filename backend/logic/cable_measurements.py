"""Automatic FTTH cable metrics and stock preview projection.

Cable entry and exit remain immutable field actions. When both observations
carry a physical meter/counter reading, GoVector computes the used length as
the absolute delta and aggregates the latest value of every logical cable
segment on the intervention.

Field capture is preview-only for stock. The durable stock ledger is committed
later by the final Agent validation path.

GPS is evidence only: cable length is never inferred from geographic distance.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Job, TechnicianFieldAction, User
from backend.logic.observed_cable_stock import record_observed_cable_consumption
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

CABLE_SEGMENT_KEYS = (
    "cable_segment_id",
    "segment_id",
    "cable_block_id",
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


def _text_value(payload: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        raw = payload.get(key)
        if raw is None:
            continue
        value = str(raw).strip()
        if value:
            return value.casefold()
    return None


def _cable_reference(payload: dict[str, Any]) -> str | None:
    return _text_value(payload, CABLE_REFERENCE_KEYS)


def _segment_id(payload: dict[str, Any]) -> str | None:
    return _text_value(payload, CABLE_SEGMENT_KEYS)


def _same_cable(
    current_payload: dict[str, Any],
    candidate_payload: dict[str, Any],
) -> bool:
    current_segment = _segment_id(current_payload)
    candidate_segment = _segment_id(candidate_payload)
    if current_segment is not None or candidate_segment is not None:
        return current_segment is not None and current_segment == candidate_segment

    current_ref = _cable_reference(current_payload)
    candidate_ref = _cable_reference(candidate_payload)
    if current_ref is None:
        # Do not silently pair an unreferenced endpoint with an explicitly
        # referenced cable: that can mix two reels/cables on the same job.
        return candidate_ref is None
    return candidate_ref == current_ref


def _safe_computed_length(payload: dict[str, Any]) -> float | None:
    raw = payload.get("computed_length_m")
    if raw is None or isinstance(raw, bool):
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return value


async def _existing_completed_segments(
    db: AsyncSession,
    *,
    job_id: int,
    technician_id: int,
) -> list[dict[str, Any]]:
    """Return only the newest computed payload for each stable cable segment."""

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

    latest_by_segment: dict[str, dict[str, Any]] = {}
    legacy_payloads: list[dict[str, Any]] = []
    for action in actions:
        payload = action.payload if isinstance(action.payload, dict) else {}
        if _safe_computed_length(payload) is None:
            continue
        segment = _segment_id(payload)
        if segment is None:
            legacy_payloads.append(payload)
        else:
            latest_by_segment[segment] = payload

    return [*legacy_payloads, *latest_by_segment.values()]


def _aggregate_segments(
    existing_payloads: list[dict[str, Any]],
    current_payload: dict[str, Any],
    current_length: float,
) -> tuple[float, dict[str, float], dict[str, float]]:
    total = current_length
    by_type: dict[str, float] = {}
    by_pose: dict[str, float] = {}

    def add(payload: dict[str, Any], length: float) -> None:
        nonlocal total
        type_code = str(
            payload.get("cable_type_code") or payload.get("cable_reference") or "AUTRE"
        ).strip()
        pose_code = str(payload.get("installation_mode_code") or "AUTRE").strip()
        by_type[type_code] = by_type.get(type_code, 0.0) + length
        by_pose[pose_code] = by_pose.get(pose_code, 0.0) + length

    # A client may resend/correct a logical segment with a stable segment id.
    # The newest payload is already selected in _existing_completed_segments;
    # the current segment itself is replaced by the calculation being applied.
    current_segment = _segment_id(current_payload)
    for existing in existing_payloads:
        if current_segment is not None and _segment_id(existing) == current_segment:
            continue
        length = _safe_computed_length(existing)
        if length is None:
            continue
        total += length
        add(existing, length)

    add(current_payload, current_length)
    return total, by_type, by_pose


async def apply_cable_endpoint_projection(
    db: AsyncSession,
    *,
    job_id: int,
    event_id: str,
    event_type: str,
    payload: dict[str, Any],
    current_user: User,
    occurred_at: datetime,
) -> float | None:
    """Project one paired cable segment into metrics and stock preview."""

    if event_type not in {"cable_entry", "cable_exit"}:
        return None

    current_meter = parse_meter_mark(payload)
    if current_meter is None:
        # GPS/photo-only cable endpoint observations remain valid.
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

    job = await db.scalar(select(Job).where(Job.id == job_id).with_for_update())
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

    # Prefer the chronologically matching endpoint. This supports delayed
    # offline sync where an exit can reach the server before its entry.
    if event_type == "cable_exit":
        statement = statement.where(
            TechnicianFieldAction.occurred_at <= occurred_at
        ).order_by(
            TechnicianFieldAction.occurred_at.desc(),
            TechnicianFieldAction.id.desc(),
        )
    else:
        statement = statement.where(
            TechnicianFieldAction.occurred_at >= occurred_at
        ).order_by(
            TechnicianFieldAction.occurred_at.asc(),
            TechnicianFieldAction.id.asc(),
        )

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

        existing = await _existing_completed_segments(
            db,
            job_id=job_id,
            technician_id=technician_id,
        )
        total, by_type, by_pose = _aggregate_segments(existing, payload, computed)
        job.cable_length_m = int(round(total))
        payload["job_cable_total_m"] = total
        payload["job_cable_totals_by_type"] = by_type
        payload["job_cable_totals_by_pose"] = by_pose

        item_id = payload.get("cable_item_id") or candidate_payload.get("cable_item_id")
        try:
            canonical_item_id = int(item_id)
        except (TypeError, ValueError):
            canonical_item_id = 0
        consumed_m = int(round(computed))
        if canonical_item_id > 0 and consumed_m > 0:
            # Explicit preview call. The ledger helper is a no-op until the
            # Agent's final validation invokes it with commit=True.
            await record_observed_cable_consumption(
                db,
                job_id=job_id,
                item_id=canonical_item_id,
                quantity_m=consumed_m,
                current_user=current_user,
                event_id=event_id,
                occurred_at=occurred_at,
                cable_reference=str(payload.get("cable_reference") or "").strip() or None,
                commit=False,
            )
            payload["stock_consumption_preview_m"] = consumed_m
            payload["stock_consumption_mode"] = "preview_until_agent_validation"

        await db.flush()
        return computed

    return None
