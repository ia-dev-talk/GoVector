"""v029 append-only job communications

Revision ID: tg7b8c9d0e1f
Revises: sf6a7b8c9d0e
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "tg7b8c9d0e1f"
down_revision = "sf6a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_communications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("event_id", sa.String(length=36), nullable=True),
        sa.Column("message_type", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("author_technician_id", sa.Integer(), nullable=True),
        sa.Column("author_role", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("audience", sa.String(length=16), nullable=False),
        sa.Column("requires_action", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="open", nullable=False),
        sa.Column("meta_data", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["author_technician_id"], ["technicians.id"]),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["parent_id"], ["job_communications.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    for column in (
        "job_id",
        "parent_id",
        "event_id",
        "message_type",
        "author_user_id",
        "author_technician_id",
        "status",
        "created_at",
    ):
        op.create_index(f"ix_job_communications_{column}", "job_communications", [column])


def downgrade() -> None:
    op.drop_table("job_communications")
