"""v021 — Merge Alembic heads

Revision ID: la0a1b2c3d4e
Revises: 9bd7709b492c, ka0a1b2c3d4e
Create Date: 2026-07-27
"""

from typing import Sequence, Union


revision: str = "la0a1b2c3d4e"
down_revision: Union[
    str,
    Sequence[str],
    None,
] = (
    "9bd7709b492c",
    "ka0a1b2c3d4e",
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
    pass


def downgrade() -> None:
    pass
