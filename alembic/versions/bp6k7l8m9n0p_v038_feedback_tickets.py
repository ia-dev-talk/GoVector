"""v038 native feedback tickets

Revision ID: bp6k7l8m9n0p
Revises: bo5j6k7l8m9n
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "bp6k7l8m9n0p"
down_revision = "bo5j6k7l8m9n"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "feedback_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("ticket_type", sa.String(length=24), nullable=False),
        sa.Column("severity", sa.String(length=16), server_default="NORMAL", nullable=False),
        sa.Column("status", sa.String(length=24), server_default="OPEN", nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("page", sa.String(length=80), nullable=True),
        sa.Column("entity_type", sa.String(length=80), nullable=True),
        sa.Column("entity_id", sa.String(length=120), nullable=True),
        sa.Column("context_json", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("public_id", name="uq_feedback_tickets_public_id"),
    )
    for column in ("public_id", "ticket_type", "severity", "status", "page", "entity_type", "entity_id", "created_by_user_id", "assigned_to_user_id"):
        op.create_index(f"ix_feedback_tickets_{column}", "feedback_tickets", [column])

    op.create_table(
        "feedback_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["feedback_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_feedback_comments_ticket_id", "feedback_comments", ["ticket_id"])
    op.create_index("ix_feedback_comments_author_user_id", "feedback_comments", ["author_user_id"])


def downgrade():
    op.drop_index("ix_feedback_comments_author_user_id", table_name="feedback_comments")
    op.drop_index("ix_feedback_comments_ticket_id", table_name="feedback_comments")
    op.drop_table("feedback_comments")
    for column in reversed(("public_id", "ticket_type", "severity", "status", "page", "entity_type", "entity_id", "created_by_user_id", "assigned_to_user_id")):
        op.drop_index(f"ix_feedback_tickets_{column}", table_name="feedback_tickets")
    op.drop_table("feedback_tickets")
