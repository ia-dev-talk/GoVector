"""Authoritative physical cable-drum custody and consumption rules."""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    CableDrum,
    CableDrumAssignment,
    CableDrumConsumption,
    Technician,
)
from backend.logic.job_visits import resolve_visit_for_technician
from backend.logic.technician_jobs import TechnicianJobMutationError


CABLE_TYPES = {"FO16", "FO64"}
INSTALLATION_MODES = {
    "SP": "SP — Sous PEHD / conduite / souterrain",
    "TR": "TR — Travée / Tronçon / aérien",
    "FSD": "FSD — Façade / Sous-Dalle / immeuble",
}
_MODE_ALIASES = {
    "CONDUITE": "SP", "SOUS_PEHD": "SP", "PEHD": "SP", "CONDUITE_PEHD": "SP",
    "AERIEN": "TR", "TRAVEE": "TR", "TRONCON": "TR",
    "FACADE": "FSD", "FACADE_IMMEUBLE": "FSD", "SOUS_DALLE": "FSD", "IMMEUBLE": "FSD",
}


def normalize_cable_type(value: Any) -> str:
    code = str(value or "").strip().upper().replace(" ", "")
    if code not in CABLE_TYPES:
        raise TechnicianJobMutationError(
            "rejected", "cable_type_unavailable", "Choisissez un câble FO16 ou FO64"
        )
    return code


def normalize_mode(value: Any) -> tuple[str, str]:
    raw = unicodedata.normalize("NFKD", str(value or ""))
    raw = "".join(char for char in raw if not unicodedata.combining(char))
    code = re.sub(r"[^A-Z0-9]+", "_", raw.upper()).strip("_")
    code = _MODE_ALIASES.get(code, code)
    if code not in INSTALLATION_MODES:
        raise TechnicianJobMutationError(
            "rejected", "invalid_installation_mode", "Choisissez SP, TR ou FSD"
        )
    return code, INSTALLATION_MODES[code]


def parse_mark(value: Any, *, label: str) -> float:
    try:
        mark = float(str(value).strip().replace(",", "."))
    except (TypeError, ValueError):
        mark = math.nan
    if not math.isfinite(mark) or mark < 0:
        raise TechnicianJobMutationError(
            "rejected", "invalid_cable_meter", f"{label} doit être un repère positif"
        )
    return mark


def validate_consumption_marks(start: Any, end: Any) -> tuple[float, float, float]:
    start_mark = parse_mark(start, label="Le départ")
    end_mark = parse_mark(end, label="L'arrivée")
    if end_mark >= start_mark:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_cable_consumption",
            "Le compteur doit décroître : l'arrivée doit être inférieure au départ",
        )
    return start_mark, end_mark, start_mark - end_mark


async def get_assigned_drum(
    db: AsyncSession, *, code: str, technician_id: int, lock: bool = False
) -> CableDrum:
    statement = select(CableDrum).where(CableDrum.code == str(code).strip())
    if lock:
        statement = statement.with_for_update()
    drum = await db.scalar(statement)
    if drum is None:
        raise TechnicianJobMutationError(
            "rejected", "cable_code_unknown", "Code câble inconnu : affectez la bobine depuis le Web"
        )
    if drum.status != "ACTIVE":
        raise TechnicianJobMutationError(
            "conflict", "cable_exhausted", f"Le câble {drum.code} est terminé ou épuisé"
        )
    if drum.assigned_technician_id != technician_id:
        raise TechnicianJobMutationError(
            "conflict", "cable_not_assigned", f"Le câble {drum.code} n'est pas affecté à ce technicien"
        )
    return drum


async def validate_capture_drum(
    db: AsyncSession, *, payload: dict[str, Any], technician_id: int
) -> CableDrum:
    code = str(payload.get("cable_code") or payload.get("drum_code") or "").strip()
    if not code:
        raise TechnicianJobMutationError(
            "rejected", "cable_code_required", "Le CODE unique de la bobine est obligatoire"
        )
    drum = await get_assigned_drum(db, code=code, technician_id=technician_id, lock=True)
    requested_type = normalize_cable_type(payload.get("cable_type_code") or drum.cable_type)
    if requested_type != drum.cable_type:
        raise TechnicianJobMutationError(
            "conflict", "cable_type_mismatch", "Le type choisi ne correspond pas à la bobine"
        )
    return drum


