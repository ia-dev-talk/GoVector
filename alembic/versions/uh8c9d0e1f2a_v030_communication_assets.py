"""v030 communication asset provenance

Revision ID: uh8c9d0e1f2a
Revises: tg7b8c9d0e1f
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "uh8c9d0e1f2a"
down_revision = "tg7b8c9d0e1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "job_attachments",
        sa.Column(
            "meta_data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("job_attachments", "meta_data")
