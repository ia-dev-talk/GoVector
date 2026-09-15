"""Intervention compatibility routes plus the office full editor contract.

The historic multipart completion route stays retired.  The editor endpoints are
for ADMIN/ORIENTEUR office users and expose persisted planning/business fields
without allowing workflow status or field evidence to be overwritten.
"""

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.errors import BusinessAPIError
from backend.api.job_responses import job_response
from backend.auth.dependencies import require_orienteur, require_technician
from backend.database.connection import get_db
from backend.database.models import (
    EquipmentType,
    JobPriority,
    JobType,
    User,
    UserRole,
)
from backend.logic import jobs as job_logic
from backend.logic.job_access import require_job_operations_access
from backend.logic.job_planning import job_estimated_duration_minutes
from backend.logic.job_sectors import resolve_sector_for_write
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)


router = APIRouter()


class InterventionEditorPatch(BaseModel):
    """All office-editable persisted fields; workflow/evidence is excluded."""

    model_config = ConfigDict(extra="forbid")

    job_type: Optional[JobType] = None
    customer_name: Optional[str] = Field(default=None, max_length=100)
    customer_phone: Optional[str] = Field(default=None, max_length=20)
    customer_email: Optional[str] = Field(default=None, max_length=100)
    service_address: Optional[str] = Field(default=None, max_length=255)
    service_city: Optional[str] = Field(default=None, max_length=100)
    service_zip: Optional[str] = Field(default=None, max_length=10)

    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    planned_location_source: Optional[str] = Field(default=None, max_length=32)
    planned_location_precision: Optional[str] = Field(default=None, max_length=32)
    route_criteria: Optional[str] = Field(default=None, max_length=50)
    sector_raw: Optional[str] = Field(default=None, max_length=100)
    sector_id: Optional[int] = Field(default=None, gt=0)

    required_skills: Optional[list[str]] = None
    priority: Optional[JobPriority] = None
    scheduled_date: Optional[datetime] = None
    time_slot_start: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    time_slot_end: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    estimated_duration: Optional[int] = Field(default=None, ge=15, le=480)

    description: Optional[str] = None
    notes: Optional[str] = None
    special_instructions: Optional[str] = None
    operator: Optional[str] = Field(default=None, max_length=20)
    client_organization_id: Optional[int] = Field(default=None, gt=0)

    nro: Optional[str] = Field(default=None, max_length=100)
    sro: Optional[str] = Field(default=None, max_length=100)
    pbo: Optional[str] = Field(default=None, max_length=100)
    pto: Optional[str] = Field(default=None, max_length=100)
    splitter: Optional[str] = Field(default=None, max_length=100)
    splitter_port: Optional[int] = None
    optical_power_dbm: Optional[float] = None
    cable_length_m: Optional[int] = Field(default=None, ge=0)
    ont_serial: Optional[str] = Field(default=None, max_length=100)
    router_serial: Optional[str] = Field(default=None, max_length=100)
    mac_address: Optional[str] = Field(default=None, max_length=100)
    wifi_box_serial: Optional[str] = Field(default=None, max_length=100)

    equipment_type: Optional[EquipmentType] = None
    serial_number: Optional[str] = Field(default=None, max_length=100)

    # Source-specific Excel/QGIS columns are kept here instead of being lost or
    # falsely promoted to first-class Job columns.
    operational_data: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_coherent_patch(self):
        coordinate_fields = {"latitude", "longitude"} & self.model_fields_set
        if len(coordinate_fields) == 1:
            raise ValueError("La latitude et la longitude doivent être modifiées ensemble.")
        if "job_type" in self.model_fields_set and self.job_type is None:
            raise ValueError("Le type d’intervention ne peut pas être vide.")
        if "priority" in self.model_fields_set and self.priority is None:
            raise ValueError("La priorité ne peut pas être vide.")
        if "required_skills" in self.model_fields_set and self.required_skills is None:
            self.required_skills = []
        if "operational_data" in self.model_fields_set and self.operational_data is None:
            self.operational_data = {}
        return self


_EDITOR_FIELD_MAPPING = {
    "job_type": "job_type",
    "customer_name": "customer_name",
    "customer_phone": "customer_phone",
    "customer_email": "customer_email",
    "service_address": "service_address",
    "service_city": "service_city",
    "service_zip": "service_zip",
    "latitude": "latitude",
    "longitude": "longitude",
    "planned_location_source": "planned_location_source",
    "planned_location_precision": "planned_location_precision",
    "route_criteria": "route_criteria",
    "sector_raw": "sector_raw",
    "sector_id": "sector_id",
    "required_skills": "required_skills",
    "priority": "priority",
    "scheduled_date": "scheduled_date",
    "time_slot_start": "time_slot_start",
    "time_slot_end": "time_slot_end",
    "estimated_duration": "estimated_duration",
    "description": "description",
    "notes": "notes",
    "special_instructions": "special_instructions",
    "operator": "operator",
    "client_organization_id": "client_organization_id",
    "nro": "nro_raw",
    "sro": "sro_raw",
    "pbo": "pbo_raw",
    "pto": "pto_raw",
    "splitter": "splitter_raw",
    "splitter_port": "splitter_port_raw",
    "optical_power_dbm": "optical_power_dbm",
    "cable_length_m": "cable_length_m",
    "ont_serial": "ont_serial",
    "router_serial": "router_serial",
    "mac_address": "mac_address",
    "wifi_box_serial": "wifi_box_serial",
    "equipment_type": "equipment_type",
    "serial_number": "serial_number",
    "operational_data": "operational_data",
}

