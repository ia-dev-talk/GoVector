"""
API routes for Technician authentication (Mobile)
Login endpoint for technicians using username/password
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from backend.database.connection import get_db
from backend.database.models import Technician, User
from backend.auth.security import verify_password, create_access_token

router = APIRouter()


class TechLoginRequest(BaseModel):
    """Requête de login pour un technicien"""
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class TechLoginResponse(BaseModel):
    """Réponse de login avec token JWT"""
    access_token: str
    token_type: str = "bearer"
    user_id: int
    technician_id: int
    technician_name: str
    orienteur_id: int | None = None


@router.post("/login", response_model=TechLoginResponse)
async def tech_login(
    login_data: TechLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login mobile pour les techniciens"""
    import logging
    logger = logging.getLogger("uvicorn.error")

    logger.info(f"[TECH_AUTH] 📱 Tentative login mobile - username: {login_data.username}")

    # 1. Recherche de l'utilisateur dans la table USERS
    user_result = await db.execute(
        select(User).where(User.username == login_data.username)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        logger.warning(f"[TECH_AUTH] ❌ Utilisateur INTROUVABLE: {login_data.username}")
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    logger.info(
        f"[TECH_AUTH] 🔎 Utilisateur trouvé - ID: {user.id}, "
        f"Role: {user.role.value}, Active: {user.is_active}, "
        f"TechID: {user.technician_id}, OriID: {user.orienteur_id}"
    )

    # Vérification du statut actif
    if not user.is_active:
        logger.warning(f"[TECH_AUTH] ❌ Compte inactif: {login_data.username}")
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    # Vérification du lien technicien
    if not user.technician_id:
        logger.warning(f"[TECH_AUTH] ❌ Pas de technician_id lié pour: {login_data.username}")
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    # 2. Vérification du mot de passe
    if not user.password_hash:
        logger.warning(f"[TECH_AUTH] ❌ Aucun password_hash pour: {login_data.username}")
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    is_password_correct = verify_password(
        login_data.password,
        user.password_hash
    )

    logger.info(f"[TECH_AUTH] {'✅ Mot de passe VALIDE' if is_password_correct else '❌ Mot de passe INVALIDE'}")

    if not is_password_correct:
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    # 3. Récupération du profil Technicien
    tech_result = await db.execute(
        select(Technician).where(Technician.id == user.technician_id)
    )
    technician = tech_result.scalar_one_or_none()

    if not technician:
        logger.error(
            f"[TECH_AUTH] ❌ Profil technicien introuvable pour "
            f"user.technician_id={user.technician_id}"
        )
        raise HTTPException(status_code=401, detail="Profil technicien introuvable")

    logger.info(
        f"[TECH_AUTH] ✅ Connexion réussie - Technicien: {technician.name} "
        f"(ID: {technician.id}, OriID: {technician.orienteur_id})"
    )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "username": user.username,
            "role": "TECHNICIAN",
            "type": "tech_mobile",
        }
    )

    return TechLoginResponse(
        access_token=access_token,
        user_id=user.id,
        technician_id=technician.id,
        technician_name=technician.name,
        orienteur_id=technician.orienteur_id,
    )
