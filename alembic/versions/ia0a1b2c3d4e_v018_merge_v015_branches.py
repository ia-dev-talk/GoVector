"""v018 — Merge des deux branches v015 (normalize jobstatus)

Fusionne :
- ba0a1b2c3d4e (v015 via v014)
- ha0a1b2c3d4e (ex-fa0a1b2c3d4e, v015 via v014)

Ces deux migrations normalisent les jobstatus de façon similaire.
Cette merge revision garantit un arbre linéaire.

Revision ID: ia0a1b2c3d4e
Revises: ba0a1b2c3d4e, ha0a1b2c3d4e
Create Date: 2026-07-20
"""
from typing import Sequence, Union
from alembic import op

revision: str = "ia0a1b2c3d4e"
down_revision: Union[str, None] = ("ba0a1b2c3d4e", "ha0a1b2c3d4e")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge — aucune opération supplémentaire."""
    pass


def downgrade() -> None:
    """Merge — aucune opération supplémentaire."""
    pass