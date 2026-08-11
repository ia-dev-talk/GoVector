"""v033 add structured site attribute provenance

Revision ID: xk1f2a3b4c5d
Revises: wj0e1f2a3b4c
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "xk1f2a3b4c5d"
down_revision = "wj0e1f2a3b4c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_attribute_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "site_id",
            sa.Integer(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "job_id",
            sa.Integer(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "visit_id",
            sa.Integer(),
            sa.ForeignKey("job_visits.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "field_action_id",
            sa.Integer(),
            sa.ForeignKey("technician_field_actions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attribute_key", sa.String(length=48), nullable=False),
        sa.Column("value_text", sa.String(length=255), nullable=False),
        sa.Column("normalized_value", sa.String(length=255), nullable=False),
        sa.Column(
            "value_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=32), server_default="mobile", nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "technician_id", sa.Integer(), sa.ForeignKey("technicians.id"), nullable=False
        ),
        sa.Column("base_site_revision", sa.Integer(), nullable=False),
        sa.Column(
            "resolution_status",
            sa.String(length=16),
            server_default="unreviewed",
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "resolved_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "resolution_status IN ('unreviewed', 'accepted', 'conflict', 'rejected')",
            name="ck_site_attribute_observations_resolution_status",
        ),
        sa.UniqueConstraint(
            "field_action_id", name="uq_site_attribute_observations_field_action"
        ),
    )
    for column in (
        "site_id",
        "job_id",
        "visit_id",
        "attribute_key",
        "user_id",
        "technician_id",
        "resolution_status",
        "occurred_at",
    ):
        op.create_index(
            f"ix_site_attribute_observations_{column}",
            "site_attribute_observations",
            [column],
        )

    op.create_table(
        "site_resolved_attributes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "site_id",
            sa.Integer(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attribute_key", sa.String(length=48), nullable=False),
        sa.Column("value_text", sa.String(length=255), nullable=False),
        sa.Column("normalized_value", sa.String(length=255), nullable=False),
        sa.Column(
            "value_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "source_observation_id",
            sa.Integer(),
            sa.ForeignKey("site_attribute_observations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "resolved_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "site_id",
            "attribute_key",
            name="uq_site_resolved_attributes_site_key",
        ),
    )
    op.create_index(
        "ix_site_resolved_attributes_site_id", "site_resolved_attributes", ["site_id"]
    )
    op.create_index(
        "ix_site_resolved_attributes_attribute_key",
        "site_resolved_attributes",
        ["attribute_key"],
    )

    # Existing site references are treated as prepared/backfilled facts. No
    # technician is retroactively credited and no missing value is invented.
    op.execute(
        """
        INSERT INTO site_resolved_attributes (
            site_id, attribute_key, value_text, normalized_value, value_json,
            resolved_at, revision
        )
        SELECT id, 'pto_reference', trim(pto_reference), upper(trim(pto_reference)),
               jsonb_build_object('source', 'site_v032_backfill'),
               coalesce(updated_at, created_at, CURRENT_TIMESTAMP), 1
        FROM sites
        WHERE nullif(trim(pto_reference), '') IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO site_resolved_attributes (
            site_id, attribute_key, value_text, normalized_value, value_json,
            resolved_at, revision
        )
        SELECT id, 'pbo_reference', trim(pbo_reference), upper(trim(pbo_reference)),
               jsonb_build_object('source', 'site_v032_backfill'),
               coalesce(updated_at, created_at, CURRENT_TIMESTAMP), 1
        FROM sites
        WHERE nullif(trim(pbo_reference), '') IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_site_resolved_attributes_attribute_key", table_name="site_resolved_attributes")
    op.drop_index("ix_site_resolved_attributes_site_id", table_name="site_resolved_attributes")
    op.drop_table("site_resolved_attributes")
    for column in reversed(
        (
            "site_id",
            "job_id",
            "visit_id",
            "attribute_key",
            "user_id",
            "technician_id",
            "resolution_status",
            "occurred_at",
        )
    ):
        op.drop_index(
            f"ix_site_attribute_observations_{column}",
            table_name="site_attribute_observations",
        )
    op.drop_table("site_attribute_observations")
