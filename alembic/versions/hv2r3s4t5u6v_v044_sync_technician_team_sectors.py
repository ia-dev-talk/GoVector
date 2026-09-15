"""v044 sync explicit technician sectors to canonical team coverage

Revision ID: hv2r3s4t5u6v
Revises: gu1q2r3s4t5u
"""

from alembic import op


revision = "hv2r3s4t5u6v"
down_revision = "gu1q2r3s4t5u"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # These links were explicitly selected by users in Personnel/Secteurs.
    # Project them into the team-wide table enforced by assignment policy.
    op.execute(
        """
        INSERT INTO field_team_sectors (team_id, sector_id, created_at)
        SELECT DISTINCT t.team_id, ts.sector_id, CURRENT_TIMESTAMP
        FROM technician_sectors AS ts
        JOIN technicians AS t ON t.id = ts.technician_id
        JOIN sectors AS s ON s.id = ts.sector_id
        WHERE t.team_id IS NOT NULL
          AND s.is_active IS TRUE
        ON CONFLICT (team_id, sector_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Additive reconciliation is retained: an existing team/sector pair cannot
    # be attributed safely to this migration after the fact.
    pass
