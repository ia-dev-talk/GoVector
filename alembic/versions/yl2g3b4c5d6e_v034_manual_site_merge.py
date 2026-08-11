"""v034 add controlled manual site merge audit

Revision ID: yl2g3b4c5d6e
Revises: xk1f2a3b4c5d
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "yl2g3b4c5d6e"
down_revision = "xk1f2a3b4c5d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sites",
        sa.Column(
            "merged_into_site_id",
            sa.Integer(),
            sa.ForeignKey("sites.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column("sites", sa.Column("merged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "sites",
        sa.Column(
            "merged_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("sites", sa.Column("merge_reason", sa.Text(), nullable=True))
    op.create_index("ix_sites_merged_into_site_id", "sites", ["merged_into_site_id"])
    op.create_check_constraint(
        "ck_sites_not_merged_into_self",
        "sites",
        "merged_into_site_id IS NULL OR merged_into_site_id <> id",
    )

    op.create_table(
        "site_merge_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "source_site_id",
            sa.Integer(),
            sa.ForeignKey("sites.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "target_site_id",
            sa.Integer(),
            sa.ForeignKey("sites.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "merged_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source_revision", sa.Integer(), nullable=False),
        sa.Column("target_revision_before", sa.Integer(), nullable=False),
        sa.Column("target_revision_after", sa.Integer(), nullable=False),
        sa.Column(
            "snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "source_site_id <> target_site_id",
            name="ck_site_merge_records_distinct_sites",
        ),
    )
    for column in ("source_site_id", "target_site_id", "merged_by_user_id"):
        op.create_index(
            f"ix_site_merge_records_{column}", "site_merge_records", [column]
        )


def downgrade() -> None:
    op.drop_table("site_merge_records")
    op.drop_constraint("ck_sites_not_merged_into_self", "sites", type_="check")
    op.drop_index("ix_sites_merged_into_site_id", table_name="sites")
    op.drop_column("sites", "merge_reason")
    op.drop_column("sites", "merged_by_user_id")
    op.drop_column("sites", "merged_at")
    op.drop_column("sites", "merged_into_site_id")
