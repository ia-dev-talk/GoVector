"""
API routes for Technician authentication (Mobile).
Login endpoint for field users using username/password.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.security import create_access_token, verify_password
from backend.database.connection import get_db
from backend.database.models import Technician, User, UserRole

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

MOBILE_FIELD_ROLES = frozenset({
    UserRole.TECHNICIAN,
    UserRole.CHEF_ORIENTEUR,
})
INVALID_CREDENTIALS = "Identifiants invalides"


class TechLoginRequest(BaseModel):
    """Requête de login pour un utilisateur terrain."""

    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class TechLoginResponse(BaseModel):
    """Réponse de login avec token JWT."""

    access_token: str
    token_type: str = "bearer"
    user_id: int
    technician_id: int
    technician_name: str
    orienteur_id: int | None = None


def _reject_login(reason: str) -> None:
    """Reject without exposing account/profile details to clients or logs."""

    logger.warning("[TECH_AUTH] Mobile login rejected: %s", reason)
    raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS)


@router.post("/login", response_model=TechLoginResponse)
async def tech_login(
    login_data: TechLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate an account authorized to use the technician mobile app."""

    user_result = await db.execute(
        select(User).where(User.username == login_data.username)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        _reject_login("unknown account")

    if not user.is_active:
        _reject_login("inactive account")

    if user.role not in MOBILE_FIELD_ROLES:
        _reject_login("role not allowed for mobile field access")

    if not user.technician_id:
        _reject_login("missing technician profile link")

    if not user.password_hash:
        _reject_login("password authentication unavailable")

    if not verify_password(login_data.password, user.password_hash):
        _reject_login("invalid credentials")

    tech_result = await db.execute(
        select(Technician).where(Technician.id == user.technician_id)
    )
    technician = tech_result.scalar_one_or_none()

    if not technician:
        _reject_login("technician profile unavailable")

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value,
            "type": "tech_mobile",
        }
    )

    logger.info("[TECH_AUTH] Mobile field login succeeded")

    return TechLoginResponse(
        access_token=access_token,
        user_id=user.id,
        technician_id=technician.id,
        technician_name=technician.name,
        orienteur_id=technician.orienteur_id,
    )
