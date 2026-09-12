"""V042 preserve operational import fields on jobs.

Revision ID: ft0p1q2r3s4t
Revises: es9n0p1q2r3s
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "ft0p1q2r3s4t"
down_revision = "es9n0p1q2r3s"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "operational_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "operational_data")
