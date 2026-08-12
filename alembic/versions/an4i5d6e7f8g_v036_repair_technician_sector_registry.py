"""v036 repair technician-sector registry on clean-bootstrap installations.

Revision ID: an4i5d6e7f8g
Revises: zm3h4c5d6e7f
"""

from alembic import op


revision = "an4i5d6e7f8g"
down_revision = "zm3h4c5d6e7f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older databases already own this table through v023. Databases created by
    # the first public-V2 metadata bootstrap were stamped at head without it.
    # IF NOT EXISTS makes this repair safe for both histories.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS technician_sectors (
            id SERIAL PRIMARY KEY,
            technician_id INTEGER NOT NULL
                REFERENCES technicians(id) ON DELETE CASCADE,
            sector_id INTEGER NOT NULL
                REFERENCES sectors(id) ON DELETE CASCADE,
            is_primary BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_technician_sectors_technician_sector
                UNIQUE (technician_id, sector_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_technician_sectors_technician_id
        ON technician_sectors (technician_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_technician_sectors_sector_id
        ON technician_sectors (sector_id)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
            uq_technician_sectors_primary_per_technician
        ON technician_sectors (technician_id)
        WHERE is_primary IS TRUE
        """
    )

    # The demo and legacy imports already carry technician -> orienteur links.
    # Promote the orienteur's main sector into the relational registry so map,
    # personnel and dispatch all see the same operational territory.
    op.execute(
        """
        INSERT INTO technician_sectors (
            technician_id,
            sector_id,
            is_primary
        )
        SELECT
            t.id,
            o.sector_id,
            FALSE
        FROM technicians AS t
        JOIN orienteurs AS o
          ON o.id = t.orienteur_id
        WHERE o.sector_id IS NOT NULL
        ON CONFLICT (technician_id, sector_id) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE technician_sectors AS ts
        SET is_primary = TRUE
        FROM technicians AS t
        JOIN orienteurs AS o
          ON o.id = t.orienteur_id
        WHERE ts.technician_id = t.id
          AND ts.sector_id = o.sector_id
          AND NOT EXISTS (
              SELECT 1
              FROM technician_sectors AS current_primary
              WHERE current_primary.technician_id = t.id
                AND current_primary.is_primary IS TRUE
          )
        """
    )


def downgrade() -> None:
    # This is a compatibility repair. Dropping a table that may pre-date this
    # revision would destroy legitimate assignments, so downgrade is no-op.
    pass
