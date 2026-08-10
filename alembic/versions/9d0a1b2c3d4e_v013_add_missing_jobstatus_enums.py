"""v013 — Ajout des valeurs manquantes à l'enum jobstatus PostgreSQL

Ajoute les nouveaux statuts définis dans le modèle Python JobStatus
qui n'ont jamais été migrés vers PostgreSQL :

en_route, on_site, work_in_progress, installation_done,
client_validation, client_absent, postponed, suspended

Revision ID: 9d0a1b2c3d4e
Revises: 8fd25ab9c9dd
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op


revision: str = "9d0a1b2c3d4e"
down_revision: Union[str, Sequence[str], None] = "8fd25ab9c9dd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ajouter les nouvelles valeurs à l'enum jobstatus PostgreSQL
    # ALTER TYPE ... ADD VALUE ne peut pas être fait dans une transaction
    # On utilise donc execute() en dehors de la transaction implicite

    new_values = [
        "en_route",
        "on_site",
        "work_in_progress",
        "installation_done",
        "client_validation",
        "client_absent",
        "postponed",
        "suspended",
    ]

    for val in new_values:
        op.execute(
            f"ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS '{val}'"
        )


def downgrade() -> None:
    # PostgreSQL ne permet pas de supprimer une valeur d'un enum
    # sans recréer le type. On ne peut pas downgrade proprement.
    # Cette opération est destructive et nécessite une migration manuelle.
    pass