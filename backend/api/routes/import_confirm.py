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

from backend.auth.dependencies import require_office_orienteur
from backend.config import get_settings
from backend.database.connection import AsyncSessionLocal, get_db
from backend.database.models import (
    ClientOrganization,
    Job,
    JobPriority,
    JobStatus,
    JobType,
    Sector,
    User,
)
from backend.logic import jobs as job_logic
from backend.logic.job_sectors import resolve_sector_for_write, sector_registry_aliases
from backend.services.excel.import_governance import (
    active_job_type_choices,
    active_sector_choices,
    resolve_active_job_type_choice,
)
from backend.services.excel.import_history_service import ImportHistoryService
from backend.services.excel.validator import ExcelValidator

logger = logging.getLogger(__name__)

router = APIRouter()

RELIABLE_GPS_SOURCES = {
    "GPS_PCO",
    "GPS_DERIVATION",
    "GPS_SPLITTER",
    "geocoded",
}

_MISSING_TYPE_MESSAGE = (
    "Type d’intervention obligatoire. Choisissez un type du référentiel "
    "pour ce lot ou corrigez le mapping."
)


def _normalize_sector_name(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return ""
    text = str(value).strip()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    without_accents = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    folded = without_accents.casefold()
    separated = re.sub(r"[\W_]+", " ", folded, flags=re.UNICODE)
    return " ".join(separated.split())


def _build_sector_index(sectors: list[tuple]) -> dict[str, list[int]]:
    index: dict[str, list[int]] = {}
    for row in sectors:
        sector_id, sector_name = row[:2]
        description = row[2] if len(row) > 2 else None
        aliases = sector_registry_aliases(
            {"name": sector_name, "description": description}
        )
        for alias in aliases:
            index.setdefault(alias, []).append(sector_id)
    return index


def _append_import_warning(item: dict, warning: str) -> None:
    warnings = list(item.get("import_warnings") or [])
    if warning not in warnings:
        warnings.append(warning)
    item["import_warnings"] = warnings


def _record_sector_provenance(item: dict, *, mode: str, sector_id: int) -> None:
    operational_data = dict(item.get("operational_data") or {})
    operational_data["import_sector_resolution"] = {
        "mode": mode,
        "sector_id": sector_id,
        "source_label": item.get("sector_raw"),
    }
    item["operational_data"] = operational_data


def _resolve_sector(item: dict, sector_index: dict[str, list[int]]) -> None:
    """Resolve only an explicit active sector id or one exact unique alias.

    Import deliberately does not use substring/fuzzy inference. If a source
    label does not map exactly and uniquely, the row must be resolved manually
    by the user instead of guessing an operational sector.
    """
    sector_raw = item.get("sector_raw")
    normalized_name = _normalize_sector_name(sector_raw)
    supplied_sector_id = item.get("sector_id")
    active_ids = {
        sector_id
        for ids in sector_index.values()
        for sector_id in ids
    }

    item["_sector_resolution_checked"] = True
    item["_sector_resolution_error"] = None

    if supplied_sector_id is not None:
        try:
            explicit_id = int(supplied_sector_id)
        except (TypeError, ValueError):
            explicit_id = None
        if explicit_id in active_ids:
            item["sector_id"] = explicit_id
            item["_sector_resolution_mode"] = "explicit_sector_id"
            _record_sector_provenance(
                item,
                mode="explicit_sector_id",
                sector_id=explicit_id,
            )
            return
        item["sector_id"] = None
        warning = (
            "Secteur choisi introuvable ou inactif dans GoVector. "
            "Choisissez manuellement un secteur actif du référentiel."
        )
        item["_sector_resolution_error"] = warning
        _append_import_warning(item, warning)
        return

    item["sector_id"] = None
    if not normalized_name:
        return

    matches = list(dict.fromkeys(sector_index.get(normalized_name, [])))
    if len(matches) == 1:
        item["sector_id"] = matches[0]
        item["_sector_resolution_mode"] = "exact_registry_alias"
        _record_sector_provenance(
            item,
            mode="exact_registry_alias",
            sector_id=matches[0],
        )
        return

    if not matches:
        warning = (
            f"Secteur Excel non reconnu exactement dans GoVector : {sector_raw}. "
            "Choisissez manuellement un secteur du référentiel."
        )
    else:
        warning = (
            f"Secteur Excel ambigu dans GoVector : {sector_raw}. "
            "Choisissez manuellement le secteur correct."
        )
    item["_sector_resolution_error"] = warning
    _append_import_warning(item, warning)


class ImportJobItem(BaseModel):
    """A single job dict from the validated preview."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    job_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    service_address: Optional[str] = None
    service_city: Optional[str] = None
    service_zip: Optional[str] = None
    sector_raw: Optional[str] = None
    sector_id: Optional[int] = None
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
    source_technician_name: Optional[str] = None
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
    optical_power_dbm: Optional[float] = None
    cable_length_m: Optional[int] = None
    ont_serial: Optional[str] = None
    operational_data: dict = Field(default_factory=dict)
    import_id: Optional[str] = Field(default=None, alias="_import_id")
    meta: Optional[dict] = Field(default=None, alias="_meta")
    valid: Optional[bool] = Field(default=None, alias="_valid")
    selected: Optional[bool] = Field(default=None, alias="_selected")
    warnings: List[str] = Field(default_factory=list, alias="_warnings")
    blocking_errors: List[dict] = Field(
        default_factory=list,
        alias="_blocking_errors",
    )
    advisories: List[dict] = Field(
        default_factory=list,
        alias="_advisories",
    )


class ImportConfirmPayload(BaseModel):
    jobs: List[ImportJobItem] = Field(default_factory=list)
    skip_duplicates: bool = True
    mode: str = Field(default="create", pattern="^(create|update|ignore)$")
    default_job_type: Optional[str] = None
    """The optional lot default is explicit and must reference an active catalog item."""


@router.get("/reference-options")
async def import_reference_options(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_office_orienteur),
):
    return {
        "job_types": await active_job_type_choices(db),
        "sectors": await active_sector_choices(db),
        "rules": {
            "default_job_type": "explicit_only",
            "sector_resolution": "exact_unique_or_explicit_id",
        },
    }


def _validate_reliable_coordinates(
    item: dict,
) -> tuple[Optional[float], Optional[float]]:
    error_message = "Aucune coordonnée GPS fiable disponible."
    latitude = item.get("latitude")
    longitude = item.get("longitude")

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


def _apply_explicit_batch_job_type(
    item: dict,
    *,
    choice: dict,
    user_id: int,
) -> dict:
    if item.get("job_type"):
        return item

    item = dict(item)
    item["job_type"] = choice["canonical"]
    operational_data = dict(item.get("operational_data") or {})
    operational_data["import_job_type_resolution"] = {
        "mode": "explicit_batch_default",
        "selected_code": choice["code"],
        "selected_label": choice["label"],
        "canonical": choice["canonical"],
        "selected_by_user_id": user_id,
    }
    item["operational_data"] = operational_data
    meta = dict(item.get("_meta") or {})
    meta["job_type_resolution"] = {
        "mode": "explicit_batch_default",
        "selected_code": choice["code"],
        "canonical": choice["canonical"],
    }
    item["_meta"] = meta

    # Revalidate from business fields rather than blindly flipping _valid. This
    # removes the type blocker only if it was truly the remaining blocker.
    selected = item.get("_selected")
    validated = ExcelValidator([item]).validate()["jobs"][0]
    if selected is not None:
        validated["_selected"] = bool(selected)
    return validated


@router.post("/confirm")
async def confirm_import(
    payload: ImportConfirmPayload,
    current_user: User = Depends(require_office_orienteur),
):
    jobs_data = payload.jobs
    if not jobs_data:
        raise HTTPException(status_code=400, detail="Aucune intervention à importer.")

    selected = [job for job in jobs_data if job.selected is not False]
    if not selected:
        return {
            "success": True,
            "created": 0,
            "updated": 0,
            "ignored": 0,
            "errors": [],
            "message": "Aucune intervention sélectionnée.",
        }

    settings = get_settings()
    start_time = time.time()

    async with AsyncSessionLocal() as session:
        try:
            items = [
                job.model_dump(exclude_none=True, by_alias=True)
                for job in selected
            ]

            if payload.default_job_type:
                choice = await resolve_active_job_type_choice(
                    session,
                    payload.default_job_type,
                )
                if choice is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            "Le type choisi pour le lot est introuvable ou inactif. "
                            "Rechargez le référentiel et choisissez un type actif."
                        ),
                    )
                items = [
                    _apply_explicit_batch_job_type(
                        item,
                        choice=choice,
                        user_id=current_user.id,
                    )
                    for item in items
                ]

            result = await _persist_jobs(
                db=session,
                items=items,
                mode=payload.mode,
                skip_duplicates=payload.skip_duplicates,
                batch_size=settings.IMPORT_BATCH_SIZE,
            )

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
                    "default_job_type": payload.default_job_type,
                },
            )
            await session.commit()
        except HTTPException:
            await session.rollback()
            raise
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
    """Persist validated import records inside the caller transaction."""
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
        select(Sector.id, Sector.name, Sector.description).where(
            Sector.is_active.is_(True)
        )
    )
    sector_rows = [
        (sector_id, sector_name, sector_description)
        for sector_id, sector_name, sector_description in sector_result.all()
    ]
    sector_index = _build_sector_index(sector_rows)

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

    result = await db.execute(
        select(Job.job_number).where(Job.job_number.isnot(None))
    )
    existing_numbers: set[str] = {value for value in result.scalars() if value}

    existing_jobs_map: dict[str, Job] = {}
    if mode == "update":
        result = await db.execute(select(Job).where(Job.job_number.isnot(None)))
        for job in result.scalars():
            if job.job_number:
                existing_jobs_map[job.job_number] = job

    for index, item in enumerate(items):
        job_number = item.get("job_number")
        try:
            resolve_client_organization(item)
            if job_number and job_number in existing_numbers:
                if mode == "ignore":
                    ignored += 1
                    continue
                if mode == "update" and job_number in existing_jobs_map:
                    _resolve_sector(item, sector_index)
                    if item.get("_sector_resolution_error"):
                        raise ValueError(item["_sector_resolution_error"])
                    existing = existing_jobs_map[job_number]
                    latitude, longitude = _validate_reliable_coordinates(item)
                    if item.get("_valid") is False:
                        raise ValueError("Ligne invalide selon la prévisualisation.")
                    item["latitude"] = latitude
                    item["longitude"] = longitude
                    async with db.begin_nested():
                        await _update_job_from_dict(db, existing, item)
                        await db.flush()
                    updated += 1
                    track_planning(existing)
                    continue
                ignored += 1
                continue

            _resolve_sector(item, sector_index)
            if item.get("_sector_resolution_error"):
                raise ValueError(item["_sector_resolution_error"])
            async with db.begin_nested():
                job = await _create_job_from_dict(db, item)
            created += 1
            track_planning(job)
            if job and job.job_number:
                existing_numbers.add(job.job_number)

        except Exception as exc:
            logger.warning("Row %d failed: %s", index, exc)
            errors.append(
                {
                    "index": index,
                    "row": item.get("_meta", {}).get("row", index + 2),
                    "job_number": job_number,
                    "error": str(exc),
                    "warnings": item.get("import_warnings") or [],
                }
            )

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

    job_type_str = item.get("job_type")
    if not job_type_str:
        raise ValueError(_MISSING_TYPE_MESSAGE)
    try:
        job_type = JobType(job_type_str)
    except ValueError as exc:
        raise ValueError(f"Type d'intervention inconnu : {job_type_str}.") from exc

    priority_str = item.get("priority", "NORMALE")
    try:
        priority = JobPriority(priority_str)
    except ValueError:
        priority = JobPriority.NORMALE

    status_str = item.get("status", "pending")
    try:
        status_value = JobStatus(status_str)
    except ValueError:
        status_value = JobStatus.PENDING

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
        raise ValueError("Ligne invalide selon la prévisualisation.")

    source_route_criteria = item.get("route_criteria")
    job = await job_logic.create_job(
        db=db,
        customer_name=item.get("customer_name"),
        service_address=item.get("service_address"),
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
        # Do not let the generic live resolver infer an import sector from NRO,
        # city fragments or other routing text. Import resolution already ran
        # above under its exact-only contract.
        route_criteria=None,
        priority=priority,
        status=status_value,
        scheduled_date=scheduled_date,
        estimated_duration=item.get("estimated_duration"),
        description=item.get("description"),
        notes=item.get("notes"),
        operator=item.get("operator"),
        client_organization_id=item.get("_client_organization_id"),
        nro_raw=item.get("nro"),
        sro_raw=item.get("sro"),
        pbo_raw=item.get("pbo"),
        pto_raw=item.get("pto"),
        splitter_raw=item.get("splitter"),
        splitter_port_raw=item.get("splitter_port"),
        optical_power_dbm=item.get("optical_power_dbm"),
        cable_length_m=item.get("cable_length_m"),
        ont_serial=item.get("ont_serial"),
        operational_data=item.get("operational_data") or {},
        commit=False,
    )
    job.route_criteria = source_route_criteria
    return job


async def _update_job_from_dict(db: AsyncSession, job: Job, item: dict) -> Job:
    """Update an existing Job from an import dict."""
    from datetime import datetime

    field_mapping = {
        "customer_name": "customer_name",
        "customer_phone": "customer_phone",
        "service_address": "service_address",
        "service_city": "service_city",
        "service_zip": "service_zip",
        "route_criteria": "route_criteria",
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
        "optical_power_dbm": "optical_power_dbm",
        "cable_length_m": "cable_length_m",
        "ont_serial": "ont_serial",
    }
    for item_key, job_attr in field_mapping.items():
        if item_key in item and item[item_key] is not None:
            setattr(job, job_attr, item[item_key])

    source_operational_data = item.get("operational_data")
    if isinstance(source_operational_data, dict):
        job.operational_data = {
            **(getattr(job, "operational_data", None) or {}),
            **source_operational_data,
        }

    if item.get("_client_organization_id") is not None:
        job.client_organization_id = item["_client_organization_id"]

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

    if item.get("latitude") is not None:
        job.latitude = float(item["latitude"])
    if item.get("longitude") is not None:
        job.longitude = float(item["longitude"])

    supplied_sector_raw = item.get("sector_raw")
    supplied_sector_id = item.get("sector_id")
    has_sector_raw = bool(_normalize_sector_name(supplied_sector_raw))
    location_context_changed = any(
        key in item and item.get(key) is not None
        for key in ("route_criteria", "latitude", "longitude")
    )
    import_resolution_checked = bool(item.get("_sector_resolution_checked"))

    if supplied_sector_id is not None:
        identity = await resolve_sector_for_write(
            db,
            sector_id=supplied_sector_id,
            sector_raw=supplied_sector_raw,
            route_criteria=job.route_criteria,
            latitude=job.latitude,
            longitude=job.longitude,
        )
        if identity is None:
            raise ValueError("Secteur choisi introuvable ou inactif dans GoVector.")
        job.sector_id = identity.id
        job.sector_raw = supplied_sector_raw or identity.raw
    elif not import_resolution_checked and has_sector_raw:
        identity = await resolve_sector_for_write(
            db,
            sector_id=None,
            sector_raw=supplied_sector_raw,
            route_criteria=job.route_criteria,
            latitude=job.latitude,
            longitude=job.longitude,
        )
        if identity is not None:
            job.sector_id = identity.id
            job.sector_raw = supplied_sector_raw
    elif (
        not import_resolution_checked
        and location_context_changed
        and job.sector_id is None
    ):
        identity = await resolve_sector_for_write(
            db,
            sector_id=None,
            sector_raw=job.sector_raw,
            route_criteria=job.route_criteria,
            latitude=job.latitude,
            longitude=job.longitude,
        )
        if identity is not None:
            job.sector_id = identity.id
            job.sector_raw = job.sector_raw or identity.raw

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
