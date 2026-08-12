"""Native product feedback and issue tickets for authenticated BlueVector users."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_admin, require_internal_user
from backend.database.connection import get_db
from backend.database.feedback_models import FeedbackComment, FeedbackTicket
from backend.database.models import User, UserRole


router = APIRouter(prefix="/feedback", tags=["Product Feedback"])
_TYPES = {"BUG", "DATA", "UX", "IDEA", "OTHER"}
_SEVERITIES = {"LOW", "NORMAL", "HIGH", "BLOCKING"}
_STATUSES = {"OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"}


def _enum_text(value) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _public_id() -> str:
    now = datetime.now(timezone.utc)
    return f"BV-{now:%Y%m%d}-{uuid4().hex[:8].upper()}"


class TicketCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket_type: str = "BUG"
    severity: str = "NORMAL"
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(min_length=3, max_length=10000)
    page: Optional[str] = Field(default=None, max_length=80)
    entity_type: Optional[str] = Field(default=None, max_length=80)
    entity_id: Optional[str] = Field(default=None, max_length=120)
    context_json: dict = Field(default_factory=dict)

    @field_validator("ticket_type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        normalized = str(value).strip().upper()
        if normalized not in _TYPES:
            raise ValueError("Type de ticket invalide")
        return normalized

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, value: str) -> str:
        normalized = str(value).strip().upper()
        if normalized not in _SEVERITIES:
            raise ValueError("Sévérité invalide")
        return normalized

    @field_validator("title", "description")
    @classmethod
    def trim_required(cls, value: str) -> str:
        return str(value).strip()


class TicketAdminUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Optional[str] = None
    severity: Optional[str] = None
    assigned_to_user_id: Optional[int] = Field(default=None, gt=0)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().upper()
        if normalized not in _STATUSES:
            raise ValueError("Statut invalide")
        return normalized

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().upper()
        if normalized not in _SEVERITIES:
            raise ValueError("Sévérité invalide")
        return normalized


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("body")
    @classmethod
    def trim_body(cls, value: str) -> str:
        return str(value).strip()


def _comment_payload(comment: FeedbackComment) -> dict:
    return {
        "id": comment.id,
        "ticket_id": comment.ticket_id,
        "author_user_id": comment.author_user_id,
        "body": comment.body,
        "created_at": comment.created_at,
    }


def _ticket_payload(ticket: FeedbackTicket, *, include_comments: bool = True) -> dict:
    return {
        "id": ticket.id,
        "public_id": ticket.public_id,
        "ticket_type": ticket.ticket_type,
        "severity": ticket.severity,
        "status": ticket.status,
        "title": ticket.title,
        "description": ticket.description,
        "page": ticket.page,
        "entity_type": ticket.entity_type,
        "entity_id": ticket.entity_id,
        "context_json": ticket.context_json,
        "created_by_user_id": ticket.created_by_user_id,
        "assigned_to_user_id": ticket.assigned_to_user_id,
        "resolved_at": ticket.resolved_at,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "comments": [
            _comment_payload(comment)
            for comment in ticket.comments
        ] if include_comments else [],
    }


def _is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN or _enum_text(user.role).upper() == "ADMIN"


async def _ticket_for_user(db: AsyncSession, ticket_id: int, user: User) -> FeedbackTicket:
    ticket = await db.get(FeedbackTicket, ticket_id)
    if ticket is None:
        raise HTTPException(404, "Ticket introuvable")
    if not _is_admin(user) and ticket.created_by_user_id != user.id:
        raise HTTPException(403, "Ce ticket ne vous appartient pas")
    return ticket


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    document: TicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_internal_user),
):
    ticket = FeedbackTicket(
        public_id=_public_id(),
        created_by_user_id=current_user.id,
        **document.model_dump(),
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return _ticket_payload(ticket)


@router.get("")
async def list_tickets(
    ticket_status: Optional[str] = Query(None, alias="status"),
    ticket_type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_internal_user),
):
    statement = select(FeedbackTicket)
    if not _is_admin(current_user):
        statement = statement.where(FeedbackTicket.created_by_user_id == current_user.id)
    if ticket_status:
        statement = statement.where(FeedbackTicket.status == ticket_status.strip().upper())
    if ticket_type:
        statement = statement.where(FeedbackTicket.ticket_type == ticket_type.strip().upper())
    if severity:
        statement = statement.where(FeedbackTicket.severity == severity.strip().upper())
    tickets = (
        await db.execute(
            statement.order_by(FeedbackTicket.updated_at.desc()).limit(limit)
        )
    ).scalars().unique().all()
    return [_ticket_payload(ticket, include_comments=False) for ticket in tickets]


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_internal_user),
):
    return _ticket_payload(await _ticket_for_user(db, ticket_id, current_user))


@router.post("/{ticket_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    ticket_id: int,
    document: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_internal_user),
):
    ticket = await _ticket_for_user(db, ticket_id, current_user)
    comment = FeedbackComment(
        ticket_id=ticket.id,
        author_user_id=current_user.id,
        body=document.body,
    )
    ticket.updated_at = datetime.now(timezone.utc)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return _comment_payload(comment)


@router.patch("/{ticket_id}")
async def admin_update_ticket(
    ticket_id: int,
    document: TicketAdminUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    ticket = await db.get(FeedbackTicket, ticket_id)
    if ticket is None:
        raise HTTPException(404, "Ticket introuvable")

    changes = document.model_dump(exclude_unset=True)
    if "assigned_to_user_id" in changes and changes["assigned_to_user_id"] is not None:
        assignee = await db.get(User, changes["assigned_to_user_id"])
        if assignee is None or assignee.role == UserRole.CLIENT:
            raise HTTPException(422, "Responsable interne introuvable")

    for key, value in changes.items():
        setattr(ticket, key, value)
    if "status" in changes:
        if changes["status"] in {"RESOLVED", "CLOSED"}:
            ticket.resolved_at = datetime.now(timezone.utc)
        elif changes["status"] in {"OPEN", "IN_PROGRESS"}:
            ticket.resolved_at = None
    ticket.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket)
    return _ticket_payload(ticket)
