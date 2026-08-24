"""Unified V1 field record and office-to-field attachments."""

import json
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user, require_orienteur
from backend.api.errors import BusinessAPIError
from backend.config import get_settings
from backend.database.connection import get_db
from backend.database.models import (
    Assignment,
    Job,
    JobStatus,
    JobActivityLog,
    JobAttachment,
    JobCommunication,
    JobSiteObservation,
    JobVisit,
    Site,
    SiteAttributeObservation,
    SiteResolvedAttribute,
    Technician,
    TechnicianFieldAction,
    TechnicianMedia,
    User,
    UserRole,
)
from backend.logic.job_access import (
    require_job_collaboration_access,
    require_job_operations_access,
    require_job_read_access_by_id,
)
from backend.logic.activity_log import log_job_activity
from backend.logic.job_communications import (
    MESSAGE_TYPES,
    communication_dict,
    create_job_communication,
)
from backend.logic.operational_audit import record_operational_audit
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.technician_history import site_match_clause
from backend.logic.site_registry import (
    find_site_merge_candidates,
    merge_sites,
    resolve_site_observation,
    site_dict,
    site_merge_conflicts,
)
from backend.logic.site_attributes import (
    attribute_observation_dict,
    resolve_site_attribute_observation,
    resolved_attribute_dict,
)
from backend.logic.workflow.capabilities import STATUS_METADATA
from backend.services.media_storage import FileSystemMediaStorage, MediaStorageError


router = APIRouter(tags=["V1 Job Context"])
_KINDS = {"plan", "photo", "document", "instruction"}


def _visit_status_label(value: str | None) -> str | None:
    if not value:
        return None
    history_labels = {
        "reassigned": "Réaffecté",
        "unassigned": "Désaffecté",
    }
    if value in history_labels:
        return history_labels[value]
    try:
        return STATUS_METADATA[JobStatus(value)].label
    except (KeyError, ValueError):
        return value


def _visit_is_current(item: JobVisit, current_assignment: Assignment | None) -> bool:
    if item.ended_at is not None or current_assignment is None:
        return False
    if current_assignment.visit_id is not None:
        return current_assignment.visit_id == item.id
    # Compatibility for records created before assignments carried a visit_id:
    # never make an old technician look currently active.
    return item.primary_technician_id == current_assignment.technician_id


