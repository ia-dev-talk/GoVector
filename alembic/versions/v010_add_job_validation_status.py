"""add_job_validation_status

Revision ID: v010
Revises: 9c63b447e86f
Create Date: 2026-07-07

 Ajoute le statut EN_ATTENTE_VALIDATION pour le workflow mobile :
 - technicien termine -> EN_ATTENTE_VALIDATION
 - orienteur valide -> COMPLETED
 - orienteur refuse -> reassigné technicien

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'v010_add_job_validation_status'
down_revision = '9c63b447e86f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ajouter la nouvelle valeur dans l'enum JobStatus
    op.execute("ALTER TYPE jobstatus ADD VALUE 'EN_ATTENTE_VALIDATION'")


def downgrade() -> None:
    # PostgreSQL ne permet pas de supprimer une valeur d'enum utilisée.
    # On ne peut pas rollback proprement cette modification sans recréer l'enum.
    pass