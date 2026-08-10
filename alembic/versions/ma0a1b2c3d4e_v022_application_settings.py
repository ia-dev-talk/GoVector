"""v022 — application settings foundation

Revision ID: ma0a1b2c3d4e
Revises: la0a1b2c3d4e
Create Date: 2026-08-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "ma0a1b2c3d4e"
down_revision: Union[str, None] = "la0a1b2c3d4e"
branch_labels: Union[
    str,
    Sequence[str],
    None,
] = None
depends_on: Union[
    str,
    Sequence[str],
    None,
] = None


def upgrade() -> None:
    op.create_table(
        "application_settings",
        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "namespace",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "schema_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "revision",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "values",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "updated_by",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "namespace",
            name="uq_application_settings_namespace",
        ),
    )

    op.create_index(
        op.f("ix_application_settings_id"),
        "application_settings",
        ["id"],
        unique=False,
    )

    settings_table = sa.table(
        "application_settings",
        sa.column("namespace", sa.String(length=100)),
        sa.column("schema_version", sa.Integer()),
        sa.column("revision", sa.Integer()),
        sa.column(
            "values",
            postgresql.JSONB(astext_type=sa.Text()),
        ),
        sa.column("updated_by", sa.Integer()),
    )

    op.bulk_insert(
        settings_table,
        [
            {
                "namespace": "operational",
                "schema_version": 1,
                "revision": 1,
                "values": {
                    "gps_stale_after_minutes": None,
                },
                "updated_by": None,
            }
        ],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_application_settings_id"),
        table_name="application_settings",
    )
    op.drop_table("application_settings")
