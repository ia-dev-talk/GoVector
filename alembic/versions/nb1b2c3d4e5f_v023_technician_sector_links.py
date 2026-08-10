"""Add relational technician-sector assignments.

Revision ID: nb1b2c3d4e5f
Revises: ma0a1b2c3d4e
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa


revision = "nb1b2c3d4e5f"
down_revision = "ma0a1b2c3d4e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "technician_sectors",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "technician_id",
            sa.Integer(),
            sa.ForeignKey(
                "technicians.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column(
            "sector_id",
            sa.Integer(),
            sa.ForeignKey(
                "sectors.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "technician_id",
            "sector_id",
            name="uq_technician_sectors_technician_sector",
        ),
    )

    op.create_index(
        "ix_technician_sectors_technician_id",
        "technician_sectors",
        ["technician_id"],
        unique=False,
    )

    op.create_index(
        "ix_technician_sectors_sector_id",
        "technician_sectors",
        ["sector_id"],
        unique=False,
    )

    op.execute(
        """
        CREATE UNIQUE INDEX
            uq_technician_sectors_primary_per_technician
        ON technician_sectors (technician_id)
        WHERE is_primary IS TRUE
        """
    )

    # Preserve legacy assigned_routes values when they match an existing
    # sector name. Values that do not match remain untouched in the legacy
    # JSONB field and are not converted into detached references.
    op.execute(
        """
        WITH matched AS (
            SELECT DISTINCT
                t.id AS technician_id,
                s.id AS sector_id,
                ROW_NUMBER() OVER (
                    PARTITION BY t.id
                    ORDER BY s.name, s.id
                ) AS sector_rank
            FROM technicians AS t
            CROSS JOIN LATERAL
                jsonb_array_elements_text(
                    COALESCE(
                        t.assigned_routes,
                        '[]'::jsonb
                    )
                ) AS route_name(value)
            JOIN sectors AS s
              ON lower(trim(s.name))
                 = lower(trim(route_name.value))
        )
        INSERT INTO technician_sectors (
            technician_id,
            sector_id,
            is_primary
        )
        SELECT
            technician_id,
            sector_id,
            sector_rank = 1
        FROM matched
        ON CONFLICT (
            technician_id,
            sector_id
        ) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(
        "uq_technician_sectors_primary_per_technician",
        table_name="technician_sectors",
    )

    op.drop_index(
        "ix_technician_sectors_sector_id",
        table_name="technician_sectors",
    )

    op.drop_index(
        "ix_technician_sectors_technician_id",
        table_name="technician_sectors",
    )

    op.drop_table("technician_sectors")
