"""Add the accepted technician workflow state and timestamp.

Revision ID: pc3d4e5f6a7b
Revises: ob2c3d4e5f6a
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa


revision = "pc3d4e5f6a7b"
down_revision = "ob2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'ACCEPTED' AFTER 'ASSIGNED'"
    )
    op.add_column(
        "jobs",
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("jobs", "accepted_at")
    # PostgreSQL enum values cannot be removed safely without recreating the
    # type. ACCEPTED is intentionally left available on downgrade.
