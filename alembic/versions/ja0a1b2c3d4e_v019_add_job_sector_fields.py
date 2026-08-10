"""v019 — Add Job sector fields

Revision ID: ja0a1b2c3d4e
Revises: ca0a1b2c3d4e, da0a1b2c3d4e
Create Date: 2026-07-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ja0a1b2c3d4e"
down_revision: Union[
    str,
    Sequence[str],
    None,
] = (
    "ca0a1b2c3d4e",
    "da0a1b2c3d4e",
)
branch_labels: Union[
    str,
    Sequence[str],
    None,
] = None
depends_on: Union[
    str,
    Sequence[str],
    None,
] = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "sector_raw",
            sa.String(length=100),
            nullable=True,
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "sector_id",
            sa.Integer(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_jobs_sector_id_sectors",
        "jobs",
        "sectors",
        ["sector_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_jobs_sector_id",
        "jobs",
        ["sector_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_jobs_sector_id",
        table_name="jobs",
    )
    op.drop_constraint(
        "fk_jobs_sector_id_sectors",
        "jobs",
        type_="foreignkey",
    )
    op.drop_column(
        "jobs",
        "sector_id",
    )
    op.drop_column(
        "jobs",
        "sector_raw",
    )
