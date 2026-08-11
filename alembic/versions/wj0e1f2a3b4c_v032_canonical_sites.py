"""v032 add stable sites and geolocation resolution provenance

Revision ID: wj0e1f2a3b4c
Revises: vi9d0e1f2a3b
"""

from alembic import op
import sqlalchemy as sa


revision = "wj0e1f2a3b4c"
down_revision = "vi9d0e1f2a3b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=64), nullable=False),
        sa.Column(
            "client_organization_id",
            sa.Integer(),
            sa.ForeignKey("client_organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("operator", sa.String(length=50), nullable=True),
        sa.Column(
            "pto_id",
            sa.Integer(),
            sa.ForeignKey("pto.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "pbo_id",
            sa.Integer(),
            sa.ForeignKey("pbo.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("pto_reference", sa.String(length=100), nullable=True),
        sa.Column("pbo_reference", sa.String(length=100), nullable=True),
        sa.Column("address_snapshot", sa.String(length=255), nullable=True),
        sa.Column("city_snapshot", sa.String(length=100), nullable=True),
        sa.Column("zip_snapshot", sa.String(length=20), nullable=True),
        sa.Column("canonical_latitude", sa.Float(), nullable=True),
        sa.Column("canonical_longitude", sa.Float(), nullable=True),
        sa.Column("canonical_accuracy_m", sa.Float(), nullable=True),
        sa.Column("location_source", sa.String(length=32), nullable=True),
        sa.Column("resolved_observation_id", sa.Integer(), nullable=True),
        sa.Column(
            "resolved_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("match_basis", sa.String(length=40), nullable=False),
        sa.Column("match_confidence", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
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
        sa.UniqueConstraint("public_id", name="uq_sites_public_id"),
    )
    op.create_index("ix_sites_client_organization_id", "sites", ["client_organization_id"])
    op.create_index("ix_sites_pto_id", "sites", ["pto_id"])
    op.create_index("ix_sites_pbo_id", "sites", ["pbo_id"])
    op.create_index(
        "uq_sites_canonical_pto",
        "sites",
        ["pto_id"],
        unique=True,
        postgresql_where=sa.text("pto_id IS NOT NULL"),
    )
    op.create_index(
        "ix_sites_raw_pto_scope",
        "sites",
        ["pto_reference", "operator", "client_organization_id"],
    )

    op.add_column("jobs", sa.Column("site_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_jobs_site_id", "jobs", "sites", ["site_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_jobs_site_id", "jobs", ["site_id"])

    op.add_column("job_site_observations", sa.Column("site_id", sa.Integer(), nullable=True))
    op.add_column(
        "job_site_observations",
        sa.Column("resolution_status", sa.String(length=16), server_default="unreviewed", nullable=False),
    )
    op.add_column(
        "job_site_observations", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "job_site_observations", sa.Column("resolved_by_user_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_job_site_observations_site_id",
        "job_site_observations",
        "sites",
        ["site_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_job_site_observations_resolved_by_user_id",
        "job_site_observations",
        "users",
        ["resolved_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_job_site_observations_site_id", "job_site_observations", ["site_id"])
    op.create_index(
        "ix_job_site_observations_resolution_status",
        "job_site_observations",
        ["resolution_status"],
    )

    # Canonical PTO identifiers are safe to backfill automatically.
    op.execute(
        """
        INSERT INTO sites (
            public_id, client_organization_id, operator, pto_id, pbo_id,
            pto_reference, pbo_reference, address_snapshot, city_snapshot,
            zip_snapshot, match_basis, match_confidence
        )
        SELECT DISTINCT ON (j.pto_id)
            'legacy-pto-' || j.pto_id,
            j.client_organization_id, j.operator, j.pto_id, j.pbo_id,
            j.pto_raw, j.pbo_raw, j.service_address, j.service_city,
            j.service_zip, 'pto_id', 'high'
        FROM jobs j
        WHERE j.pto_id IS NOT NULL
        ORDER BY j.pto_id, j.updated_at DESC, j.id DESC
        """
    )
    op.execute(
        """
        UPDATE jobs j SET site_id = s.id
        FROM sites s
        WHERE j.pto_id IS NOT NULL AND s.pto_id = j.pto_id
        """
    )

    # A raw PTO is accepted only inside the same operator/client scope.
    op.execute(
        """
        INSERT INTO sites (
            public_id, client_organization_id, operator, pbo_id,
            pto_reference, pbo_reference, address_snapshot, city_snapshot,
            zip_snapshot, match_basis, match_confidence
        )
        SELECT DISTINCT ON (
            lower(trim(j.pto_raw)), coalesce(lower(j.operator), ''),
            coalesce(j.client_organization_id, 0)
        )
            'legacy-raw-' || substr(md5(
                lower(trim(j.pto_raw)) || '|' || coalesce(lower(j.operator), '') ||
                '|' || coalesce(j.client_organization_id::text, '0')
            ), 1, 32),
            j.client_organization_id, j.operator, j.pbo_id,
            j.pto_raw, j.pbo_raw, j.service_address, j.service_city,
            j.service_zip, 'pto_reference', 'high'
        FROM jobs j
        WHERE j.site_id IS NULL AND nullif(trim(j.pto_raw), '') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM sites existing
              WHERE lower(trim(existing.pto_reference)) = lower(trim(j.pto_raw))
                AND coalesce(lower(existing.operator), '') = coalesce(lower(j.operator), '')
                AND coalesce(existing.client_organization_id, 0) = coalesce(j.client_organization_id, 0)
          )
        ORDER BY
            lower(trim(j.pto_raw)), coalesce(lower(j.operator), ''),
            coalesce(j.client_organization_id, 0), j.updated_at DESC, j.id DESC
        """
    )
    op.execute(
        """
        UPDATE jobs j SET site_id = s.id
        FROM sites s
        WHERE j.site_id IS NULL
          AND nullif(trim(j.pto_raw), '') IS NOT NULL
          AND lower(trim(s.pto_reference)) = lower(trim(j.pto_raw))
          AND coalesce(lower(s.operator), '') = coalesce(lower(j.operator), '')
          AND coalesce(s.client_organization_id, 0) = coalesce(j.client_organization_id, 0)
        """
    )

    # An explicit historic technician site fix gets a stable container, but is
    # never merged with another address-only order by the migration.
    op.execute(
        """
        INSERT INTO sites (
            public_id, client_organization_id, operator, pbo_id,
            pbo_reference, address_snapshot, city_snapshot, zip_snapshot,
            match_basis, match_confidence
        )
        SELECT
            'legacy-job-' || j.id, j.client_organization_id, j.operator,
            j.pbo_id, j.pbo_raw, j.service_address, j.service_city,
            j.service_zip, 'explicit_field_observation', 'high'
        FROM jobs j
        WHERE j.site_id IS NULL
          AND EXISTS (
              SELECT 1 FROM job_site_observations o
              WHERE o.job_id = j.id AND o.observation_type = 'site_location'
          )
        """
    )
    op.execute(
        """
        UPDATE jobs j SET site_id = s.id
        FROM sites s
        WHERE j.site_id IS NULL AND s.public_id = 'legacy-job-' || j.id
        """
    )
    # Reuse an explicit observed site for other orders only when the complete
    # structured address and scope match exactly and produce one candidate.
    op.execute(
        """
        UPDATE jobs j SET site_id = candidate.site_id
        FROM (
            SELECT j2.id AS job_id, min(s.id) AS site_id
            FROM jobs j2
            JOIN sites s
              ON lower(trim(s.address_snapshot)) = lower(trim(j2.service_address))
             AND lower(trim(s.city_snapshot)) = lower(trim(j2.service_city))
             AND s.zip_snapshot = j2.service_zip
             AND coalesce(lower(s.operator), '') = coalesce(lower(j2.operator), '')
             AND coalesce(s.client_organization_id, 0) = coalesce(j2.client_organization_id, 0)
            WHERE j2.site_id IS NULL
              AND nullif(trim(j2.service_address), '') IS NOT NULL
              AND nullif(trim(j2.service_city), '') IS NOT NULL
              AND nullif(trim(j2.service_zip), '') IS NOT NULL
            GROUP BY j2.id
            HAVING count(DISTINCT s.id) = 1
        ) candidate
        WHERE j.id = candidate.job_id
        """
    )
    op.execute(
        """
        UPDATE job_site_observations o SET site_id = j.site_id
        FROM jobs j WHERE j.id = o.job_id AND j.site_id IS NOT NULL
        """
    )

    # Preserve the latest explicit historic site fix as the initial canonical
    # reference. Older observations remain unreviewed and visible.
    op.execute(
        """
        WITH latest AS (
            SELECT DISTINCT ON (o.site_id)
                o.site_id, o.id, o.latitude, o.longitude, o.accuracy_m,
                o.user_id, o.occurred_at
            FROM job_site_observations o
            WHERE o.site_id IS NOT NULL AND o.observation_type = 'site_location'
            ORDER BY o.site_id, o.occurred_at DESC, o.id DESC
        )
        UPDATE sites s SET
            canonical_latitude = latest.latitude,
            canonical_longitude = latest.longitude,
            canonical_accuracy_m = latest.accuracy_m,
            location_source = 'technician_confirmed',
            resolved_observation_id = latest.id,
            resolved_by_user_id = latest.user_id,
            resolved_at = latest.occurred_at,
            revision = 1,
            updated_at = CURRENT_TIMESTAMP
        FROM latest WHERE latest.site_id = s.id
        """
    )
    op.execute(
        """
        UPDATE job_site_observations o SET
            resolution_status = 'accepted',
            resolved_at = s.resolved_at,
            resolved_by_user_id = s.resolved_by_user_id
        FROM sites s WHERE s.resolved_observation_id = o.id
        """
    )
    op.create_foreign_key(
        "fk_sites_resolved_observation_id",
        "sites",
        "job_site_observations",
        ["resolved_observation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sites_resolved_observation_id", "sites", type_="foreignkey")
    op.drop_index("ix_job_site_observations_resolution_status", table_name="job_site_observations")
    op.drop_index("ix_job_site_observations_site_id", table_name="job_site_observations")
    op.drop_constraint(
        "fk_job_site_observations_resolved_by_user_id",
        "job_site_observations",
        type_="foreignkey",
    )
    op.drop_constraint("fk_job_site_observations_site_id", "job_site_observations", type_="foreignkey")
    op.drop_column("job_site_observations", "resolved_by_user_id")
    op.drop_column("job_site_observations", "resolved_at")
    op.drop_column("job_site_observations", "resolution_status")
    op.drop_column("job_site_observations", "site_id")
    op.drop_index("ix_jobs_site_id", table_name="jobs")
    op.drop_constraint("fk_jobs_site_id", "jobs", type_="foreignkey")
    op.drop_column("jobs", "site_id")
    op.drop_index("ix_sites_raw_pto_scope", table_name="sites")
    op.drop_index("uq_sites_canonical_pto", table_name="sites")
    op.drop_index("ix_sites_pbo_id", table_name="sites")
    op.drop_index("ix_sites_pto_id", table_name="sites")
    op.drop_index("ix_sites_client_organization_id", table_name="sites")
    op.drop_table("sites")
