"""v041 durable integration references and exchange journal

Revision ID: es9n0p1q2r3s
Revises: dr8m9n0p1q2r
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "es9n0p1q2r3s"
down_revision = "dr8m9n0p1q2r"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    if not _table_exists("integration_external_references"):
        op.create_table(
            "integration_external_references",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("system", sa.String(length=32), nullable=False),
            sa.Column("entity_type", sa.String(length=64), nullable=False),
            sa.Column("local_entity_id", sa.Integer(), nullable=False),
            sa.Column("external_id", sa.String(length=255), nullable=False),
            sa.Column(
                "meta_data",
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
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.UniqueConstraint(
                "system",
                "entity_type",
                "local_entity_id",
                name="uq_integration_external_ref_local",
            ),
            sa.UniqueConstraint(
                "system",
                "entity_type",
                "external_id",
                name="uq_integration_external_ref_external",
            ),
        )
        for column in ("system", "entity_type", "local_entity_id", "external_id"):
            op.create_index(
                f"ix_integration_external_references_{column}",
                "integration_external_references",
                [column],
            )

    if not _table_exists("integration_exchanges"):
        op.create_table(
            "integration_exchanges",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("system", sa.String(length=32), nullable=False),
            sa.Column("direction", sa.String(length=16), nullable=False),
            sa.Column("operation", sa.String(length=80), nullable=False),
            sa.Column("idempotency_key", sa.String(length=255), nullable=False),
            sa.Column("entity_type", sa.String(length=64), nullable=True),
            sa.Column("local_entity_id", sa.Integer(), nullable=True),
            sa.Column("external_id", sa.String(length=255), nullable=True),
            sa.Column("request_hash", sa.String(length=64), nullable=False),
            sa.Column(
                "payload",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
            sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
            sa.Column("last_http_status", sa.Integer(), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column(
                "response_meta",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
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
                "system",
                "direction",
                "idempotency_key",
                name="uq_integration_exchange_idempotency",
            ),
        )
        for column in (
            "system",
            "direction",
            "operation",
            "entity_type",
            "local_entity_id",
            "external_id",
            "status",
            "next_attempt_at",
            "created_at",
        ):
            op.create_index(
                f"ix_integration_exchanges_{column}",
                "integration_exchanges",
                [column],
            )


def downgrade() -> None:
    if _table_exists("integration_exchanges"):
        op.drop_table("integration_exchanges")
    if _table_exists("integration_external_references"):
        op.drop_table("integration_external_references")
