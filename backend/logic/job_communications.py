"""Structured, append-only office/field collaboration."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    JobAttachment,
    JobCommunication,
    TechnicianMedia,
    User,
    UserRole,
)
from backend.logic.activity_log import log_job_activity
from backend.logic.technician_jobs import TechnicianJobMutationError


MESSAGE_TYPES = {
    "message",
    "instruction",
    "correction_request",
    "reply",
    "acknowledgement",
}
AUDIENCES = {"office", "field", "both"}
ASSET_TYPES = {"office_attachment", "technician_media"}
ASSET_ROLES = {"attachment", "annotation", "reference"}
MAX_ASSETS_PER_COMMUNICATION = 6


def _clean_body(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


async def create_job_communication(
    db: AsyncSession,
    *,
    job_id: int,
    message_type: str,
    body: str | None,
    current_user: User,
    source: str,
    audience: str | None = None,
    parent_id: int | None = None,
    requires_action: bool | None = None,
    event_id: str | None = None,
    occurred_at: datetime | None = None,
    metadata: dict[str, Any] | None = None,
    asset_refs: list[dict[str, Any]] | None = None,
) -> JobCommunication:
    if message_type not in MESSAGE_TYPES:
        raise TechnicianJobMutationError(
            "rejected", "invalid_communication_type", "Type de message invalide"
        )
    body = _clean_body(body)
    assets = await validate_communication_assets(
        db,
        job_id=job_id,
        current_user=current_user,
        asset_refs=asset_refs or [],
    )
    if message_type != "acknowledgement" and body is None and not assets:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_payload",
            "Le message doit contenir un texte ou une pièce jointe",
        )
    if message_type == "correction_request" and current_user.role not in {
        UserRole.ADMIN,
        UserRole.CHEF_ORIENTEUR,
        UserRole.ORIENTEUR,
    }:
        raise TechnicianJobMutationError(
            "rejected", "permission_denied", "Seul le bureau peut demander une correction"
        )

    inferred_audience = audience or (
        "office" if current_user.role == UserRole.TECHNICIAN else "field"
    )
    if inferred_audience not in AUDIENCES:
        raise TechnicianJobMutationError(
            "rejected", "invalid_payload", "Audience du message invalide"
        )

    parent = None
    if parent_id is not None:
        parent = await db.scalar(
            select(JobCommunication).where(
                JobCommunication.id == parent_id,
                JobCommunication.job_id == job_id,
            )
        )
        if parent is None:
            raise TechnicianJobMutationError(
                "rejected", "communication_not_found", "Message parent introuvable"
            )

    created_at = occurred_at or datetime.now(timezone.utc)
    item = JobCommunication(
        job_id=job_id,
        parent_id=parent_id,
        event_id=event_id,
        message_type=message_type,
        body=body,
        author_user_id=current_user.id,
        author_technician_id=current_user.technician_id,
        author_role=current_user.role.value,
        source=source,
        audience=inferred_audience,
        requires_action=(
            message_type == "correction_request"
            if requires_action is None
            else bool(requires_action)
        ),
        status="open",
        meta_data={**(metadata or {}), "assets": assets} if assets else (metadata or {}),
        created_at=created_at,
    )
    db.add(item)
    await db.flush()

    if parent is not None and message_type == "acknowledgement":
        parent.status = "acknowledged"
        parent.acknowledged_at = created_at
    await log_job_activity(
        db,
        job_id=job_id,
        technician_id=current_user.technician_id,
        action=f"communication_{message_type}",
        description=body or (
            "Message pris en compte"
            if message_type == "acknowledgement"
            else "Pièce jointe ajoutée à l’échange"
        ),
        metadata={
            "source": source,
            "communication_id": item.id,
            "parent_id": parent_id,
            "audience": inferred_audience,
            "workflow_unchanged": True,
            "asset_count": len(assets),
        },
    )
    return item


def communication_dict(item: JobCommunication, author_name: str | None = None) -> dict:
    return {
        "id": item.id,
        "job_id": item.job_id,
        "parent_id": item.parent_id,
        "type": item.message_type,
        "body": item.body,
        "author_user_id": item.author_user_id,
        "author_technician_id": item.author_technician_id,
        "author_role": item.author_role,
        "author_name": author_name,
        "source": item.source,
        "audience": item.audience,
        "requires_action": item.requires_action,
        "status": item.status,
        "created_at": item.created_at,
        "acknowledged_at": item.acknowledged_at,
        "resolved_at": item.resolved_at,
        "attachments": list((item.meta_data or {}).get("assets") or []),
    }


async def validate_communication_assets(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
    asset_refs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validate immutable references without copying media into the message.

    The referenced upload remains the source of truth. The communication keeps
    only a typed link and optional derivation provenance.
    """
    if len(asset_refs) > MAX_ASSETS_PER_COMMUNICATION:
        raise TechnicianJobMutationError(
            "rejected",
            "too_many_attachments",
            f"Un échange accepte au maximum {MAX_ASSETS_PER_COMMUNICATION} pièces",
        )

    normalized: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for raw in asset_refs:
        if not isinstance(raw, dict):
            raise TechnicianJobMutationError(
                "rejected", "invalid_attachment", "Référence de pièce invalide"
            )
        asset_type = str(raw.get("asset_type") or "").strip()
        asset_id = str(raw.get("asset_id") or "").strip()
        role = str(raw.get("role") or "attachment").strip()
        if asset_type not in ASSET_TYPES or not asset_id or role not in ASSET_ROLES:
            raise TechnicianJobMutationError(
                "rejected", "invalid_attachment", "Référence de pièce invalide"
            )

        if asset_type == "office_attachment":
            exists = await db.scalar(
                select(JobAttachment).where(
                    JobAttachment.job_id == job_id,
                    JobAttachment.attachment_id == asset_id,
                )
            )
        else:
            query = select(TechnicianMedia).where(
                TechnicianMedia.job_id == job_id,
                TechnicianMedia.media_id == asset_id,
            )
            if current_user.role == UserRole.TECHNICIAN:
                query = query.where(
                    TechnicianMedia.technician_id == current_user.technician_id
                )
            exists = await db.scalar(query)
        if exists is None:
            raise TechnicianJobMutationError(
                "rejected",
                "attachment_not_found",
                "La pièce jointe n’appartient pas à cette intervention",
            )

        key = (asset_type, asset_id, role)
        if key in seen:
            continue
        seen.add(key)
        reference: dict[str, Any] = {
            "asset_type": asset_type,
            "asset_id": asset_id,
            "role": role,
        }
        annotation_of = raw.get("annotation_of")
        if isinstance(annotation_of, dict):
            origin_type = str(annotation_of.get("asset_type") or "").strip()
            origin_id = str(annotation_of.get("asset_id") or "").strip()
            if origin_type in ASSET_TYPES and origin_id:
                if origin_type == "office_attachment":
                    origin = await db.scalar(
                        select(JobAttachment).where(
                            JobAttachment.job_id == job_id,
                            JobAttachment.attachment_id == origin_id,
                        )
                    )
                else:
                    origin = await db.scalar(
                        select(TechnicianMedia).where(
                            TechnicianMedia.job_id == job_id,
                            TechnicianMedia.media_id == origin_id,
                        )
                    )
                if origin is None:
                    raise TechnicianJobMutationError(
                        "rejected",
                        "annotation_origin_not_found",
                        "La pièce annotée n’appartient pas à cette intervention",
                    )
                reference["annotation_of"] = {
                    "asset_type": origin_type,
                    "asset_id": origin_id,
                }
        normalized.append(reference)
    return normalized
