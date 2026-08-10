"""v016 — Ajout arrival_time, started_by dans jobs

Revision ID: ca0a1b2c3d4e
Revises: ba0a1b2c3d4e
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "ca0a1b2c3d4e"
down_revision: Union[str, None] = "ia0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("arrival_time", sa.DateTime(timezone=True), nullable=True))
    op.add_column("jobs", sa.Column("started_by", sa.Integer(), sa.ForeignKey("technicians.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "started_by")
    op.drop_column("jobs", "arrival_time")