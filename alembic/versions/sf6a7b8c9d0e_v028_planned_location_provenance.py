"""v028 planned location provenance

Revision ID: sf6a7b8c9d0e
Revises: re5f6a7b8c9d
"""

from alembic import op
import sqlalchemy as sa


revision = "sf6a7b8c9d0e"
down_revision = "re5f6a7b8c9d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("planned_location_source", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("planned_location_precision", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("jobs", "planned_location_precision")
    op.drop_column("jobs", "planned_location_source")
