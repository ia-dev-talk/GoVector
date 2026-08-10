"""
Endpoint temporaire pour exécuter le seed de développement.
Disponible uniquement en mode démo.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth.dependencies import get_current_user
from backend.config import get_settings
from backend.database.models import User, UserRole
from backend.database.seeds.seed_data import seed_all


logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()


if settings.IS_DEMO:

    @router.post("/run")
    async def run_seed(
        current_user: User = Depends(get_current_user),
    ):
        """Exécute le seed de développement en mode démo uniquement."""
        if not current_user.is_active or current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accès administrateur requis",
            )

        try:
            await seed_all()
            return {
                "status": "success",
                "message": "Seed exécuté avec succès",
            }
        except Exception:
            logger.exception(
                "Échec de l’exécution du seed de développement"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Échec de l’exécution du seed",
            )
