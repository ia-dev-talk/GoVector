"""
Confirm Excel import — persist parsed jobs to PostgreSQL.
Uses a single SQL transaction with full rollback on error.
"""
import logging
import math
import re
import time
import unicodedata
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user
from backend.config import get_settings
from backend.database.connection import AsyncSessionLocal
from backend.database.models import (
    ClientOrganization,
    Job,
    JobPriority,
    JobStatus,
    JobType,
    Sector,
    User,
    UserRole,
)
from backend.logic import jobs as job_logic
from backend.services.excel.import_history_service import ImportHistoryService

logger = logging.getLogger(__name__)

router = APIRouter()

RELIABLE_GPS_SOURCES = {
    "GPS_PCO",
    "GPS_DERIVATION",
    "GPS_SPLITTER",
    "geocoded",
}


def _normalize_sector_name(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return ""

    text = str(value).strip()
    if not text:
        return ""

    normalized = unicodedata.normalize(
        "NFKD",
        text,
    )
    without_accents = "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )
    folded = without_accents.casefold()
    separated = re.sub(
        r"[\W_]+",
        " ",
        folded,
        flags=re.UNICODE,
    )

    return " ".join(separated.split())


def _build_sector_index(
    sectors: list[tuple[int, str]],
) -> dict[str, list[int]]:
    index: dict[str, list[int]] = {}

    for sector_id, sector_name in sectors:
        normalized_name = _normalize_sector_name(
            sector_name
        )
        if not normalized_name:
            continue

        index.setdefault(
            normalized_name,
            [],
        ).append(sector_id)

    return index


def _resolve_sector(
    item: dict,
    sector_index: dict[str, list[int]],
) -> None:
    sector_raw = item.get("sector_raw")
    normalized_name = _normalize_sector_name(
        sector_raw
    )

    item["sector_id"] = None

    if not normalized_name:
        return

    matches = sector_index.get(
        normalized_name,
        [],
    )

    if len(matches) == 1:
        item["sector_id"] = matches[0]
        return

    # Operational files often contain a city prefix (e.g. "Casablanca Hay
    # Hassani"). Resolve only when one known sector is unambiguously embedded;
    # never guess between multiple sectors.
    embedded = [
        (sector_name, ids)
        for sector_name, ids in sector_index.items()
        if sector_name and sector_name in normalized_name and len(ids) == 1
    ]
    if embedded:
        longest = max(len(name) for name, _ in embedded)
        strongest = [ids[0] for name, ids in embedded if len(name) == longest]
        if len(set(strongest)) == 1:
            item["sector_id"] = strongest[0]
            return

    if not matches:
        warning = (
            "Secteur Excel introuvable dans "
            f"FieldOpt : {sector_raw}."
        )
    else:
        warning = (
            "Secteur Excel ambigu dans "
            f"FieldOpt : {sector_raw}."
        )

    warnings = list(
        item.get("import_warnings") or []
    )
    if warning not in warnings:
        warnings.append(warning)

    item["import_warnings"] = warnings


class ImportJobItem(BaseModel):
    """A single job dict from the validated preview."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="ignore",
    )

    job_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    service_address: Optional[str] = None
    service_city: Optional[str] = None
    service_zip: Optional[str] = None
    sector_raw: Optional[str] = None
    latitude: Optional[Any] = None
    longitude: Optional[Any] = None
    gps_source: Optional[str] = None
    import_warnings: List[str] = Field(default_factory=list)
    job_type: Optional[str] = None
    required_skills: Optional[List[str]] = None
    route_criteria: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    scheduled_date: Optional[str] = None
    assigned_technician_name: Optional[str] = None
    notes: Optional[str] = None
    description: Optional[str] = None
    operator: Optional[str] = None
    nro: Optional[str] = None
    sro: Optional[str] = None
    pbo: Optional[str] = None
    pto: Optional[str] = None
    splitter: Optional[str] = None
    splitter_port: Optional[int] = None
    estimated_duration: Optional[int] = None
    equipment_type: Optional[str] = None
    serial_number: Optional[str] = None
    import_id: Optional[str] = Field(
        default=None,
        alias="_import_id",
    )
    meta: Optional[dict] = Field(
        default=None,
        alias="_meta",
    )
    valid: Optional[bool] = Field(
        default=None,
        alias="_valid",
    )
    selected: Optional[bool] = Field(
        default=None,
        alias="_selected",
    )
    warnings: List[str] = Field(
        default_factory=list,
        alias="_warnings",
    )


class ImportConfirmPayload(BaseModel):
    jobs: List[ImportJobItem] = Field(default_factory=list)
    skip_duplicates: bool = True
    mode: str = Field(default="create", pattern="^(create|update|ignore)$")
    """Import mode: create (skip existing), update (overwrite existing), ignore (skip all duplicates)."""


def _validate_reliable_coordinates(
    item: dict,
) -> tuple[Optional[float], Optional[float]]:
    error_message = (
        "Aucune coordonnée GPS fiable disponible."
    )

    latitude = item.get("latitude")
    longitude = item.get("longitude")

    # An address-only dossier is legitimate. Untrusted or missing coordinates
    # remain NULL until geocoding or a field observation supplies a reliable fix.
    if item.get("gps_source") not in RELIABLE_GPS_SOURCES:
        return None, None

    if (
        latitude is None
        or longitude is None
        or isinstance(latitude, bool)
        or isinstance(longitude, bool)
    ):
        raise ValueError(error_message)

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        raise ValueError(error_message)

    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not -90 <= latitude <= 90
        or not -180 <= longitude <= 180
    ):
        raise ValueError(error_message)

    return latitude, longitude


@router.post("/confirm")
async def confirm_import(
    payload: ImportConfirmPayload,
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active or current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès administrateur requis.",
        )

    jobs_data = payload.jobs

    if not jobs_data:
        raise HTTPException(
            status_code=400,
            detail="Aucune intervention à importer.",
        )

    settings = get_settings()

    # Filter only selected jobs
    selected = [
        job
        for job in jobs_data
        if job.selected is not False
    ]

    if not selected:
        return {
            "success": True,
            "created": 0,
            "updated": 0,
            "ignored": 0,
            "errors": [],
            "message": "Aucune intervention sélectionnée.",
        }

    start_time = time.time()

    async with AsyncSessionLocal() as session:
        try:
            result = await _persist_jobs(
                db=session,
                items=[
                    job.model_dump(
                        exclude_none=True,
                        by_alias=True,
                    )
                    for job in selected
                ],
                mode=payload.mode,
                skip_duplicates=payload.skip_duplicates,
                batch_size=settings.IMPORT_BATCH_SIZE,
            )

            # Log import history
            operator = None
            filename = "multi-file-import"
            for j in selected:
                if j.operator:
                    operator = j.operator
                if j.meta and j.meta.get("sheet"):
                    filename = f"{j.meta.get('sheet')}-import"

            await ImportHistoryService.log_import(
                db=session,
                filename=filename,
                operator=operator,
                file_count=1,
                jobs_created=result["created"],
                jobs_updated=result["updated"],
                jobs_ignored=result["ignored"],
                errors_count=len(result["errors"]),
                duration_seconds=time.time() - start_time,
                logs={
                    "errors": result["errors"],
                    "total_jobs": len(selected),
                    "planning": result["planning"],
                },
            )

            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Import transaction failed, full rollback")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Échec de l'import — transaction annulée.",
            )

    return {
        "success": len(result["errors"]) == 0,
        "created": result["created"],
        "updated": result["updated"],
        "ignored": result["ignored"],
        "errors": result["errors"],
        "planning": result["planning"],
        "message": (
            f"{result['created']} création(s), "
            f"{result['updated']} mise(s) à jour, "
            f"{result['ignored']} ignoré(s)."
        ),
    }


async def _persist_jobs(
    db: AsyncSession,
    items: List[dict],
    mode: str = "create",
    skip_duplicates: bool = True,
    batch_size: int = 100,
) -> dict:
    """
    Persist validated job dicts to PostgreSQL inside a single transaction.
    Uses create_job() for each record to ensure consistency.
    """
    created = 0
    updated = 0
    ignored = 0
    errors: list[dict] = []
    planning_dates: dict[str, int] = {}
    unscheduled = 0

    def track_planning(job: Job) -> None:
        nonlocal unscheduled
        if job.scheduled_date is None:
            unscheduled += 1
            return
        date_key = job.scheduled_date.date().isoformat()
        planning_dates[date_key] = planning_dates.get(date_key, 0) + 1

    sector_result = await db.execute(
        select(
            Sector.id,
            Sector.name,
        ).where(
            Sector.is_active.is_(True)
        )
    )
    sector_rows = [
        (
            sector_id,
            sector_name,
        )
        for sector_id, sector_name
        in sector_result.all()
    ]
    sector_index = _build_sector_index(
        sector_rows
    )

    organizations = (
        await db.execute(
            select(ClientOrganization).where(ClientOrganization.is_active.is_(True))
        )
    ).scalars().all()
    organization_candidates: dict[str, list[int]] = {}
    for organization in organizations:
        for value in (organization.code, organization.operator):
            key = _normalize_sector_name(value)
            if key:
                organization_candidates.setdefault(key, []).append(organization.id)

    def resolve_client_organization(item: dict) -> None:
        key = _normalize_sector_name(item.get("operator"))
        matches = list(dict.fromkeys(organization_candidates.get(key, []))) if key else []
        if len(matches) == 1:
            item["_client_organization_id"] = matches[0]

    # Pre-load existing job numbers for duplicate detection
    existing_numbers: set[str] = set()
    if skip_duplicates:
        result = await db.execute(
            select(Job.job_number).where(Job.job_number.isnot(None))
        )
        existing_numbers = {v for v in result.scalars() if v}

    # Pre-load existing jobs keyed by job_number for update mode
    existing_jobs_map: dict[str, Job] = {}
    if mode == "update":
        result = await db.execute(
            select(Job).where(Job.job_number.isnot(None))
        )
        for job in result.scalars():
            if job.job_number:
                existing_jobs_map[job.job_number] = job

    for index, item in enumerate(items):
        job_number = item.get("job_number")

        try:
            resolve_client_organization(item)
            # --- Duplicate detection ---
            if skip_duplicates and job_number and job_number in existing_numbers:
                if mode == "ignore":
                    ignored += 1
                    continue
                elif mode == "update" and job_number in existing_jobs_map:
                    # Update existing job
                    _resolve_sector(
                        item,
                        sector_index,
                    )
                    existing = existing_jobs_map[job_number]
                    latitude, longitude = (
                        _validate_reliable_coordinates(item)
                    )
                    if item.get("_valid") is False:
                        raise ValueError(
                            "Ligne invalide selon la prévisualisation."
                        )
                    item["latitude"] = latitude
                    item["longitude"] = longitude
                    async with db.begin_nested():
                        await _update_job_from_dict(db, existing, item)
                        await db.flush()
                    updated += 1
                    track_planning(existing)
                    continue
                else:
                    # create mode: skip
                    ignored += 1
                    continue

            # --- Create new job ---
            _resolve_sector(
                item,
                sector_index,
            )
            async with db.begin_nested():
                job = await _create_job_from_dict(db, item)
            created += 1
            track_planning(job)

            if job and job.job_number:
                existing_numbers.add(job.job_number)

        except Exception as exc:
            logger.warning("Row %d failed: %s", index, exc)
            errors.append({
                "index": index,
                "row": item.get("_meta", {}).get(
                    "row",
                    index + 2,
                ),
                "job_number": job_number,
                "error": str(exc),
                "warnings": item.get("import_warnings") or [],
            })

    return {
        "created": created,
        "updated": updated,
        "ignored": ignored,
        "errors": errors,
        "planning": {
            "dates": dict(sorted(planning_dates.items())),
            "unscheduled": unscheduled,
            "first_scheduled_date": min(planning_dates) if planning_dates else None,
        },
    }


async def _create_job_from_dict(db: AsyncSession, item: dict) -> Job:
    """Create a Job from an import dict using create_job()."""
    from datetime import datetime

    job_type_str = item.get("job_type", "INSTALLATION")
    try:
        job_type = JobType(job_type_str)
    except ValueError:
        job_type = JobType.INSTALLATION

    priority_str = item.get("priority", "NORMALE")
    try:
        priority = JobPriority(priority_str)
    except ValueError:
        priority = JobPriority.NORMALE

    status_str = item.get("status", "pending")
    try:
        status = JobStatus(status_str)
    except ValueError:
        status = JobStatus.PENDING

    scheduled_raw = item.get("scheduled_date")
    scheduled_date = None
    if scheduled_raw:
        if isinstance(scheduled_raw, datetime):
            scheduled_date = scheduled_raw
        else:
            try:
                scheduled_date = datetime.fromisoformat(
                    str(scheduled_raw).replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                scheduled_date = None

    lat, lng = _validate_reliable_coordinates(item)

    if item.get("_valid") is False:
        raise ValueError(
            "Ligne invalide selon la prévisualisation."
        )

    job = await job_logic.create_job(
        db=db,
        customer_name=item["customer_name"],
        service_address=item["service_address"],
        latitude=lat,
        longitude=lng,
        job_type=job_type,
        required_skills=item.get("required_skills") or [],
        job_number=item.get("job_number"),
        customer_phone=item.get("customer_phone"),
        service_city=item.get("service_city"),
        service_zip=item.get("service_zip"),
        sector_raw=item.get("sector_raw"),
        sector_id=item.get("sector_id"),
        route_criteria=item.get("route_criteria"),
        priority=priority,
        status=status,
        scheduled_date=scheduled_date,
        estimated_duration=item.get("estimated_duration") or 60,
        description=item.get("description"),
        notes=item.get("notes"),
        assigned_technician_name=item.get("assigned_technician_name"),
        operator=item.get("operator"),
        client_organization_id=item.get("_client_organization_id"),
        nro_raw=item.get("nro"),
        sro_raw=item.get("sro"),
        pbo_raw=item.get("pbo"),
        pto_raw=item.get("pto"),
        splitter_raw=item.get("splitter"),
        splitter_port_raw=item.get("splitter_port"),
        commit=False,  # We manage the transaction externally
    )
    return job


async def _update_job_from_dict(db: AsyncSession, job: Job, item: dict) -> Job:
    """Update an existing Job from an import dict."""
    from datetime import datetime

    # Map fields that can be updated
    field_mapping = {
        "customer_name": "customer_name",
        "customer_phone": "customer_phone",
        "service_address": "service_address",
        "service_city": "service_city",
        "service_zip": "service_zip",
        "route_criteria": "route_criteria",
        "assigned_technician_name": "assigned_technician_name",
        "notes": "notes",
        "description": "description",
        "operator": "operator",
        "nro": "nro_raw",
        "sro": "sro_raw",
        "pbo": "pbo_raw",
        "pto": "pto_raw",
        "splitter": "splitter_raw",
        "splitter_port": "splitter_port_raw",
        "estimated_duration": "estimated_duration",

    }

    for item_key, job_attr in field_mapping.items():
        if item_key in item and item[item_key] is not None:
            setattr(job, job_attr, item[item_key])

    if item.get("_client_organization_id") is not None:
        job.client_organization_id = item["_client_organization_id"]

    sector_raw = item.get("sector_raw")
    if _normalize_sector_name(sector_raw):
        job.sector_raw = sector_raw
        job.sector_id = item.get("sector_id")

    # Handle enum fields
    if item.get("job_type"):
        try:
            job.job_type = JobType(item["job_type"])
        except ValueError:
            pass

    if item.get("priority"):
        try:
            job.priority = JobPriority(item["priority"])
        except ValueError:
            pass

    if item.get("status"):
        try:
            job.status = JobStatus(item["status"])
        except ValueError:
            pass

    # Handle coordinates
    if item.get("latitude") is not None:
        job.latitude = float(item["latitude"])
    if item.get("longitude") is not None:
        job.longitude = float(item["longitude"])

    # Handle scheduled_date
    scheduled_raw = item.get("scheduled_date")
    if scheduled_raw:
        if isinstance(scheduled_raw, datetime):
            job.scheduled_date = scheduled_raw
        else:
            try:
                job.scheduled_date = datetime.fromisoformat(
                    str(scheduled_raw).replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

    job.updated_at = datetime.utcnow()
    db.add(job)
    return job