class OfficeNotePayload(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class SiteObservationResolutionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: str = Field(pattern="^(accepted|rejected)$")
    expected_revision: int | None = Field(default=None, ge=0)


class SiteAttributeResolutionPayload(SiteObservationResolutionPayload):
    note: str | None = Field(default=None, max_length=1000)


class SiteMergePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_site_id: int = Field(gt=0)
    expected_source_revision: int = Field(ge=0)
    expected_target_revision: int = Field(ge=0)
    reason: str = Field(min_length=8, max_length=1000)


class CommunicationAssetPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_type: str = Field(min_length=1, max_length=32)
    asset_id: str = Field(min_length=1, max_length=64)
    role: str = Field(default="attachment", min_length=1, max_length=24)
    annotation_of: dict | None = None


class CommunicationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(default="message", min_length=1, max_length=32)
    body: str | None = Field(default=None, max_length=4000)
    parent_id: int | None = Field(default=None, gt=0)
    audience: str | None = Field(default=None, max_length=16)
    requires_action: bool | None = None
    attachments: list[CommunicationAssetPayload] = Field(
        default_factory=list, max_length=6
    )


async def _job_for_collaboration(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
) -> Job:
    job = await db.scalar(select(Job).where(Job.id == job_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Intervention introuvable.")
    if current_user.role == UserRole.TECHNICIAN:
        return await require_job_collaboration_access(
            db, job=job, current_user=current_user
        )
    return await require_job_read_access_by_id(
        db, job_id=job_id, current_user=current_user
    )


async def _communication_rows(db: AsyncSession, job_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(JobCommunication, User.username)
            .join(User, User.id == JobCommunication.author_user_id)
            .where(JobCommunication.job_id == job_id)
            .order_by(JobCommunication.created_at.asc(), JobCommunication.id.asc())
        )
    ).all()
    office_assets = (
        await db.execute(select(JobAttachment).where(JobAttachment.job_id == job_id))
    ).scalars().all()
    field_assets = (
        await db.execute(select(TechnicianMedia).where(TechnicianMedia.job_id == job_id))
    ).scalars().all()
    office_by_id = {item.attachment_id: item for item in office_assets}
    field_by_id = {item.media_id: item for item in field_assets}

    result = []
    for item, username in rows:
        data = communication_dict(item, username)
        described = []
        for reference in data["attachments"]:
            if reference.get("asset_type") == "office_attachment":
                asset = office_by_id.get(reference.get("asset_id"))
                if asset is None:
                    continue
                descriptor = {
                    **reference,
                    "kind": asset.kind,
                    "title": asset.title,
                    "filename": asset.original_filename,
                    "mime_type": asset.mime_type,
                    "size_bytes": asset.size_bytes,
                    "metadata": asset.meta_data or {},
                }
            else:
                asset = field_by_id.get(reference.get("asset_id"))
                if asset is None:
                    continue
                descriptor = {
                    **reference,
                    "kind": asset.kind,
                    "title": None,
                    "filename": asset.original_filename,
                    "mime_type": asset.mime_type,
                    "size_bytes": asset.size_bytes,
                    "metadata": asset.meta_data or {},
                    "technician_id": asset.technician_id,
                }
            described.append(descriptor)
        data["attachments"] = described
        result.append(data)
    return result


def _attachment_dict(item: JobAttachment) -> dict:
    return {
        "id": item.id,
        "attachment_id": item.attachment_id,
        "kind": item.kind,
        "title": item.title,
        "comment": item.comment,
        "filename": item.original_filename,
        "mime_type": item.mime_type,
        "size_bytes": item.size_bytes,
        "sha256": item.sha256,
        "metadata": item.meta_data or {},
        "uploaded_by_user_id": item.uploaded_by_user_id,
        "created_at": item.created_at,
    }


@router.get("/{job_id}/field-record")
async def get_field_record(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await _job_for_collaboration(
        db, job_id=job_id, current_user=current_user
    )
    actions = (
        await db.execute(
            select(TechnicianFieldAction)
            .where(TechnicianFieldAction.job_id == job_id)
            .order_by(TechnicianFieldAction.occurred_at.desc())
        )
    ).scalars().all()
    media = (
        await db.execute(
            select(TechnicianMedia)
            .where(TechnicianMedia.job_id == job_id)
            .order_by(TechnicianMedia.created_at.desc())
        )
    ).scalars().all()
    observations = (
        await db.execute(
            select(JobSiteObservation)
            .where(JobSiteObservation.job_id == job_id)
            .order_by(JobSiteObservation.occurred_at.desc())
        )
    ).scalars().all()
    attribute_observations = (
        await db.execute(
            select(SiteAttributeObservation)
            .where(SiteAttributeObservation.job_id == job_id)
            .order_by(SiteAttributeObservation.occurred_at.desc())
        )
    ).scalars().all()
    site = None
    if isinstance(db, AsyncSession) and getattr(job, "site_id", None) is not None:
        site = await db.scalar(select(Site).where(Site.id == job.site_id))
    resolved_attributes = []
    if site is not None:
        resolved_attributes = (
            await db.execute(
                select(SiteResolvedAttribute)
                .where(SiteResolvedAttribute.site_id == site.id)
                .order_by(SiteResolvedAttribute.attribute_key.asc())
            )
        ).scalars().all()
    visits = []
    assignment_history = []
    if isinstance(db, AsyncSession):
        visits = (
            await db.execute(
                select(JobVisit)
                .where(JobVisit.job_id == job_id)
                .order_by(JobVisit.attempt_number.asc())
            )
        ).scalars().all()
        assignment_history = (
            await db.execute(
                select(Assignment)
                .where(Assignment.job_id == job_id)
                .order_by(Assignment.assigned_at.asc(), Assignment.id.asc())
            )
        ).scalars().all()
    attachments = (
        await db.execute(
            select(JobAttachment)
            .where(JobAttachment.job_id == job_id)
            .order_by(JobAttachment.created_at.desc())
        )
    ).scalars().all()
    office_notes = (
        await db.execute(
            select(JobActivityLog)
            .where(
                JobActivityLog.job_id == job_id,
                JobActivityLog.action == "office_instruction",
            )
            .order_by(JobActivityLog.created_at.desc())
        )
    ).scalars().all()
    communications = await _communication_rows(db, job_id)
    technician_ids = {item.technician_id for item in actions} | {
        item.technician_id for item in media
    } | {item.technician_id for item in assignment_history} | {
        item.primary_technician_id
        for item in visits
        if item.primary_technician_id is not None
    }
    technicians = {}
    if technician_ids:
        rows = (
            await db.execute(select(Technician).where(Technician.id.in_(technician_ids)))
        ).scalars().all()
        technicians = {row.id: row.name for row in rows}

    current_assignment = next(
        (item for item in assignment_history if item.ended_at is None),
        None,
    )

    assignment_end_reasons_by_visit = {
        item.visit_id: item.end_reason
        for item in assignment_history
        if item.visit_id is not None and item.end_reason
    }

    latest_site = next(
        (
            item
            for item in observations
            if item.observation_type == "site_location"
            and getattr(item, "resolution_status", None) not in {"conflict", "rejected"}
        ),
        None,
    )
    reference_origin = "current_job" if latest_site is not None else None
    reference_job_id = job.id if latest_site is not None else None
    reference_match_basis = "current_job" if latest_site is not None else None
    reference_match_confidence = "high" if latest_site is not None else None
    canonical_reference = None
    if (
        site is not None
        and site.canonical_latitude is not None
        and site.canonical_longitude is not None
    ):
        canonical_reference = {
            "latitude": site.canonical_latitude,
            "longitude": site.canonical_longitude,
            "accuracy_m": site.canonical_accuracy_m,
            "label": "Position canonique du site",
            "note": None,
            "observed_at": site.resolved_at,
            "technician_id": None,
            "origin": "canonical_site",
            "source_job_id": None,
            "match_basis": "site_id",
            "match_confidence": "high",
            "site_id": site.id,
            "site_revision": site.revision,
            "resolved_observation_id": site.resolved_observation_id,
        }
    if canonical_reference is None and latest_site is None:
        match_clause, match_basis, match_confidence = site_match_clause(job)
        if match_basis != "none":
            inherited = (
                await db.execute(
                    select(JobSiteObservation)
                    .join(Job, Job.id == JobSiteObservation.job_id)
                    .where(
                        JobSiteObservation.observation_type == "site_location",
                        JobSiteObservation.resolution_status == "accepted",
                        JobSiteObservation.job_id != job.id,
                        Job.deleted_at.is_(None),
                        match_clause,
                    )
                    .order_by(JobSiteObservation.occurred_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if inherited is not None:
                latest_site = inherited
                reference_origin = "previous_field_visit"
                reference_job_id = inherited.job_id
                reference_match_basis = match_basis
                reference_match_confidence = match_confidence
    return {
        "job_id": job.id,
        "site": site_dict(site),
        "site_resolved_attributes": [
            resolved_attribute_dict(item) for item in resolved_attributes
        ],
        "site_attribute_observations": [
            {
                **attribute_observation_dict(item),
                "technician_name": technicians.get(item.technician_id),
            }
            for item in attribute_observations
        ],
        "planned_location": {
            "address": job.service_address,
            "city": job.service_city,
            "zip": job.service_zip,
            "latitude": job.latitude,
            "longitude": job.longitude,
            "source": job.planned_location_source,
            "precision": job.planned_location_precision,
        },
        "field_reference_location": canonical_reference or (
            {
                "latitude": latest_site.latitude,
                "longitude": latest_site.longitude,
                "accuracy_m": latest_site.accuracy_m,
                "label": latest_site.label,
                "note": latest_site.note,
                "observed_at": latest_site.occurred_at,
                "technician_id": latest_site.technician_id,
                "origin": reference_origin,
                "source_job_id": reference_job_id,
                "match_basis": reference_match_basis,
                "match_confidence": reference_match_confidence,
                "site_id": getattr(latest_site, "site_id", None),
                "site_revision": site.revision if site is not None else None,
                "resolved_observation_id": (
                    latest_site.id
                    if getattr(latest_site, "resolution_status", None) == "accepted"
                    else None
                ),
            }
            if latest_site is not None
            else None
        ),
        "site_observations": [
            {
                "id": item.id,
                "visit_id": item.visit_id,
                "type": item.observation_type,
                "latitude": item.latitude,
                "longitude": item.longitude,
                "accuracy_m": item.accuracy_m,
                "label": item.label,
                "note": item.note,
                "technician_id": item.technician_id,
                "technician_name": technicians.get(item.technician_id),
                "occurred_at": item.occurred_at,
                "source": item.source,
                "site_id": getattr(item, "site_id", None),
                "resolution_status": getattr(item, "resolution_status", "unreviewed") or "unreviewed",
                "resolved_at": getattr(item, "resolved_at", None),
                "resolved_by_user_id": getattr(item, "resolved_by_user_id", None),
            }
            for item in observations
        ],
        "field_actions": [
            {
                "id": item.id,
                "visit_id": item.visit_id,
                "event_id": item.event_id,
                "type": item.action_type,
                "payload": item.payload,
                "technician_id": item.technician_id,
                "technician_name": technicians.get(item.technician_id),
                "occurred_at": item.occurred_at,
            }
            for item in actions
        ],
        "technician_media": [
            {
                "media_id": item.media_id,
                "visit_id": item.visit_id,
                "kind": item.kind,
                "filename": item.original_filename,
                "mime_type": item.mime_type,
                "size_bytes": item.size_bytes,
                "sha256": item.sha256,
                "metadata": item.meta_data,
                "technician_id": item.technician_id,
                "technician_name": technicians.get(item.technician_id),
                "created_at": item.created_at,
            }
            for item in media
        ],
        "visits": [
            {
                "id": item.id,
                "attempt_number": item.attempt_number,
                "status": item.status,
                "outcome": item.outcome,
                "status_label": _visit_status_label(item.outcome or item.status),
                "primary_technician_id": item.primary_technician_id,
                "primary_technician_name": technicians.get(
                    item.primary_technician_id
                ),
                "scheduled_at": item.scheduled_at,
                "assigned_at": item.assigned_at,
                "accepted_at": item.accepted_at,
                "started_at": item.started_at,
                "arrived_at": item.arrived_at,
                "work_started_at": item.work_started_at,
                "ended_at": item.ended_at,
                "start_latitude": item.start_latitude,
                "start_longitude": item.start_longitude,
                "end_latitude": item.end_latitude,
                "end_longitude": item.end_longitude,
                "backfill_confidence": item.backfill_confidence,
                "is_current": _visit_is_current(item, current_assignment),
                "is_historical": not _visit_is_current(item, current_assignment),
                "history_reason": assignment_end_reasons_by_visit.get(item.id),
            }
            for item in visits
        ],
        "current_assignment": (
            {
                "id": current_assignment.id,
                "visit_id": current_assignment.visit_id,
                "technician_id": current_assignment.technician_id,
                "technician_name": technicians.get(current_assignment.technician_id),
                "assigned_at": current_assignment.assigned_at,
            }
            if current_assignment is not None
            else None
        ),
        "assignment_history": [
            {
                "id": item.id,
                "visit_id": item.visit_id,
                "technician_id": item.technician_id,
                "technician_name": technicians.get(item.technician_id),
                "assigned_at": item.assigned_at,
                "ended_at": item.ended_at,
                "end_reason": item.end_reason,
                "is_current": item.ended_at is None,
            }
            for item in assignment_history
        ],
        "office_attachments": [_attachment_dict(item) for item in attachments],
        "office_notes": [
            {
                "id": item.id,
                "text": item.description,
                "created_at": item.created_at,
                "author_user_id": (item.meta_data or {}).get("user_id"),
            }
            for item in office_notes
        ],
        "communications": communications,
        "instructions": {
            "special_instructions": job.special_instructions,
            "coordinator_comments": job.coordinator_comments,
            "notes": job.notes,
        },
    }


@router.post("/{job_id}/site-observations/{observation_id}/resolve")
async def resolve_job_site_observation(
    job_id: int,
    observation_id: int,
    payload: SiteObservationResolutionPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await require_job_read_access_by_id(
        db, job_id=job_id, current_user=current_user
    )
    require_job_operations_access(job=job, current_user=current_user)
    site, observation = await resolve_site_observation(
        db,
        job=job,
        observation_id=observation_id,
        decision=payload.decision,
        expected_revision=payload.expected_revision,
        current_user=current_user,
    )
    await log_job_activity(
        db=db,
        job_id=job.id,
        visit_id=observation.visit_id,
        action="site_observation_resolved",
        description=(
            "Repère terrain accepté comme référence du site"
            if payload.decision == "accepted"
            else "Repère terrain rejeté"
        ),
        latitude=observation.latitude,
        longitude=observation.longitude,
        metadata={
            "user_id": current_user.id,
            "site_id": site.id,
            "site_revision": site.revision,
            "observation_id": observation.id,
            "decision": payload.decision,
        },
    )
    await db.commit()
    return {
        "site": site_dict(site),
        "observation": {
            "id": observation.id,
            "resolution_status": observation.resolution_status,
            "resolved_at": observation.resolved_at,
            "resolved_by_user_id": observation.resolved_by_user_id,
        },
    }


@router.post("/{job_id}/site-attributes/{observation_id}/resolve")
async def resolve_job_site_attribute(
    job_id: int,
    observation_id: int,
    payload: SiteAttributeResolutionPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await require_job_read_access_by_id(
        db, job_id=job_id, current_user=current_user
    )
    require_job_operations_access(job=job, current_user=current_user)
    site, observation, resolved = await resolve_site_attribute_observation(
        db,
        job=job,
        observation_id=observation_id,
        decision=payload.decision,
        expected_revision=payload.expected_revision,
        current_user=current_user,
        note=payload.note,
    )
    await log_job_activity(
        db=db,
        job_id=job.id,
        visit_id=observation.visit_id,
        action="site_attribute_resolved",
        description=(
            f"{observation.attribute_key} confirmé pour le site"
            if payload.decision == "accepted"
            else f"{observation.attribute_key} rejeté"
        ),
        metadata={
            "user_id": current_user.id,
            "site_id": site.id,
            "site_revision": site.revision,
            "observation_id": observation.id,
            "attribute_key": observation.attribute_key,
            "decision": payload.decision,
            "note": payload.note,
        },
    )
    await db.commit()
    return {
        "site": site_dict(site),
        "observation": attribute_observation_dict(observation),
        "resolved_attribute": (
            resolved_attribute_dict(resolved) if resolved is not None else None
        ),
    }


@router.get("/{job_id}/site-merge-candidates")
async def list_job_site_merge_candidates(
    job_id: int,
    search: str | None = Query(default=None, max_length=120),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await require_job_read_access_by_id(
        db, job_id=job_id, current_user=current_user
    )
    require_job_operations_access(job=job, current_user=current_user)
    if job.site_id is None:
        return {"source_site": None, "candidates": []}
    source = await db.scalar(
        select(Site).where(
            Site.id == job.site_id,
            Site.is_active.is_(True),
            Site.merged_into_site_id.is_(None),
        )
    )
    if source is None:
        raise BusinessAPIError(
            409, "site_not_available", "Le site de cette intervention n'est plus actif"
        )
    candidates = await find_site_merge_candidates(
        db, source=source, current_user=current_user, search=search
    )
    site_ids = [source.id, *[candidate.id for candidate, _ in candidates]]
    attributes = (
        await db.execute(
            select(SiteResolvedAttribute).where(
                SiteResolvedAttribute.site_id.in_(site_ids)
            )
        )
    ).scalars().all()
    attributes_by_site: dict[int, list[SiteResolvedAttribute]] = {}
    for item in attributes:
        attributes_by_site.setdefault(item.site_id, []).append(item)
    return {
        "source_site": site_dict(source),
        "candidates": [
            {
                **site_dict(candidate),
                "job_count": job_count,
                "merge_blockers": site_merge_conflicts(
                    source,
                    candidate,
                    source_attributes=attributes_by_site.get(source.id, []),
                    target_attributes=attributes_by_site.get(candidate.id, []),
                ),
            }
            for candidate, job_count in candidates
        ],
    }


@router.post("/{job_id}/site-merge")
async def merge_job_site(
    job_id: int,
    payload: SiteMergePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    reason = payload.reason.strip()
    if len(reason) < 8:
        raise BusinessAPIError(
            422,
            "site_merge_reason_required",
            "Expliquez la vérification ayant conduit au rapprochement",
        )
    source_job = await require_job_read_access_by_id(
        db, job_id=job_id, current_user=current_user
    )
    require_job_operations_access(job=source_job, current_user=current_user)
    if source_job.site_id is None:
        raise BusinessAPIError(
            409,
            "site_not_available",
            "Cette intervention n'a pas encore d'identité site à fusionner",
        )

    target_job_statement = select(Job).where(
        Job.site_id == payload.target_site_id,
        Job.deleted_at.is_(None),
    )
    if current_user.role == UserRole.ORIENTEUR:
        target_job_statement = target_job_statement.where(
            Job.orienteur_id == current_user.orienteur_id
        )
    target_job = await db.scalar(target_job_statement.limit(1))
    if target_job is None:
        raise BusinessAPIError(
            403,
            "site_merge_target_denied",
            "Le site cible n'est pas disponible dans votre périmètre opérationnel",
        )
    require_job_operations_access(job=target_job, current_user=current_user)

    target, merge_record, moved_job_ids = await merge_sites(
        db,
        source_site_id=source_job.site_id,
        target_site_id=payload.target_site_id,
        expected_source_revision=payload.expected_source_revision,
        expected_target_revision=payload.expected_target_revision,
        reason=reason,
        current_user=current_user,
    )
    for moved_job_id in moved_job_ids:
        await log_job_activity(
            db=db,
            job_id=moved_job_id,
            action="site_merged",
            description="Site rapproché manuellement après vérification bureau",
            metadata={
                "user_id": current_user.id,
                "merge_id": merge_record.id,
                "source_site_id": merge_record.source_site_id,
                "target_site_id": target.id,
                "reason": reason,
            },
        )
    record_operational_audit(
        db,
        current_user=current_user,
        action="site.merged",
        entity_type="site",
        entity_id=target.id,
        before={"source_site_id": merge_record.source_site_id},
        after={"target_site_id": target.id, "site_revision": target.revision},
        context={
            "merge_id": merge_record.id,
            "reason": reason,
            "moved_job_ids": moved_job_ids,
        },
    )
    await db.commit()
    return {
        "site": site_dict(target),
        "merge_id": merge_record.id,
        "moved_job_ids": moved_job_ids,
    }


@router.get("/{job_id}/communications")
async def list_job_communications(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _job_for_collaboration(db, job_id=job_id, current_user=current_user)
    return await _communication_rows(db, job_id)


@router.post("/{job_id}/communications", status_code=201)
async def add_job_communication(
    job_id: int,
    payload: CommunicationPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await _job_for_collaboration(db, job_id=job_id, current_user=current_user)
    await require_job_collaboration_access(db, job=job, current_user=current_user)
    if payload.type not in MESSAGE_TYPES:
        raise HTTPException(status_code=422, detail="Type de message invalide.")
    try:
        item = await create_job_communication(
            db,
            job_id=job_id,
            message_type=payload.type,
            body=payload.body,
            current_user=current_user,
            source="mobile" if current_user.role == UserRole.TECHNICIAN else "web",
            audience=payload.audience,
            parent_id=payload.parent_id,
            requires_action=payload.requires_action,
            asset_refs=[item.model_dump() for item in payload.attachments],
        )
    except TechnicianJobMutationError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc
    await db.commit()
    return communication_dict(item, current_user.username)


@router.post("/{job_id}/communications/{communication_id}/acknowledge", status_code=201)
async def acknowledge_job_communication(
    job_id: int,
    communication_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await _job_for_collaboration(db, job_id=job_id, current_user=current_user)
    await require_job_collaboration_access(db, job=job, current_user=current_user)
    try:
        item = await create_job_communication(
            db,
            job_id=job_id,
            message_type="acknowledgement",
            body="Message pris en compte",
            current_user=current_user,
            source="mobile" if current_user.role == UserRole.TECHNICIAN else "web",
            parent_id=communication_id,
        )
    except TechnicianJobMutationError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc
    await db.commit()
    return communication_dict(item, current_user.username)


@router.post("/{job_id}/communications/{communication_id}/resolve")
async def resolve_job_communication(
    job_id: int,
    communication_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await require_job_read_access_by_id(
        db, job_id=job_id, current_user=current_user
    )
    require_job_operations_access(job=job, current_user=current_user)
    item = await db.scalar(
        select(JobCommunication).where(
            JobCommunication.id == communication_id,
            JobCommunication.job_id == job_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Message introuvable.")
    if item.requires_action and item.status != "resolved":
        item.status = "resolved"
        item.resolved_at = datetime.now(timezone.utc)
        await log_job_activity(
            db,
            job_id=job_id,
            action="communication_resolved",
            description="Demande opérationnelle résolue",
            metadata={
                "source": "web",
                "communication_id": item.id,
                "user_id": current_user.id,
                "workflow_unchanged": True,
            },
        )
        await db.commit()
    return communication_dict(item, None)


@router.post("/{job_id}/office-notes", status_code=201)
async def add_office_note(
    job_id: int,
    payload: OfficeNotePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
    require_job_operations_access(job=job, current_user=current_user)
    entry = await create_job_communication(
        db,
        job_id=job_id,
        message_type="instruction",
        body=payload.text,
        current_user=current_user,
        source="web",
        audience="field",
    )
    await db.commit()
    return communication_dict(entry, current_user.username)


@router.post("/{job_id}/attachments", status_code=201)
async def upload_office_attachment(
    job_id: int,
    kind: str = Form(...),
    title: str | None = Form(None),
    comment: str | None = Form(None),
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    if kind not in _KINDS:
        raise HTTPException(status_code=422, detail="Type de pièce jointe invalide.")
    job = await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
    require_job_operations_access(job=job, current_user=current_user)
    if len(metadata) > 8000:
        raise HTTPException(status_code=422, detail="Métadonnées trop volumineuses.")
    try:
        parsed_metadata = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Métadonnées JSON invalides.") from exc
    if not isinstance(parsed_metadata, dict):
        raise HTTPException(status_code=422, detail="Les métadonnées doivent être un objet.")
    annotation_of = parsed_metadata.get("annotation_of")
    if annotation_of is not None:
        if not isinstance(annotation_of, dict):
            raise HTTPException(status_code=422, detail="Origine d’annotation invalide.")
        origin_type = str(annotation_of.get("asset_type") or "")
        origin_id = str(annotation_of.get("asset_id") or "")
        if origin_type == "office_attachment":
            origin = await db.scalar(
                select(JobAttachment).where(
                    JobAttachment.job_id == job_id,
                    JobAttachment.attachment_id == origin_id,
                )
            )
        elif origin_type == "technician_media":
            origin = await db.scalar(
                select(TechnicianMedia).where(
                    TechnicianMedia.job_id == job_id,
                    TechnicianMedia.media_id == origin_id,
                )
            )
        else:
            origin = None
        if origin is None:
            raise HTTPException(
                status_code=422,
                detail="La pièce annotée n’appartient pas à cette intervention.",
            )
    mime_type = (file.content_type or "application/octet-stream").lower()
    if not (
        mime_type.startswith("image/")
        or mime_type == "application/pdf"
        or mime_type.startswith("text/")
        or mime_type
        in {
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
    ):
        raise HTTPException(status_code=415, detail="Format de fichier non autorisé.")
    attachment_id = str(uuid4())
    suffix = Path(file.filename or "").suffix.lower()[:12]
    storage_key = f"office/{job_id}/{attachment_id}{suffix}"
    storage = FileSystemMediaStorage(Path(get_settings().TECHNICIAN_MEDIA_ROOT))
    try:
        stored = await storage.store(
            file,
            storage_key=storage_key,
            expected_sha256=None,
            maximum_bytes=get_settings().TECHNICIAN_DOCUMENT_MAX_BYTES,
        )
    except MediaStorageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    attachment = JobAttachment(
        attachment_id=attachment_id,
        job_id=job_id,
        uploaded_by_user_id=current_user.id,
        kind=kind,
        title=title.strip() if title and title.strip() else None,
        comment=comment.strip() if comment and comment.strip() else None,
        storage_key=stored.storage_key,
        original_filename=file.filename,
        mime_type=mime_type,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        meta_data=parsed_metadata,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return _attachment_dict(attachment)


def _safe_media_path(storage_key: str) -> Path:
    root = Path(get_settings().TECHNICIAN_MEDIA_ROOT).resolve()
    path = (root / storage_key).resolve()
    if root != path and root not in path.parents:
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    return path


@router.get("/{job_id}/attachments/{attachment_id}/download")
async def download_office_attachment(
    job_id: int,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _job_for_collaboration(db, job_id=job_id, current_user=current_user)
    item = (
        await db.execute(
            select(JobAttachment).where(
                JobAttachment.job_id == job_id,
                JobAttachment.attachment_id == attachment_id,
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Pièce jointe introuvable.")
    return FileResponse(
        _safe_media_path(item.storage_key),
        media_type=item.mime_type,
        filename=item.original_filename or f"piece-{item.attachment_id}",
    )


@router.get("/{job_id}/media/{media_id}/download")
async def download_technician_media(
    job_id: int,
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _job_for_collaboration(db, job_id=job_id, current_user=current_user)
    item = (
        await db.execute(
            select(TechnicianMedia).where(
                TechnicianMedia.job_id == job_id,
                TechnicianMedia.media_id == media_id,
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Média terrain introuvable.")
    return FileResponse(
        _safe_media_path(item.storage_key),
        media_type=item.mime_type,
        filename=item.original_filename or f"media-{item.media_id}",
    )
