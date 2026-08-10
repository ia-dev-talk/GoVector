"""V1 organization, client access and durable field context.

Revision ID: re5f6a7b8c9d
Revises: qd4e5f6a7b8c
Create Date: 2026-08-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "re5f6a7b8c9d"
down_revision = "qd4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL enum is shared by users.role. IF NOT EXISTS keeps adoption safe.
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'CLIENT'")

    # Planned GPS is not evidence. An address-only work order must remain valid
    # until geocoding or a technician observation supplies reliable coordinates.
    op.alter_column("jobs", "latitude", existing_type=sa.Float(), nullable=True)
    op.alter_column("jobs", "longitude", existing_type=sa.Float(), nullable=True)
    op.alter_column(
        "jobs", "customer_name", existing_type=sa.String(length=100), nullable=True
    )
    op.alter_column(
        "jobs", "service_address", existing_type=sa.String(length=255), nullable=True
    )

    op.create_table(
        "client_organizations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("code", sa.String(length=50), nullable=False, unique=True),
        sa.Column("operator", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_client_organizations_code", "client_organizations", ["code"])
    op.create_index("ix_client_organizations_operator", "client_organizations", ["operator"])

    op.add_column(
        "users", sa.Column("client_organization_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_users_client_organization",
        "users",
        "client_organizations",
        ["client_organization_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_users_client_organization_id", "users", ["client_organization_id"]
    )

    op.add_column(
        "jobs", sa.Column("client_organization_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_jobs_client_organization",
        "jobs",
        "client_organizations",
        ["client_organization_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_jobs_client_organization_id", "jobs", ["client_organization_id"]
    )

    op.create_table(
        "field_teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("code", sa.String(length=50), nullable=True, unique=True),
        sa.Column(
            "orienteur_id",
            sa.Integer(),
            sa.ForeignKey("orienteurs.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_field_teams_code", "field_teams", ["code"])
    op.create_index("ix_field_teams_orienteur_id", "field_teams", ["orienteur_id"])

    op.create_table(
        "field_team_sectors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "team_id",
            sa.Integer(),
            sa.ForeignKey("field_teams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sector_id",
            sa.Integer(),
            sa.ForeignKey("sectors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("team_id", "sector_id", name="uq_field_team_sector"),
    )
    op.create_index("ix_field_team_sectors_team_id", "field_team_sectors", ["team_id"])
    op.create_index("ix_field_team_sectors_sector_id", "field_team_sectors", ["sector_id"])

    op.add_column(
        "technicians", sa.Column("team_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "technicians",
        sa.Column("grade", sa.String(length=20), nullable=False, server_default="junior"),
    )
    op.create_foreign_key(
        "fk_technicians_field_team",
        "technicians",
        "field_teams",
        ["team_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_technicians_team_id", "technicians", ["team_id"])

    op.create_table(
        "job_site_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column(
            "field_action_id",
            sa.Integer(),
            sa.ForeignKey("technician_field_actions.id"),
            nullable=True,
            unique=True,
        ),
        sa.Column("observation_type", sa.String(length=32), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "technician_id",
            sa.Integer(),
            sa.ForeignKey("technicians.id"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="mobile"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    for column in ("job_id", "observation_type", "user_id", "technician_id", "occurred_at"):
        op.create_index(
            f"ix_job_site_observations_{column}", "job_site_observations", [column]
        )

    op.create_table(
        "job_attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("attachment_id", sa.String(length=36), nullable=False, unique=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column(
            "uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    for column in ("attachment_id", "job_id", "uploaded_by_user_id"):
        op.create_index(f"ix_job_attachments_{column}", "job_attachments", [column])


def downgrade() -> None:
    op.drop_table("job_attachments")
    op.drop_table("job_site_observations")
    op.drop_index("ix_technicians_team_id", table_name="technicians")
    op.drop_constraint("fk_technicians_field_team", "technicians", type_="foreignkey")
    op.drop_column("technicians", "grade")
    op.drop_column("technicians", "team_id")
    op.drop_table("field_team_sectors")
    op.drop_table("field_teams")
    op.drop_index("ix_jobs_client_organization_id", table_name="jobs")
    op.drop_constraint("fk_jobs_client_organization", "jobs", type_="foreignkey")
    op.drop_column("jobs", "client_organization_id")
    op.drop_index("ix_users_client_organization_id", table_name="users")
    op.drop_constraint("fk_users_client_organization", "users", type_="foreignkey")
    op.drop_column("users", "client_organization_id")
    op.drop_table("client_organizations")
    # Do not force NOT NULL on downgrade: V1 may legitimately have created
    # incomplete dossiers (unknown customer/address/GPS). Inventing replacement
    # values just to satisfy older constraints would corrupt their meaning.
    # PostgreSQL enum values are intentionally not removed during downgrade.
