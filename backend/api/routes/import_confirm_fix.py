"""Compatibility front door for Excel import type resolution.

Registered before the historical /import/confirm route.  It converts every
recognized source label to one of GoVector's 16 canonical types.  Missing or
unknown labels are kept as an explicit "type pending" state for the office
orienteur instead of rejecting the entire intervention.
"""
from __future__ import annotations

import unicodedata
from typing import Any

from fastapi import APIRouter, Depends

from backend.auth.dependencies import require_office_orienteur
from backend.database.models import JobType, User
from backend.api.routes import import_confirm as legacy

router = APIRouter()


def _fold(value: Any) -> str:
    raw = "" if value is None else str(value).strip().upper()
    raw = "".join(
        c for c in unicodedata.normalize("NFKD", raw) if not unicodedata.combining(c)
    )
    return " ".join(raw.replace("_", " ").replace("-", " ").split())


ALIASES = {
    "INSTALL": JobType.INSTALLATION.value,
    "INSTALLATION": JobType.INSTALLATION.value,
    "DEPANNAGE": JobType.DEPANNAGE.value,
    "REPARATION": JobType.DEPANNAGE.value,
    "MAINTENANCE": JobType.MAINTENANCE.value,
    "SAV": JobType.SAV.value,
    "DECONNEXION": JobType.DISCONNECT.value,
    "DISCONNECT": JobType.DISCONNECT.value,
    "INSPECTION": JobType.INSPECTION.value,
    "INCIDENT": JobType.INCIDENT.value,
    "URGENCE": JobType.URGENCE.value,
    "MIGRATION": JobType.MIGRATION.value,
    "RACCORDEMENT": JobType.RACCORDEMENT.value,
    "AUDIT": JobType.AUDIT.value,
    "TUBAGE": JobType.TUBAGE.value,
    "NON JOIGNABLE": JobType.NON_JOIGNABLE.value,
    "ANNULATION": JobType.ANNULATION.value,
    "SPLITTER": JobType.SPLITTER.value,
    "CROQUIS": JobType.CROQUIS_RESEAU.value,
    "CROQUIS RESEAU": JobType.CROQUIS_RESEAU.value,
}


def _only_type_problem(job) -> bool:
    warnings = [
        str(value).casefold()
        for value in [*(job.import_warnings or []), *(job.warnings or [])]
        if value
    ]
    if not warnings:
        return False
    return all(
        "type" in warning and "intervention" in warning
        for warning in warnings
    )


@router.post("/confirm")
async def confirm_import_with_pending_types(
    payload: legacy.ImportConfirmPayload,
    current_user: User = Depends(require_office_orienteur),
):
    for job in payload.jobs:
        source_type = job.job_type
        canonical = ALIASES.get(_fold(source_type))
        data = dict(job.operational_data or {})
        if canonical:
            job.job_type = canonical
            data.pop("job_type_pending", None)
            data["source_job_type"] = source_type or canonical
        else:
            # DB job_type is historically NOT NULL. INSTALLATION is used only
            # as an internal storage placeholder and is masked by the pending
            # marker on web surfaces until the orienteur decides.
            job.job_type = JobType.INSTALLATION.value
            data["job_type_pending"] = True
            data["source_job_type"] = source_type
            if job.valid is False and _only_type_problem(job):
                job.valid = True
            pending_warning = "Type d'intervention à décider par l'orienteur."
            if pending_warning not in job.import_warnings:
                job.import_warnings.append(pending_warning)
        job.operational_data = data

    return await legacy.confirm_import(payload, current_user)
