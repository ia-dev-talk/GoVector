"""Structured, append-only office/field collaboration."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import JobCommunication, User, UserRole
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
) -> JobCommunication:
    if message_type not in MESSAGE_TYPES:
        raise TechnicianJobMutationError(
            "rejected", "invalid_communication_type", "Type de message invalide"
        )
    body = _clean_body(body)
    if message_type != "acknowledgement" and body is None:
        raise TechnicianJobMutationError(
            "rejected", "invalid_payload", "Le message ne peut pas être vide"
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
        meta_data=metadata or {},
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
        description=body or "Message pris en compte",
        metadata={
            "source": source,
            "communication_id": item.id,
            "parent_id": parent_id,
            "audience": inferred_audience,
            "workflow_unchanged": True,
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
    }
