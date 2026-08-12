"""Canonical projections for structured technician measurements.

A field measurement remains an immutable field action, but selected governed
measurement types also update the canonical Job field used by completion policy
and web summaries. This prevents technicians from entering the same value twice.
No technical pass/fail threshold is invented here.
"""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import User
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)


def _finite_number(value: Any, *, label: str) -> float:
    if isinstance(value, bool):
        raise TechnicianJobMutationError(
            "rejected", "invalid_measurement", f"{label} doit être numérique"
        )
    try:
        parsed = float(str(value).strip().replace(",", "."))
    except (TypeError, ValueError) as exc:
        raise TechnicianJobMutationError(
            "rejected", "invalid_measurement", f"{label} doit être numérique"
        ) from exc
    if not math.isfinite(parsed):
        raise TechnicianJobMutationError(
            "rejected", "invalid_measurement", f"{label} doit être une valeur finie"
        )
    return parsed


async def apply_measurement_projection(
    db: AsyncSession,
    *,
    job_id: int,
    payload: dict[str, Any],
    current_user: User,
) -> None:
    measurement_type = str(payload.get("measurement_type") or "").strip().lower()
    if measurement_type not in {"optical_power", "cable_length"}:
        return

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    value = _finite_number(payload.get("value"), label="La mesure")

    if measurement_type == "optical_power":
        job.optical_power_dbm = value
        payload.setdefault("unit", "dBm")
    elif measurement_type == "cable_length":
        if value < 0:
            raise TechnicianJobMutationError(
                "rejected",
                "invalid_measurement",
                "La longueur de câble ne peut pas être négative",
            )
        job.cable_length_m = int(round(value))
        payload.setdefault("unit", "m")

    await db.flush()
