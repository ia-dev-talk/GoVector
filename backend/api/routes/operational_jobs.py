"""Full operational create/edit contract used by the GoVector web editor.

The historical JobCreate/JobUpdate API remains untouched.  This endpoint exposes
all fields required by the delivery editor, including the operator spreadsheet
payload, while keeping the canonical sector foreign key mandatory for routing.
"""
from __future__ import annotations

import unicodedata
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.job_responses import job_response
from backend.auth.dependencies import require_office_orienteur
from backend.database.connection import get_db
from backend.database.models import JobPriority, JobStatus, JobType, User
from backend.logic import jobs as job_logic

router = APIRouter(prefix="/operational-jobs", tags=["Operational Jobs"])


def _fold(value: Any) -> str:
    raw = "" if value is None else str(value).strip()
    return "".join(
        c for c in unicodedata.normalize("NFKD", raw.upper()) if not unicodedata.combining(c)
    ).replace("-", " ").replace("_", " ")


_TYPE_ALIASES = {
    "INSTALLATION": JobType.INSTALLATION,
    "INSTALL": JobType.INSTALLATION,
    "DEPANNAGE": JobType.DEPANNAGE,
    "REPARATION": JobType.DEPANNAGE,
    "MAINTENANCE": JobType.MAINTENANCE,
    "SAV": JobType.SAV,
    "DECONNEXION": JobType.DISCONNECT,
    "DISCONNECT": JobType.DISCONNECT,
    "INSPECTION": JobType.INSPECTION,
    "INCIDENT": JobType.INCIDENT,
    "URGENCE": JobType.URGENCE,
    "MIGRATION": JobType.MIGRATION,
    "RACCORDEMENT": JobType.RACCORDEMENT,
    "AUDIT": JobType.AUDIT,
    "TUBAGE": JobType.TUBAGE,
    "NON JOIGNABLE": JobType.NON_JOIGNABLE,
    "ANNULATION": JobType.ANNULATION,
    "SPLITTER": JobType.SPLITTER,
    "CROQUIS RESEAU": JobType.CROQUIS_RESEAU,
}


def _job_type(value: Any, *, allow_empty: bool = True) -> JobType | None:
    folded = " ".join(_fold(value).split())
    if not folded and allow_empty:
        return None
    found = _TYPE_ALIASES.get(folded)
    if found is None:
        raise HTTPException(422, f"Type d'intervention non reconnu : {value}")
    return found


def _priority(value: Any) -> JobPriority:
    if isinstance(value, JobPriority):
        return value
    raw = str(value or "NORMALE").strip().upper()
    try:
        return JobPriority(raw)
    except ValueError as exc:
        raise HTTPException(422, f"Priorité invalide : {raw}") from exc


def _status(value: Any) -> JobStatus:
    if isinstance(value, JobStatus):
        return value
    raw = str(value or "pending").strip().lower()
    aliases = {
        "non affecte": "pending",
        "non affecté": "pending",
        "en attente": "pending",
        "en cours": "in_progress",
        "termine": "completed",
        "terminé": "completed",
        "annule": "cancelled",
        "annulé": "cancelled",
    }
    raw = aliases.get(raw, raw)
    try:
        return JobStatus(raw)
    except ValueError as exc:
        raise HTTPException(422, f"Statut invalide : {raw}") from exc


class OperationalJobPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_number: Optional[str] = Field(default=None, max_length=100)
    job_type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    operator: Optional[str] = Field(default=None, max_length=100)
    sector_id: Optional[int] = Field(default=None, gt=0)
    sector_raw: Optional[str] = Field(default=None, max_length=255)
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_phone: Optional[str] = Field(default=None, max_length=50)
    customer_email: Optional[str] = Field(default=None, max_length=200)
    service_address: Optional[str] = Field(default=None, max_length=500)
    service_city: Optional[str] = Field(default=None, max_length=100)
    service_zip: Optional[str] = Field(default=None, max_length=30)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    scheduled_date: Optional[datetime] = None
    time_slot_start: Optional[str] = None
    time_slot_end: Optional[str] = None
    estimated_duration: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = None
    notes: Optional[str] = None
    special_instructions: Optional[str] = None
    nro_raw: Optional[str] = None
    sro_raw: Optional[str] = None
    pbo_raw: Optional[str] = None
    pto_raw: Optional[str] = None
    splitter_raw: Optional[str] = None
    splitter_port_raw: Optional[int] = None
    optical_power_dbm: Optional[float] = None
    cable_length_m: Optional[int] = None
    ont_serial: Optional[str] = None
    router_serial: Optional[str] = None
    mac_address: Optional[str] = None
    wifi_box_serial: Optional[str] = None
    operational_data: dict[str, Any] = Field(default_factory=dict)


def _operational_data(document: OperationalJobPayload, current: Optional[dict] = None) -> dict:
    data = dict(current or {})
    data.update(document.operational_data or {})
    parsed_type = _job_type(document.job_type)
    if parsed_type is None:
        data["job_type_pending"] = True
        if document.job_type:
            data["source_job_type"] = document.job_type
    else:
        data.pop("job_type_pending", None)
        data["source_job_type"] = parsed_type.value
    return data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_operational_job(
    document: OperationalJobPayload,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_office_orienteur),
):
    parsed_type = _job_type(document.job_type)
    # The DB contract is historically non-null. Pending type is explicitly
    # marked in operational_data so UI/import surfaces never present the
    # compatibility placeholder as a decided Installation.
    persisted_type = parsed_type or JobType.INSTALLATION
    try:
        job = await job_logic.create_job(
            db,
            customer_name=document.customer_name,
            service_address=document.service_address,
            latitude=document.latitude,
            longitude=document.longitude,
            job_type=persisted_type,
            required_skills=[],
            job_number=document.job_number,
            customer_phone=document.customer_phone,
            customer_email=document.customer_email,
            service_city=document.service_city,
            service_zip=document.service_zip,
            priority=_priority(document.priority),
            scheduled_date=document.scheduled_date,
            time_slot_start=document.time_slot_start,
            time_slot_end=document.time_slot_end,
            estimated_duration=document.estimated_duration,
            description=document.description,
            notes=document.notes,
            special_instructions=document.special_instructions,
            operational_data=_operational_data(document),
            operator=document.operator,
            nro_raw=document.nro_raw,
            sro_raw=document.sro_raw,
            pbo_raw=document.pbo_raw,
            pto_raw=document.pto_raw,
            splitter_raw=document.splitter_raw,
            splitter_port_raw=document.splitter_port_raw,
            optical_power_dbm=document.optical_power_dbm,
            cable_length_m=document.cable_length_m,
            ont_serial=document.ont_serial,
            router_serial=document.router_serial,
            mac_address=document.mac_address,
            wifi_box_serial=document.wifi_box_serial,
            status=_status(document.status),
            sector_id=document.sector_id,
            sector_raw=document.sector_raw,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return await job_response(db, job)


@router.put("/{job_id}")
async def update_operational_job(
    job_id: int,
    document: OperationalJobPayload,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_office_orienteur),
):
    current = await job_logic.get_job(db, job_id)
    if current is None:
        raise HTTPException(404, "Intervention introuvable")

    changes = document.model_dump(exclude_unset=True)
    if "job_type" in changes:
        parsed_type = _job_type(changes.pop("job_type"))
        if parsed_type is not None:
            changes["job_type"] = parsed_type
    if "priority" in changes:
        changes["priority"] = _priority(changes["priority"])
    if "status" in changes:
        changes["status"] = _status(changes["status"])

    supplied_operational = "operational_data" in changes or "job_type" in document.model_fields_set
    if supplied_operational:
        changes["operational_data"] = _operational_data(
            document,
            current=getattr(current, "operational_data", None),
        )

    try:
        job = await job_logic.update_job(db, job_id, **changes)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if job is None:
        raise HTTPException(404, "Intervention introuvable")
    return await job_response(db, job)
