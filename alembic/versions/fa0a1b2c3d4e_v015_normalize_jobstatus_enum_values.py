"""v015 — Normalize jobstatus enum values to uppercase (SQLAlchemy naming)

Les valeurs jobstatus dans PostgreSQL sont stockées de deux façons :
- Noms SQLAlchemy en MAJUSCULES : PENDING, ASSIGNED, IN_PROGRESS, EN_ROUTE, etc.
- Valeurs en minuscules ajoutées par une migration ALTER TYPE : en_route, on_site, etc.

SQLAlchemy utilise les NOMS des membres Python (par défaut), donc 'EN_ROUTE'.
Quand des lignes contiennent 'en_route', SQLAlchemy lève :
  LookupError: 'en_route' is not among the defined enum values

Cette migration normalise toutes les valeurs vers la convention SQLAlchemy (uppercase).

Revision ID: fa0a1b2c3d4e
Revises: ea0a1b2c3d4e
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op


revision: str = "ha0a1b2c3d4e"
down_revision: Union[str, None] = "ea0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mapping lowercase -> uppercase (SQLAlchemy convention)
STATUS_MAP = {
    "en_route": "EN_ROUTE",
    "on_site": "ON_SITE",
    "work_in_progress": "WORK_IN_PROGRESS",
    "installation_done": "INSTALLATION_DONE",
    "client_validation": "CLIENT_VALIDATION",
    "client_absent": "CLIENT_ABSENT",
    "postponed": "POSTPONED",
    "suspended": "SUSPENDED",
    "failed": "FAILED",
}


def upgrade() -> None:
    # Mettre à jour les valeurs en minuscules vers les noms SQLAlchemy (uppercase)
    for lowercase, uppercase in STATUS_MAP.items():
        op.execute(
            f"UPDATE jobs SET status = '{uppercase}' WHERE status = '{lowercase}'"
        )


def downgrade() -> None:
    # Restaurer les valeurs minuscules (unlikely, mais au cas où)
    for lowercase, uppercase in STATUS_MAP.items():
        op.execute(
            f"UPDATE jobs SET status = '{lowercase}' WHERE status = '{uppercase}'"
        )