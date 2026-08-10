from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from backend.auth.security import (
    verify_password,
    create_access_token,
)
from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models import User
from backend.config import get_settings

settings = get_settings()

router = APIRouter()


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db=Depends(get_db),
):
    """Login pour Admin, Chef Orienteur, Orienteur"""
    import logging
    logger = logging.getLogger("uvicorn.error")

    logger.info(f"[AUTH] Tentative de login - username: {form_data.username}")

    result = await db.execute(
        select(User).where(
            User.username == form_data.username
        )
    )

    user = result.scalar_one_or_none()

    if not user:
        logger.warning(f"[AUTH] Utilisateur non trouvé: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )

    logger.info(f"[AUTH] Utilisateur trouvé - ID: {user.id}, Role: {user.role.value}, Active: {user.is_active}")

    if not user.is_active:
        logger.warning(f"[AUTH] Compte inactif: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )

    if not user.password_hash:
        logger.warning(f"[AUTH] Pas de password_hash pour: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )

    is_valid = verify_password(
        form_data.password,
        user.password_hash
    )

    logger.info(f"[AUTH] Vérification mot de passe: {'✅ OK' if is_valid else '❌ FAIL'}")

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role.value,
        },
        expires_delta=timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        ),
    )

    logger.info(f"[AUTH] Login réussi - User: {user.username}, Role: {user.role.value}")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "client_organization_id": user.client_organization_id,
        },
    }


@router.get("/me")
async def me(
    current_user: User = Depends(get_current_user)
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role.value,
        "client_organization_id": current_user.client_organization_id,
    }
