"""
API routes for GoVector field authentication (Mobile).
The same APK supports assigned technicians and team-scoped Agents terrain.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.security import create_access_token, verify_password
from backend.database.connection import get_db
from backend.database.models import Orienteur, Technician, User, UserRole

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

MOBILE_FIELD_ROLES = frozenset({
    UserRole.TECHNICIAN,
    UserRole.CHEF_ORIENTEUR,
})
INVALID_CREDENTIALS = "Identifiants invalides"


class TechLoginRequest(BaseModel):
    """Login request for a field user."""

    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class TechLoginResponse(BaseModel):
    """Role-aware mobile session returned to the GoVector APK."""

    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    technician_id: int | None = None
    technician_name: str | None = None
    orienteur_id: int | None = None
    field_agent_name: str | None = None


def _reject_login(reason: str) -> None:
    """Reject without exposing account/profile details to clients or logs."""

    logger.warning("[TECH_AUTH] Mobile login rejected: %s", reason)
    raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS)


@router.post("/login", response_model=TechLoginResponse)
async def tech_login(
    login_data: TechLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a technician or a team-scoped Agent terrain."""

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
    if not user.password_hash:
        _reject_login("password authentication unavailable")
    if not verify_password(login_data.password, user.password_hash):
        _reject_login("invalid credentials")

    technician = None
    field_agent = None
    if user.role == UserRole.TECHNICIAN:
        if not user.technician_id:
            _reject_login("missing technician profile link")
        technician = await db.scalar(
            select(Technician).where(Technician.id == user.technician_id)
        )
        if technician is None:
            _reject_login("technician profile unavailable")
    elif user.role == UserRole.CHEF_ORIENTEUR:
        if not user.orienteur_id:
            _reject_login("missing field-agent team link")
        field_agent = await db.scalar(
            select(Orienteur).where(Orienteur.id == user.orienteur_id)
        )
        if field_agent is None:
            _reject_login("field-agent profile unavailable")

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "username": user.username,
            "role": user.role.value,
            "type": "tech_mobile",
        }
    )

    logger.info("[TECH_AUTH] Mobile field login succeeded for role=%s", user.role.value)

    return TechLoginResponse(
        access_token=access_token,
        user_id=user.id,
        role=user.role.value,
        technician_id=technician.id if technician is not None else None,
        technician_name=technician.name if technician is not None else None,
        orienteur_id=(
            technician.orienteur_id if technician is not None else user.orienteur_id
        ),
        field_agent_name=field_agent.name if field_agent is not None else None,
    )
