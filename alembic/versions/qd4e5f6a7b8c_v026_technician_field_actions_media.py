"""Add technician field actions and durable media metadata.

Revision ID: qd4e5f6a7b8c
Revises: pc3d4e5f6a7b
Create Date: 2026-08-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "qd4e5f6a7b8c"
down_revision = "pc3d4e5f6a7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "technician_field_actions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "technician_id",
            sa.Integer(),
            sa.ForeignKey("technicians.id"),
            nullable=False,
        ),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "technician_id",
            "event_id",
            name="uq_technician_field_actions_technician_event",
        ),
    )
    for column in ("user_id", "technician_id", "job_id", "action_type", "occurred_at"):
        op.create_index(
            f"ix_technician_field_actions_{column}",
            "technician_field_actions",
            [column],
        )

    op.create_table(
        "technician_media",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("media_id", sa.String(length=36), nullable=False, unique=True),
        sa.Column("attachment_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "technician_id",
            sa.Integer(),
            sa.ForeignKey("technicians.id"),
            nullable=False,
        ),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column(
            "meta_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "technician_id",
            "attachment_id",
            name="uq_technician_media_technician_attachment",
        ),
    )
    for column in ("user_id", "technician_id", "job_id"):
        op.create_index(
            f"ix_technician_media_{column}",
            "technician_media",
            [column],
        )


def downgrade() -> None:
    op.drop_table("technician_media")
    op.drop_table("technician_field_actions")
