"""Unified V1 field record and office-to-field attachments."""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user, require_orienteur
from backend.config import get_settings
from backend.database.connection import get_db
from backend.database.models import (
    Job,
    JobActivityLog,
    JobAttachment,
    JobSiteObservation,
    Technician,
    TechnicianFieldAction,
    TechnicianMedia,
    User,
)
from backend.logic.job_access import (
    require_job_operations_access,
    require_job_read_access_by_id,
)
from backend.logic.activity_log import log_job_activity
from backend.logic.technician_history import site_match_clause
from backend.services.media_storage import FileSystemMediaStorage, MediaStorageError


router = APIRouter(tags=["V1 Job Context"])
_KINDS = {"plan", "photo", "document", "instruction"}


class OfficeNotePayload(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


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
        "uploaded_by_user_id": item.uploaded_by_user_id,
        "created_at": item.created_at,
    }


@router.get("/{job_id}/field-record")
async def get_field_record(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
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
    technician_ids = {item.technician_id for item in actions} | {
        item.technician_id for item in media
    }
    technicians = {}
    if technician_ids:
        rows = (
            await db.execute(select(Technician).where(Technician.id.in_(technician_ids)))
        ).scalars().all()
        technicians = {row.id: row.name for row in rows}

    latest_site = next(
        (item for item in observations if item.observation_type == "site_location"), None
    )
    reference_origin = "current_job" if latest_site is not None else None
    reference_job_id = job.id if latest_site is not None else None
    reference_match_basis = "current_job" if latest_site is not None else None
    reference_match_confidence = "high" if latest_site is not None else None
    if latest_site is None:
        match_clause, match_basis, match_confidence = site_match_clause(job)
        if match_basis != "none":
            inherited = (
                await db.execute(
                    select(JobSiteObservation)
                    .join(Job, Job.id == JobSiteObservation.job_id)
                    .where(
                        JobSiteObservation.observation_type == "site_location",
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
        "planned_location": {
            "address": job.service_address,
            "city": job.service_city,
            "zip": job.service_zip,
            "latitude": job.latitude,
            "longitude": job.longitude,
        },
        "field_reference_location": (
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
            }
            if latest_site is not None
            else None
        ),
        "site_observations": [
            {
                "id": item.id,
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
            }
            for item in observations
        ],
        "field_actions": [
            {
                "id": item.id,
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
        "instructions": {
            "special_instructions": job.special_instructions,
            "coordinator_comments": job.coordinator_comments,
            "notes": job.notes,
        },
    }


@router.post("/{job_id}/office-notes", status_code=201)
async def add_office_note(
    job_id: int,
    payload: OfficeNotePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    job = await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
    require_job_operations_access(job=job, current_user=current_user)
    entry = await log_job_activity(
        db,
        job_id=job_id,
        action="office_instruction",
        description=payload.text.strip(),
        metadata={"source": "web", "user_id": current_user.id, "role": current_user.role.value},
    )
    await db.commit()
    return {"id": entry.id, "text": entry.description, "created_at": entry.created_at}


@router.post("/{job_id}/attachments", status_code=201)
async def upload_office_attachment(
    job_id: int,
    kind: str = Form(...),
    title: str | None = Form(None),
    comment: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    if kind not in _KINDS:
        raise HTTPException(status_code=422, detail="Type de pièce jointe invalide.")
    job = await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
    require_job_operations_access(job=job, current_user=current_user)
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
    await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
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
    await require_job_read_access_by_id(db, job_id=job_id, current_user=current_user)
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
