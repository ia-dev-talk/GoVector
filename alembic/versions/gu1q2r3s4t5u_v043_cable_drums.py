"""V043 physical cable drums, custody and measured consumption.

Revision ID: gu1q2r3s4t5u
Revises: ft0p1q2r3s4t
"""

from alembic import op
import sqlalchemy as sa


revision = "gu1q2r3s4t5u"
down_revision = "ft0p1q2r3s4t"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cable_drums",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("cable_type", sa.String(16), nullable=False),
        sa.Column("current_mark_m", sa.Float(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("assigned_technician_id", sa.Integer(), sa.ForeignKey("technicians.id", ondelete="SET NULL")),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("code", name="uq_cable_drums_code"),
    )
    op.create_index("ix_cable_drums_code", "cable_drums", ["code"])
    op.create_index("ix_cable_drums_type", "cable_drums", ["cable_type"])
    op.create_index("ix_cable_drums_status", "cable_drums", ["status"])
    op.create_index("ix_cable_drums_technician", "cable_drums", ["assigned_technician_id"])

    op.create_table(
        "cable_drum_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("drum_id", sa.Integer(), sa.ForeignKey("cable_drums.id", ondelete="CASCADE"), nullable=False),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("end_reason", sa.Text()),
    )
    op.create_index("ix_cable_drum_assignments_drum", "cable_drum_assignments", ["drum_id"])
    op.create_index("ix_cable_drum_assignments_technician", "cable_drum_assignments", ["technician_id"])
    op.create_index(
        "uq_cable_drum_assignments_active", "cable_drum_assignments", ["drum_id"],
        unique=True, postgresql_where=sa.text("ended_at IS NULL")
    )

    op.create_table(
        "cable_drum_consumptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.String(80), nullable=False, unique=True),
        sa.Column("drum_id", sa.Integer(), sa.ForeignKey("cable_drums.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visit_id", sa.Integer(), sa.ForeignKey("job_visits.id", ondelete="SET NULL")),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("cable_type", sa.String(16), nullable=False),
        sa.Column("cable_code", sa.String(80), nullable=False),
        sa.Column("start_mark_m", sa.Float(), nullable=False),
        sa.Column("end_mark_m", sa.Float(), nullable=False),
        sa.Column("quantity_m", sa.Float(), nullable=False),
        sa.Column("installation_mode", sa.String(8), nullable=False),
        sa.Column("continuity_justification", sa.Text()),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cable_drum_consumptions_event", "cable_drum_consumptions", ["event_id"])
    op.create_index("ix_cable_drum_consumptions_drum", "cable_drum_consumptions", ["drum_id"])
    op.create_index("ix_cable_drum_consumptions_job", "cable_drum_consumptions", ["job_id"])
    op.create_index("ix_cable_drum_consumptions_visit", "cable_drum_consumptions", ["visit_id"])
    op.create_index("ix_cable_drum_consumptions_technician", "cable_drum_consumptions", ["technician_id"])
    op.create_index("ix_cable_drum_consumptions_code", "cable_drum_consumptions", ["cable_code"])
    op.create_index("ix_cable_drum_consumptions_occurred", "cable_drum_consumptions", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("cable_drum_consumptions")
    op.drop_table("cable_drum_assignments")
    op.drop_table("cable_drums")
