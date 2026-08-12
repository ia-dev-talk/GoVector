"""v037 hierarchical GIS-ready territory registry

Revision ID: bo5j6k7l8m9n
Revises: an4i5d6e7f8g
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "bo5j6k7l8m9n"
down_revision = "an4i5d6e7f8g"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "territory_nodes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=80), nullable=True),
        sa.Column("name", sa.String(length=140), nullable=False),
        sa.Column("kind", sa.String(length=32), server_default="SECTOR", nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("legacy_sector_id", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("geometry_geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("centroid_latitude", sa.Float(), nullable=True),
        sa.Column("centroid_longitude", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=32), server_default="manual", nullable=False),
        sa.Column("external_id", sa.String(length=160), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["territory_nodes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["legacy_sector_id"], ["sectors.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("code", name="uq_territory_nodes_code"),
        sa.UniqueConstraint("parent_id", "name", name="uq_territory_nodes_parent_name"),
    )
    op.create_index("ix_territory_nodes_name", "territory_nodes", ["name"])
    op.create_index("ix_territory_nodes_kind", "territory_nodes", ["kind"])
    op.create_index("ix_territory_nodes_parent_id", "territory_nodes", ["parent_id"])
    op.create_index("ix_territory_nodes_legacy_sector_id", "territory_nodes", ["legacy_sector_id"])
    op.create_index("ix_territory_nodes_external_id", "territory_nodes", ["external_id"])


def downgrade():
    op.drop_index("ix_territory_nodes_external_id", table_name="territory_nodes")
    op.drop_index("ix_territory_nodes_legacy_sector_id", table_name="territory_nodes")
    op.drop_index("ix_territory_nodes_parent_id", table_name="territory_nodes")
    op.drop_index("ix_territory_nodes_kind", table_name="territory_nodes")
    op.drop_index("ix_territory_nodes_name", table_name="territory_nodes")
    op.drop_table("territory_nodes")
