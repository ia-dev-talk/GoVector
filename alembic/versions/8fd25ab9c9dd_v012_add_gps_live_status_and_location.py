"""v012 — Ajout colonnes GPS temps réel et Live Status

Ajoute les colonnes manquantes dans la base PostgreSQL
qui sont présentes dans les modèles SQLAlchemy mais
qui n'ont jamais été migrées :

technicians :
  - live_status         (technicianlivestatus, NOT NULL, default 'deconnecte')
  - current_speed       (Float, nullable)
  - current_heading     (Float, nullable)
  - current_accuracy    (Float, nullable)
  - current_battery     (Integer, nullable)
  - current_job_id      (Integer, FK → jobs.id, nullable)

jobs :
  - start_latitude      (Float, nullable)
  - start_longitude     (Float, nullable)
  - end_latitude        (Float, nullable)
  - end_longitude       (Float, nullable)

Revision ID: 8fd25ab9c9dd
Revises: fb0a1b2c3d4e
Create Date: 2026-07-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "8fd25ab9c9dd"
down_revision: Union[Sequence[str], None] = [
    "a7fc1ca0d7d8",
    "fb0a1b2c3d4e",
    "v010_add_job_validation_status",
]
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ============================================================
    # technicians — Live Status (enum déjà créé précédemment)
    # ============================================================
    op.add_column(
        "technicians",
        sa.Column(
            "live_status",
            sa.Enum(
                "DISPONIBLE",
                "EN_INTERVENTION",
                "PAUSE",
                "HORS_SERVICE",
                "DECONNECTE",
                name="technicianlivestatus",
                create_type=False,
            ),
            nullable=False,
            server_default="DECONNECTE",
        ),
    )
    # On supprime le server_default après application pour
    # que seul le modèle Python gère la valeur par défaut
    op.alter_column("technicians", "live_status", server_default=None)

    # ============================================================
    # technicians — Champs GPS temps réel
    # ============================================================
    op.add_column(
        "technicians",
        sa.Column("current_speed", sa.Float(), nullable=True, server_default="0.0"),
    )
    op.alter_column("technicians", "current_speed", server_default=None)

    op.add_column(
        "technicians",
        sa.Column("current_heading", sa.Float(), nullable=True, server_default="0.0"),
    )
    op.alter_column("technicians", "current_heading", server_default=None)

    op.add_column(
        "technicians",
        sa.Column("current_accuracy", sa.Float(), nullable=True, server_default="0.0"),
    )
    op.alter_column("technicians", "current_accuracy", server_default=None)

    op.add_column(
        "technicians",
        sa.Column(
            "current_battery", sa.Integer(), nullable=True, server_default="100"
        ),
    )
    op.alter_column("technicians", "current_battery", server_default=None)

    # ============================================================
    # technicians — Intervention en cours
    # ============================================================
    op.add_column(
        "technicians",
        sa.Column("current_job_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_technicians_current_job_id",
        "technicians",
        "jobs",
        ["current_job_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_technicians_current_job_id"),
        "technicians",
        ["current_job_id"],
        unique=False,
    )

    # ============================================================
    # jobs — GPS départ et arrivée
    # ============================================================
    op.add_column(
        "jobs",
        sa.Column("start_latitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("start_longitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("end_latitude", sa.Float(), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column("end_longitude", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    # ============================================================
    # jobs — Retirer GPS départ/arrivée
    # ============================================================
    op.drop_column("jobs", "end_longitude")
    op.drop_column("jobs", "end_latitude")
    op.drop_column("jobs", "start_longitude")
    op.drop_column("jobs", "start_latitude")

    # ============================================================
    # technicians — Retirer intervention en cours
    # ============================================================
    op.drop_index(
        op.f("ix_technicians_current_job_id"), table_name="technicians"
    )
    op.drop_constraint(
        "fk_technicians_current_job_id", "technicians", type_="foreignkey"
    )
    op.drop_column("technicians", "current_job_id")

    # ============================================================
    # technicians — Retirer champs GPS
    # ============================================================
    op.drop_column("technicians", "current_battery")
    op.drop_column("technicians", "current_accuracy")
    op.drop_column("technicians", "current_heading")
    op.drop_column("technicians", "current_speed")

    # ============================================================
    # technicians — Retirer live_status
    # ============================================================
    op.drop_column("technicians", "live_status")