async def record_consumption(
    db: AsyncSession,
    *,
    event_id: str,
    job_id: int,
    technician_id: int,
    payload: dict[str, Any],
    occurred_at: datetime | None,
) -> CableDrumConsumption:
    existing = await db.scalar(
        select(CableDrumConsumption).where(CableDrumConsumption.event_id == event_id)
    )
    if existing is not None:
        return existing

    drum = await validate_capture_drum(db, payload=payload, technician_id=technician_id)
    start, end, quantity = validate_consumption_marks(
        payload.get("cable_entry_meter_m"), payload.get("cable_exit_meter_m")
    )
    mode, _label = normalize_mode(payload.get("installation_mode_code"))
    justification = str(payload.get("continuity_justification") or "").strip() or None
    if abs(float(drum.current_mark_m) - start) > 0.001 and not justification:
        raise TechnicianJobMutationError(
            "conflict",
            "cable_continuity_mismatch",
            f"Le prochain départ attendu pour {drum.code} est {drum.current_mark_m:g} m; corrigez ou justifiez l'écart",
        )

    visit = await resolve_visit_for_technician(
        db, job_id=job_id, technician_id=technician_id
    )
    consumption = CableDrumConsumption(
        event_id=event_id,
        drum_id=drum.id,
        job_id=job_id,
        visit_id=visit.id if visit is not None else None,
        technician_id=technician_id,
        cable_type=drum.cable_type,
        cable_code=drum.code,
        start_mark_m=start,
        end_mark_m=end,
        quantity_m=quantity,
        installation_mode=mode,
        continuity_justification=justification,
        occurred_at=occurred_at or datetime.now(timezone.utc),
    )
    drum.current_mark_m = end
    if end <= 0:
        drum.status = "EXHAUSTED"
        drum.assigned_technician_id = None
        active_assignment = await db.scalar(
            select(CableDrumAssignment)
            .where(CableDrumAssignment.drum_id == drum.id, CableDrumAssignment.ended_at.is_(None))
            .with_for_update()
        )
        if active_assignment is not None:
            active_assignment.ended_at = occurred_at or datetime.now(timezone.utc)
            active_assignment.end_reason = "Bobine épuisée au repère 0"
    db.add(consumption)
    await db.flush()
    payload.update({
        "cable_drum_id": drum.id,
        "cable_code": drum.code,
        "cable_reference": drum.code,
        "cable_type_code": drum.cable_type,
        "computed_length_m": quantity,
        "cable_current_mark_m": end,
        "cable_status": drum.status,
    })
    return consumption


async def assign_drum(
    db: AsyncSession, *, drum: CableDrum, technician_id: int, actor_user_id: int, reason: str | None
) -> CableDrum:
    technician = await db.get(Technician, technician_id)
    if technician is None:
        raise ValueError("Technicien introuvable")
    if drum.status != "ACTIVE":
        raise ValueError("Une bobine terminée ou épuisée ne peut pas être réaffectée")
    if drum.assigned_technician_id == technician_id:
        return drum
    active = await db.scalar(
        select(CableDrumAssignment)
        .where(CableDrumAssignment.drum_id == drum.id, CableDrumAssignment.ended_at.is_(None))
        .with_for_update()
    )
    now = datetime.now(timezone.utc)
    if active is not None:
        if not str(reason or "").strip():
            raise ValueError("Une justification est obligatoire pour transférer une bobine affectée")
        active.ended_at = now
        active.end_reason = str(reason).strip()
    drum.assigned_technician_id = technician_id
    db.add(CableDrumAssignment(
        drum_id=drum.id,
        technician_id=technician_id,
        assigned_by_user_id=actor_user_id,
        assigned_at=now,
    ))
    await db.flush()
    return drum
