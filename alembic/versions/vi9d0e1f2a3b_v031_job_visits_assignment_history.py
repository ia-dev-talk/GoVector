"""v031 preserve field visits and assignment history

Revision ID: vi9d0e1f2a3b
Revises: uh8c9d0e1f2a
"""

from alembic import op
import sqlalchemy as sa


revision = "vi9d0e1f2a3b"
down_revision = "uh8c9d0e1f2a"
branch_labels = None
depends_on = None


TERMINAL_VISIT_STATUSES = (
    "en_attente_validation",
    "completed",
    "cancelled",
    "failed",
    "client_absent",
    "postponed",
    "on_hold",
    "suspended",
)

EVIDENCE_TABLES = (
    "job_activity_logs",
    "technician_field_actions",
    "technician_media",
    "gps_history",
    "job_site_observations",
    "job_failures",
    "job_postponements",
)


def _drop_legacy_assignment_unique() -> None:
    inspector = sa.inspect(op.get_bind())
    for constraint in inspector.get_unique_constraints("assignments"):
        if constraint.get("column_names") == ["job_id"] and constraint.get("name"):
            op.drop_constraint(
                constraint["name"], "assignments", type_="unique"
            )


def upgrade() -> None:
    op.create_table(
        "job_visits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "job_id",
            sa.Integer(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column(
            "primary_technician_id",
            sa.Integer(),
            sa.ForeignKey("technicians.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("outcome", sa.String(length=32), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("work_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_latitude", sa.Float(), nullable=True),
        sa.Column("start_longitude", sa.Float(), nullable=True),
        sa.Column("end_latitude", sa.Float(), nullable=True),
        sa.Column("end_longitude", sa.Float(), nullable=True),
        sa.Column("backfill_confidence", sa.String(length=16), nullable=True),
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
            "job_id", "attempt_number", name="uq_job_visits_attempt"
        ),
    )
    op.create_index("ix_job_visits_job_id", "job_visits", ["job_id"])
    op.create_index(
        "ix_job_visits_primary_technician_id",
        "job_visits",
        ["primary_technician_id"],
    )
    op.create_index("ix_job_visits_status", "job_visits", ["status"])
    op.create_index("ix_job_visits_ended_at", "job_visits", ["ended_at"])
    op.create_index(
        "uq_job_visits_open_job",
        "job_visits",
        ["job_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )

    op.add_column("assignments", sa.Column("visit_id", sa.Integer(), nullable=True))
    op.add_column(
        "assignments", sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("assignments", sa.Column("end_reason", sa.String(40), nullable=True))
    op.add_column("assignments", sa.Column("assigned_by_user_id", sa.Integer(), nullable=True))
    op.add_column("assignments", sa.Column("ended_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_assignments_visit_id",
        "assignments",
        "job_visits",
        ["visit_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_assignments_assigned_by_user_id",
        "assignments",
        "users",
        ["assigned_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_assignments_ended_by_user_id",
        "assignments",
        "users",
        ["ended_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_assignments_visit_id", "assignments", ["visit_id"])
    op.create_index("ix_assignments_ended_at", "assignments", ["ended_at"])
    _drop_legacy_assignment_unique()

    for table_name in EVIDENCE_TABLES:
        op.add_column(table_name, sa.Column("visit_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{table_name}_visit_id",
            table_name,
            "job_visits",
            ["visit_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table_name}_visit_id", table_name, ["visit_id"])

    terminal_values = ", ".join(f"'{value}'" for value in TERMINAL_VISIT_STATUSES)
    op.execute(
        sa.text(
            f"""
            INSERT INTO job_visits (
                job_id, attempt_number, primary_technician_id, status, outcome,
                scheduled_at, assigned_at, accepted_at, started_at, arrived_at,
                work_started_at, ended_at, start_latitude, start_longitude,
                end_latitude, end_longitude, backfill_confidence
            )
            SELECT
                j.id,
                1,
                a.technician_id,
                lower(j.status::text),
                CASE
                    WHEN lower(j.status::text) IN ({terminal_values})
                    THEN lower(j.status::text)
                END,
                j.scheduled_date,
                a.assigned_at,
                j.accepted_at,
                j.started_at,
                j.arrival_time,
                CASE
                    WHEN lower(j.status::text) IN (
                        'in_progress', 'work_in_progress', 'installation_done',
                        'client_validation', 'en_attente_validation', 'completed'
                    ) THEN COALESCE(j.arrival_time, j.started_at)
                END,
                CASE
                    WHEN lower(j.status::text) IN ({terminal_values})
                    THEN COALESCE(j.completed_at, j.updated_at, CURRENT_TIMESTAMP)
                END,
                j.start_latitude,
                j.start_longitude,
                j.end_latitude,
                j.end_longitude,
                CASE
                    WHEN a.id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM job_activity_logs l WHERE l.job_id = j.id
                    ) THEN 'high'
                    WHEN a.id IS NOT NULL THEN 'medium'
                    ELSE 'low'
                END
            FROM jobs j
            LEFT JOIN assignments a ON a.job_id = j.id
            WHERE a.id IS NOT NULL
               OR lower(j.status::text) NOT IN ('pending')
               OR EXISTS (SELECT 1 FROM job_activity_logs x WHERE x.job_id = j.id)
               OR EXISTS (SELECT 1 FROM technician_field_actions x WHERE x.job_id = j.id)
               OR EXISTS (SELECT 1 FROM technician_media x WHERE x.job_id = j.id)
               OR EXISTS (SELECT 1 FROM gps_history x WHERE x.job_id = j.id)
               OR EXISTS (SELECT 1 FROM job_site_observations x WHERE x.job_id = j.id)
               OR EXISTS (SELECT 1 FROM job_failures x WHERE x.job_id = j.id)
               OR EXISTS (SELECT 1 FROM job_postponements x WHERE x.job_id = j.id)
            """
        )
    )

    op.execute(
        """
        UPDATE assignments a
        SET visit_id = v.id
        FROM job_visits v
        WHERE v.job_id = a.job_id AND v.attempt_number = 1
        """
    )
    op.execute(
        sa.text(
            f"""
            UPDATE assignments a
            SET ended_at = COALESCE(v.ended_at, CURRENT_TIMESTAMP),
                end_reason = COALESCE(v.outcome, 'legacy_terminal')
            FROM job_visits v
            WHERE v.id = a.visit_id
              AND v.status IN ({terminal_values})
            """
        )
    )
    for table_name in EVIDENCE_TABLES:
        op.execute(
            sa.text(
                f"""
                UPDATE {table_name} e
                SET visit_id = v.id
                FROM job_visits v
                WHERE v.job_id = e.job_id AND v.attempt_number = 1
                """
            )
        )

    op.create_index(
        "uq_assignments_current_job",
        "assignments",
        ["job_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )


def downgrade() -> None:
    duplicate_jobs = op.get_bind().execute(
        sa.text(
            "SELECT job_id FROM assignments GROUP BY job_id HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate_jobs is not None:
        raise RuntimeError(
            "Cannot downgrade v031 after historical assignments exist without losing data"
        )

    op.drop_index("uq_assignments_current_job", table_name="assignments")
    for table_name in reversed(EVIDENCE_TABLES):
        op.drop_index(f"ix_{table_name}_visit_id", table_name=table_name)
        op.drop_constraint(f"fk_{table_name}_visit_id", table_name, type_="foreignkey")
        op.drop_column(table_name, "visit_id")

    op.drop_index("ix_assignments_ended_at", table_name="assignments")
    op.drop_index("ix_assignments_visit_id", table_name="assignments")
    op.drop_constraint("fk_assignments_ended_by_user_id", "assignments", type_="foreignkey")
    op.drop_constraint("fk_assignments_assigned_by_user_id", "assignments", type_="foreignkey")
    op.drop_constraint("fk_assignments_visit_id", "assignments", type_="foreignkey")
    op.drop_column("assignments", "ended_by_user_id")
    op.drop_column("assignments", "assigned_by_user_id")
    op.drop_column("assignments", "end_reason")
    op.drop_column("assignments", "ended_at")
    op.drop_column("assignments", "visit_id")
    op.create_unique_constraint("uq_assignments_job_id", "assignments", ["job_id"])

    op.drop_index("uq_job_visits_open_job", table_name="job_visits")
    op.drop_index("ix_job_visits_ended_at", table_name="job_visits")
    op.drop_index("ix_job_visits_status", table_name="job_visits")
    op.drop_index("ix_job_visits_primary_technician_id", table_name="job_visits")
    op.drop_index("ix_job_visits_job_id", table_name="job_visits")
    op.drop_table("job_visits")
