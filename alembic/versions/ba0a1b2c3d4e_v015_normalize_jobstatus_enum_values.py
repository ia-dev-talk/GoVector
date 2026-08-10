"""v015 — Normalize jobstatus enum values to uppercase (SQLAlchemy naming)

Certaines lignes jobs.status contiennent 'en_route' (lowercase) au lieu de
'EN_ROUTE' (uppercase), ce qui casse le mapping SQLAlchemy :
  LookupError: 'en_route' is not among the defined enum values

Revision ID: ba0a1b2c3d4e
Revises: ea0a1b2c3d4e
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op


revision: str = "ba0a1b2c3d4e"
down_revision: Union[str, None] = "ea0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    for lowercase, uppercase in STATUS_MAP.items():
        op.execute(
            f"UPDATE jobs SET status = '{uppercase}' WHERE status = '{lowercase}'"
        )


def downgrade() -> None:
    for lowercase, uppercase in STATUS_MAP.items():
        op.execute(
            f"UPDATE jobs SET status = '{lowercase}' WHERE status = '{uppercase}'"
        )