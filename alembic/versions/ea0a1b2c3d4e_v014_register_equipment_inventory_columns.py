"""v014 — Register equipment_inventory columns (min_stock_threshold, alert_enabled)

Ces colonnes existent déjà dans PostgreSQL (ajoutées via Base.metadata.create_all
mais jamais via une migration Alembic).
Cette migration les enregistre officiellement dans l'historique Alembic.

Revision ID: ea0a1b2c3d4e
Revises: 9d0a1b2c3d4e
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "ea0a1b2c3d4e"
down_revision: Union[str, None] = "9d0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Les colonnes existent déjà dans PostgreSQL.
    # On utilise IF NOT EXISTS pour être idempotent.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'equipment_inventory'
                AND column_name = 'min_stock_threshold'
            ) THEN
                ALTER TABLE equipment_inventory
                ADD COLUMN min_stock_threshold INTEGER NOT NULL DEFAULT 5;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'equipment_inventory'
                AND column_name = 'alert_enabled'
            ) THEN
                ALTER TABLE equipment_inventory
                ADD COLUMN alert_enabled BOOLEAN NOT NULL DEFAULT true;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_column("equipment_inventory", "alert_enabled")
    op.drop_column("equipment_inventory", "min_stock_threshold")