_SECTOR_API_FIELDS = {"sector_id", "sector_raw", "route_criteria", "latitude", "longitude"}


async def _editor_payload(db: AsyncSession, job) -> dict[str, Any]:
    canonical = (await job_response(db, job)).model_dump(mode="json")
    canonical.update({
        "job_number": job.job_number,
        "mac_address": job.mac_address,
        "wifi_box_serial": job.wifi_box_serial,
        "equipment_type": job.equipment_type.value if job.equipment_type else None,
        "serial_number": job.serial_number,
        "operational_data": job.operational_data or {},
        "readonly_evidence": {
            "status": job.status.value if job.status else None,
            "validation_status": job.validation_status,
            "gps_latitude": job.gps_latitude,
            "gps_longitude": job.gps_longitude,
            "before_photo": job.before_photo,
            "after_photo": job.after_photo,
            "client_signature": job.client_signature,
            "completed_at": job.completed_at,
        },
    })
    return canonical


@router.get("/{job_id}/editor")
async def get_intervention_editor(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await job_logic.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)
    return await _editor_payload(db, job)


@router.patch("/{job_id}/editor")
async def update_intervention_editor(
    job_id: int,
    document: InterventionEditorPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await job_logic.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)

    changes = document.model_dump(exclude_unset=True)
    if current_user.role == UserRole.ORIENTEUR and "client_organization_id" in changes:
        requested_organization_id = changes.get("client_organization_id")
        if requested_organization_id != job.client_organization_id:
            raise HTTPException(
                status_code=403,
                detail="Seul un administrateur peut modifier l'entreprise cliente.",
            )
        # The full editor sends the current snapshot. Keeping the same client is
        # not a privilege escalation, so ignore the no-op field for ORIENTEUR.
        changes.pop("client_organization_id", None)

    final_latitude = changes.get("latitude", job.latitude)
    final_longitude = changes.get("longitude", job.longitude)
    if (final_latitude is None) != (final_longitude is None):
        raise HTTPException(422, "La latitude et la longitude doivent être fournies ensemble.")
    if final_latitude is None and (
        changes.get("planned_location_source") is not None
        or changes.get("planned_location_precision") is not None
    ):
        raise HTTPException(422, "La provenance de localisation nécessite des coordonnées.")

    sector_identity = None
    if _SECTOR_API_FIELDS.intersection(changes):
        route_label_changed = "route_criteria" in changes and "sector_raw" not in changes
        location_label_changed = bool({"sector_raw", "route_criteria"}.intersection(changes))
        explicit_sector_id = changes.get(
            "sector_id",
            None if location_label_changed else job.sector_id,
        )
        final_sector_raw = changes.get(
            "sector_raw",
            None if route_label_changed else job.sector_raw,
        )
        final_route_criteria = changes.get("route_criteria", job.route_criteria)
        try:
            sector_identity = await resolve_sector_for_write(
                db,
                sector_id=explicit_sector_id,
                sector_raw=final_sector_raw,
                route_criteria=final_route_criteria,
                latitude=final_latitude,
                longitude=final_longitude,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

        if route_label_changed and sector_identity is None:
            changes["sector_id"] = job.sector_id
            changes["sector_raw"] = job.sector_raw
        else:
            changes["sector_id"] = sector_identity.id if sector_identity is not None else None
            if sector_identity is not None and (
                route_label_changed or "sector_raw" not in changes
            ):
                changes["sector_raw"] = sector_identity.raw

    for api_name, value in changes.items():
        model_name = _EDITOR_FIELD_MAPPING.get(api_name)
        if model_name is None:
            continue
        setattr(job, model_name, value)

    if final_latitude is None:
        job.planned_location_source = None
        job.planned_location_precision = None

    if {"job_type", "estimated_duration", "time_slot_start", "time_slot_end"}.intersection(changes):
        job.estimated_duration = job_estimated_duration_minutes(job)

    job.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(job)
    return await _editor_payload(db, job)


@router.post(
    "/{job_id}/complete",
    deprecated=True,
    summary="Legacy multipart completion endpoint (retired)",
)
async def complete_intervention(
    job_id: int,
    comment: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    before_photo: UploadFile | None = File(None),
    after_photo: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Reject the retired V1 mutation after authenticating its job scope.

    Mobile V2 uses ``/tech/media`` and ``/tech/sync``. Keeping this route as a
    guarded 410 prevents an old client from silently writing unvalidated field
    data or client-supplied filenames.
    """
    del comment, latitude, longitude, before_photo, after_photo
    try:
        await require_assigned_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        http_status = (
            status.HTTP_404_NOT_FOUND
            if exc.code == "job_not_found"
            else status.HTTP_403_FORBIDDEN
        )
        raise BusinessAPIError(http_status, exc.code, exc.message) from exc

    raise BusinessAPIError(
        status.HTTP_410_GONE,
        "legacy_endpoint_retired",
        (
            "Cette route V1 est retirée. Utilisez les contrats technicien "
            "de média et de synchronisation."
        ),
    )
