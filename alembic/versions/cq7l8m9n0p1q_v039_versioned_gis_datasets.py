"""v039 versioned GIS datasets for KML/KMZ

Revision ID: cq7l8m9n0p1q
Revises: bp6k7l8m9n0p
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "cq7l8m9n0p1q"
down_revision = "bp6k7l8m9n0p"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade():
    if not _table_exists("geo_import_profiles"):
        op.create_table(
            "geo_import_profiles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=32), nullable=False),
            sa.Column("client_organization_id", sa.Integer(), nullable=True),
            sa.Column("code", sa.String(length=80), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("mapping_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("style_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["client_organization_id"], ["client_organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("public_id", name="uq_geo_import_profiles_public_id"),
            sa.UniqueConstraint("client_organization_id", "code", name="uq_geo_import_profiles_org_code"),
        )
        op.create_index("ix_geo_import_profiles_public_id", "geo_import_profiles", ["public_id"])
        op.create_index("ix_geo_import_profiles_client_organization_id", "geo_import_profiles", ["client_organization_id"])
        op.create_index("ix_geo_import_profiles_is_active", "geo_import_profiles", ["is_active"])

    if not _table_exists("geo_datasets"):
        op.create_table(
            "geo_datasets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=32), nullable=False),
            sa.Column("client_organization_id", sa.Integer(), nullable=True),
            sa.Column("import_profile_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(length=180), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("source_type", sa.String(length=24), nullable=False),
            sa.Column("source_filename", sa.String(length=255), nullable=False),
            sa.Column("source_entry", sa.String(length=512), nullable=True),
            sa.Column("source_sha256", sa.String(length=64), nullable=False),
            sa.Column("source_size_bytes", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(length=24), server_default="DRAFT", nullable=False),
            sa.Column("feature_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("bbox_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("validation_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
            sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("published_by_user_id", sa.Integer(), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["client_organization_id"], ["client_organizations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["import_profile_id"], ["geo_import_profiles.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["published_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("public_id", name="uq_geo_datasets_public_id"),
        )
        for column in ("public_id", "client_organization_id", "import_profile_id", "name", "source_type", "source_sha256", "status", "created_by_user_id"):
            op.create_index(f"ix_geo_datasets_{column}", "geo_datasets", [column])

    if not _table_exists("geo_layers"):
        op.create_table(
            "geo_layers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=32), nullable=False),
            sa.Column("dataset_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=180), nullable=False),
            sa.Column("folder_path", sa.String(length=512), server_default="", nullable=False),
            sa.Column("feature_type", sa.String(length=64), server_default="UNCLASSIFIED", nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("style_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("field_schema_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("is_visible", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("is_editable", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("min_zoom", sa.Float(), nullable=True),
            sa.Column("max_zoom", sa.Float(), nullable=True),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["dataset_id"], ["geo_datasets.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("public_id", name="uq_geo_layers_public_id"),
        )
        op.create_index("ix_geo_layers_public_id", "geo_layers", ["public_id"])
        op.create_index("ix_geo_layers_dataset_id", "geo_layers", ["dataset_id"])
        op.create_index("ix_geo_layers_feature_type", "geo_layers", ["feature_type"])

    if not _table_exists("geo_features"):
        op.create_table(
            "geo_features",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("public_id", sa.String(length=32), nullable=False),
            sa.Column("layer_id", sa.Integer(), nullable=False),
            sa.Column("external_id", sa.String(length=255), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=True),
            sa.Column("geometry_type", sa.String(length=32), nullable=False),
            sa.Column("geometry_geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("bbox_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("bbox_min_longitude", sa.Float(), nullable=False),
            sa.Column("bbox_min_latitude", sa.Float(), nullable=False),
            sa.Column("bbox_max_longitude", sa.Float(), nullable=False),
            sa.Column("bbox_max_latitude", sa.Float(), nullable=False),
            sa.Column("centroid_latitude", sa.Float(), nullable=True),
            sa.Column("centroid_longitude", sa.Float(), nullable=True),
            sa.Column("asset_type", sa.String(length=64), server_default="UNCLASSIFIED", nullable=False),
            sa.Column("territory_node_id", sa.Integer(), nullable=True),
            sa.Column("site_id", sa.Integer(), nullable=True),
            sa.Column("nro_id", sa.Integer(), nullable=True),
            sa.Column("sro_id", sa.Integer(), nullable=True),
            sa.Column("pbo_id", sa.Integer(), nullable=True),
            sa.Column("pto_id", sa.Integer(), nullable=True),
            sa.Column("job_id", sa.Integer(), nullable=True),
            sa.Column("attributes_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("style_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("provenance_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("confidence", sa.String(length=16), nullable=True),
            sa.Column("status", sa.String(length=24), server_default="ACTIVE", nullable=False),
            sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["layer_id"], ["geo_layers.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["territory_node_id"], ["territory_nodes.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["nro_id"], ["nro.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["sro_id"], ["sro.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["pbo_id"], ["pbo.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["pto_id"], ["pto.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("public_id", name="uq_geo_features_public_id"),
        )
        for column in ("public_id", "layer_id", "external_id", "name", "geometry_type", "asset_type", "territory_node_id", "site_id", "nro_id", "sro_id", "pbo_id", "pto_id", "job_id", "status", "bbox_min_longitude", "bbox_min_latitude", "bbox_max_longitude", "bbox_max_latitude"):
            op.create_index(f"ix_geo_features_{column}", "geo_features", [column])
        op.create_index(
            "uq_geo_features_layer_external_id",
            "geo_features",
            ["layer_id", "external_id"],
            unique=True,
            postgresql_where=sa.text("external_id IS NOT NULL"),
        )

    if not _table_exists("geo_feature_revisions"):
        op.create_table(
            "geo_feature_revisions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("feature_id", sa.Integer(), nullable=False),
            sa.Column("operation", sa.String(length=24), nullable=False),
            sa.Column("revision_before", sa.Integer(), nullable=False),
            sa.Column("revision_after", sa.Integer(), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("before_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("after_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.ForeignKeyConstraint(["feature_id"], ["geo_features.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        )
        for column in ("feature_id", "operation", "actor_user_id", "created_at"):
            op.create_index(f"ix_geo_feature_revisions_{column}", "geo_feature_revisions", [column])


def downgrade():
    for table in (
        "geo_feature_revisions",
        "geo_features",
        "geo_layers",
        "geo_datasets",
        "geo_import_profiles",
    ):
        if _table_exists(table):
            op.drop_table(table)
