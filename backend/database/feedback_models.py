"""User feedback / issue tracker persisted inside BlueVector."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.models import Base


class FeedbackTicket(Base):
    __tablename__ = "feedback_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    ticket_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="NORMAL", server_default="NORMAL", index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="OPEN", server_default="OPEN", index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[Optional[str]] = mapped_column(String(80), index=True)
    entity_type: Mapped[Optional[str]] = mapped_column(String(80), index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(120), index=True)
    context_json: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    comments: Mapped[list["FeedbackComment"]] = relationship(
        "FeedbackComment",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="FeedbackComment.created_at",
        lazy="selectin",
    )


class FeedbackComment(Base):
    __tablename__ = "feedback_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(Integer, ForeignKey("feedback_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False)

    ticket: Mapped[FeedbackTicket] = relationship("FeedbackTicket", back_populates="comments")
