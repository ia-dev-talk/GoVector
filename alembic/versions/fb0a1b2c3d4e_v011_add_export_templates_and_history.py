"""v011_add_export_templates_and_history

Ajoute les tables ExportTemplate et ExportHistory
pour le Centre Import/Export Professionnel FTTH.
"""
import json
from typing import Optional, List

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'fb0a1b2c3d4e'
down_revision: str = 'fa0a1b2c3d4e'
branch_labels: Optional[str] = None
depends_on: Optional[List[str]] = None


def upgrade() -> None:
    # ExportTemplate - Modèles d'export personnalisés
    op.create_table(
        'export_templates',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('export_type', sa.String(20), nullable=False, server_default='excel'),
        sa.Column('columns', JSONB, nullable=False, server_default='[]'),
        sa.Column('filters', JSONB, nullable=True, server_default='{}'),
        sa.Column('include_photos', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('include_signatures', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # ExportHistory - Historique des exports générés
    op.create_table(
        'export_history',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True, index=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('export_templates.id'), nullable=True),
        sa.Column('export_name', sa.String(200), nullable=False),
        sa.Column('export_format', sa.String(20), nullable=False),
        sa.Column('job_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('filters_used', JSONB, nullable=True, server_default='{}'),
        sa.Column('columns_used', JSONB, nullable=True, server_default='[]'),
        sa.Column('has_photos', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_signatures', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='completed'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table('export_history')
    op.drop_table('export_templates')