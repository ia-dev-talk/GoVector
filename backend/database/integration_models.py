"""Durable integration identity and exchange journal models.

External systems never become BlueVector's primary-key authority.  These tables
keep stable cross-system references and idempotent inbound/outbound receipts so
failed Praxedo/QField exchanges can be inspected and replayed safely.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.models import Base


class IntegrationExternalReference(Base):
    __tablename__ = "integration_external_references"
    __table_args__ = (
        UniqueConstraint(
            "system",
            "entity_type",
            "local_entity_id",
            name="uq_integration_external_ref_local",
        ),
        UniqueConstraint(
            "system",
            "entity_type",
            "external_id",
            name="uq_integration_external_ref_external",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    system: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    local_entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    meta_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class IntegrationExchange(Base):
    __tablename__ = "integration_exchanges"
    __table_args__ = (
        UniqueConstraint(
            "system",
            "direction",
            "idempotency_key",
            name="uq_integration_exchange_idempotency",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    system: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    local_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        server_default="pending",
        nullable=False,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
        nullable=False,
    )
    last_http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_meta: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
