import json
import re
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.tech_media import TechnicianMediaResponse
from backend.auth.dependencies import require_technician
from backend.config import get_settings
from backend.database.connection import get_db
from backend.database.models import TechnicianMedia, User
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)
from backend.services.media_storage import FileSystemMediaStorage, MediaStorageError


router = APIRouter(tags=["Technician Media (Mobile)"])
_SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")
_KINDS = {"photo", "video", "document", "signature"}
_DOCUMENT_MIME_TYPES = {
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _maximum_bytes(kind: str) -> int:
    settings = get_settings()
    return {
        "photo": settings.TECHNICIAN_PHOTO_MAX_BYTES,
        "signature": settings.TECHNICIAN_PHOTO_MAX_BYTES,
        "document": settings.TECHNICIAN_DOCUMENT_MAX_BYTES,
        "video": settings.TECHNICIAN_VIDEO_MAX_BYTES,
    }[kind]


def _validate_mime(kind: str, mime_type: str) -> None:
    valid = (
        (kind in {"photo", "signature"} and mime_type.startswith("image/"))
        or (kind == "video" and mime_type.startswith("video/"))
        or (kind == "document" and mime_type in _DOCUMENT_MIME_TYPES)
    )
    if not valid:
        raise HTTPException(status_code=415, detail="Type MIME incompatible")


@router.post("/media", response_model=TechnicianMediaResponse)
async def upload_technician_media(
    attachment_id: UUID = Form(...),
    job_id: int = Form(..., gt=0),
    kind: str = Form(...),
    sha256: str = Form(...),
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> TechnicianMediaResponse:
    if kind not in _KINDS:
        raise HTTPException(status_code=422, detail="Type de média invalide")
    if not _SHA256.fullmatch(sha256):
        raise HTTPException(status_code=422, detail="SHA-256 invalide")
    mime_type = (file.content_type or "application/octet-stream").lower()
    _validate_mime(kind, mime_type)
    try:
        parsed_metadata = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Metadata JSON invalide") from exc
    if not isinstance(parsed_metadata, dict):
        raise HTTPException(status_code=422, detail="Metadata doit être un objet JSON")

    try:
        await require_assigned_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        code = 404 if exc.code == "job_not_found" else 403
        raise HTTPException(status_code=code, detail=exc.message) from exc

    existing_result = await db.execute(
        select(TechnicianMedia).where(
            TechnicianMedia.technician_id == current_user.technician_id,
            TechnicianMedia.attachment_id == str(attachment_id),
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        if existing.job_id != job_id or existing.sha256 != sha256.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="attachment_id déjà utilisé avec un contenu différent",
            )
        response = TechnicianMediaResponse.model_validate(existing)
        return response.model_copy(update={"idempotent_replay": True})

    suffix = Path(file.filename or "").suffix.lower()[:12]
    storage_key = f"{current_user.technician_id}/{attachment_id}{suffix}"
    storage = FileSystemMediaStorage(Path(get_settings().TECHNICIAN_MEDIA_ROOT))
    try:
        stored = await storage.store(
            file,
            storage_key=storage_key,
            expected_sha256=sha256,
            maximum_bytes=_maximum_bytes(kind),
        )
    except MediaStorageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    media = TechnicianMedia(
        media_id=str(uuid4()),
        attachment_id=str(attachment_id),
        user_id=current_user.id,
        technician_id=current_user.technician_id,
        job_id=job_id,
        kind=kind,
        storage_key=stored.storage_key,
        original_filename=file.filename,
        mime_type=mime_type,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        meta_data=parsed_metadata,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return TechnicianMediaResponse.model_validate(media)
