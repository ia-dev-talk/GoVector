"""v009 orienteurs, tech login, wifi box scan

Revision ID: fd0a1b2c3d4e
Revises: a7fc1ca0d7d8
Create Date: 2026-07-01 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'fd0a1b2c3d4e'
down_revision: Union[str, None] = 'a7fc1ca0d7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === 1. Nouvelle table orienteurs ===
    op.create_table('orienteurs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('sector_id', sa.Integer(), sa.ForeignKey('sectors.id'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_orienteurs_id', 'orienteurs', ['id'])
    op.create_index('ix_orienteurs_sector_id', 'orienteurs', ['sector_id'])

    # === 2. Nouvelle table orienteur_sectors (relation N:N) ===
    op.create_table('orienteur_sectors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('orienteur_id', sa.Integer(), sa.ForeignKey('orienteurs.id'), nullable=False),
        sa.Column('sector_name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_orienteur_sectors_id', 'orienteur_sectors', ['id'])

    # === 3. Ajout des colonnes login pour techniciens ===
    op.add_column('technicians', sa.Column('username', sa.String(length=100), nullable=True, unique=True))
    op.add_column('technicians', sa.Column('password_hash', sa.String(length=255), nullable=True))

    # === 4. Ajout orienteur_id dans technicians ===
    op.add_column('technicians', sa.Column('orienteur_id', sa.Integer(), sa.ForeignKey('orienteurs.id'), nullable=True))

    # === 5. Ajout orienteur_id dans jobs ===
    op.add_column('jobs', sa.Column('orienteur_id', sa.Integer(), sa.ForeignKey('orienteurs.id'), nullable=True))

    # === 6. Ajout des colonnes GPS depart/arrivee ===
    op.add_column('jobs', sa.Column('start_latitude', sa.Float(), nullable=True))
    op.add_column('jobs', sa.Column('start_longitude', sa.Float(), nullable=True))
    op.add_column('jobs', sa.Column('end_latitude', sa.Float(), nullable=True))
    op.add_column('jobs', sa.Column('end_longitude', sa.Float(), nullable=True))

    # === 7. Ajout de departement et role utilisateur ===
    op.add_column('users', sa.Column('orienteur_id', sa.Integer(), sa.ForeignKey('orienteurs.id'), nullable=True))
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'CHEF_ORIENTEUR'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'COORDINATEUR'")
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SUPERVISEUR'")

    # === 8. Index sur technicians ===
    op.create_index('ix_technicians_username', 'technicians', ['username'], unique=True)
    op.create_index('ix_technicians_orienteur_id', 'technicians', ['orienteur_id'])


def downgrade() -> None:
    op.drop_index('ix_technicians_orienteur_id', table_name='technicians')
    op.drop_index('ix_technicians_username', table_name='technicians')
    op.drop_column('users', 'orienteur_id')
    op.drop_column('jobs', 'end_longitude')
    op.drop_column('jobs', 'end_latitude')
    op.drop_column('jobs', 'start_longitude')
    op.drop_column('jobs', 'start_latitude')
    op.drop_column('jobs', 'orienteur_id')
    op.drop_column('technicians', 'orienteur_id')
    op.drop_column('technicians', 'password_hash')
    op.drop_column('technicians', 'username')
    op.drop_index('ix_orienteur_sectors_id', table_name='orienteur_sectors')
    op.drop_table('orienteur_sectors')
    op.drop_index('ix_orienteurs_sector_id', table_name='orienteurs')
    op.drop_index('ix_orienteurs_id', table_name='orienteurs')
    op.drop_table('orienteurs')