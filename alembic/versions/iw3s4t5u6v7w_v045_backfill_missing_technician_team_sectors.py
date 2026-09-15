"""v045 backfill technicians with no explicit sector from active team coverage

Revision ID: iw3s4t5u6v7w
Revises: hv2r3s4t5u6v
"""

from alembic import op


revision = "iw3s4t5u6v7w"
down_revision = "hv2r3s4t5u6v"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Preserve every explicit technician-sector choice already made by users.
    # Only technicians with zero registry rows inherit the active sectors that
    # their operational team already covers. This repairs historical/demo data
    # without broadening an explicitly configured technician.
    op.execute(
        """
        WITH inherited AS (
            SELECT
                t.id AS technician_id,
                fts.sector_id,
                ROW_NUMBER() OVER (
                    PARTITION BY t.id
                    ORDER BY fts.sector_id
                ) AS position
            FROM technicians AS t
            JOIN field_teams AS ft
              ON ft.id = t.team_id
             AND ft.is_active IS TRUE
            JOIN field_team_sectors AS fts
              ON fts.team_id = ft.id
            JOIN sectors AS s
              ON s.id = fts.sector_id
             AND s.is_active IS TRUE
            WHERE t.team_id IS NOT NULL
              AND t.is_active IS TRUE
              AND NOT EXISTS (
                  SELECT 1
                  FROM technician_sectors AS existing
                  WHERE existing.technician_id = t.id
              )
        )
        INSERT INTO technician_sectors (
            technician_id,
            sector_id,
            is_primary
        )
        SELECT
            technician_id,
            sector_id,
            position = 1
        FROM inherited
        ON CONFLICT (technician_id, sector_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # The inherited rows are indistinguishable from assignments that a user may
    # subsequently confirm or edit, so a destructive downgrade is unsafe.
    pass
