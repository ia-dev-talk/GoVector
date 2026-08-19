import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user
from backend.auth.security import create_access_token, verify_password
from backend.config import get_settings
from backend.database.connection import get_db
from backend.database.models import ApplicationSetting, ClientOrganization, User, UserRole

settings = get_settings()
logger = logging.getLogger("uvicorn.error")

router = APIRouter()

_COCKPIT_SCHEMA_VERSION = 1


class CockpitViewPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metrics: bool = True
    progression: bool = True
    decisions: bool = True
    capacity: bool = True
    quality: bool = True
    activity: bool = True
    quickAccess: bool = True

    @model_validator(mode="after")
    def keep_recovery_surface(self):
        if not any(self.model_dump().values()):
            raise ValueError("Au moins un bloc du cockpit doit rester visible.")
        return self


def _cockpit_namespace(user_id: int) -> str:
    return f"cockpit_view:user:{int(user_id)}"


def _default_cockpit_view() -> CockpitViewPreferences:
    return CockpitViewPreferences()


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Identifiants invalides",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db=Depends(get_db),
):
    """Authentifie un compte web BlueVector autorisé."""
    result = await db.execute(
        select(User).where(
            User.username == form_data.username
        )
    )

    user = result.scalar_one_or_none()

    if not user or not user.is_active or not user.password_hash:
        logger.warning("[AUTH] Échec de connexion web")
        raise _invalid_credentials()

    if not verify_password(form_data.password, user.password_hash):
        logger.warning("[AUTH] Échec de connexion web")
        raise _invalid_credentials()

    if user.role == UserRole.CLIENT:
        if user.client_organization_id is None:
            logger.warning("[AUTH] Échec de connexion client sans organisation")
            raise _invalid_credentials()

        organization_active = await db.scalar(
            select(ClientOrganization.is_active).where(
                ClientOrganization.id == user.client_organization_id
            )
        )
        if organization_active is not True:
            logger.warning("[AUTH] Échec de connexion client organisation inactive")
            raise _invalid_credentials()

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role.value,
        },
        expires_delta=timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        ),
    )

    logger.info("[AUTH] Connexion web réussie - user_id=%s role=%s", user.id, user.role.value)

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


@router.get("/me/cockpit-view", response_model=CockpitViewPreferences)
async def get_my_cockpit_view(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's persisted cockpit layout."""
    result = await db.execute(
        select(ApplicationSetting).where(
            ApplicationSetting.namespace == _cockpit_namespace(current_user.id)
        )
    )
    document = result.scalar_one_or_none()
    if document is None:
        return _default_cockpit_view()

    try:
        return CockpitViewPreferences.model_validate(document.values or {})
    except ValidationError:
        logger.warning(
            "[AUTH] Invalid cockpit preferences ignored - user_id=%s",
            current_user.id,
        )
        return _default_cockpit_view()


@router.put("/me/cockpit-view", response_model=CockpitViewPreferences)
async def update_my_cockpit_view(
    payload: CockpitViewPreferences,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist cockpit layout for the authenticated user only."""
    namespace = _cockpit_namespace(current_user.id)
    result = await db.execute(
        select(ApplicationSetting).where(
            ApplicationSetting.namespace == namespace
        )
    )
    document = result.scalar_one_or_none()
    serialized = payload.model_dump(mode="json")

    if document is None:
        document = ApplicationSetting(
            namespace=namespace,
            schema_version=_COCKPIT_SCHEMA_VERSION,
            revision=1,
            values=serialized,
            updated_by=current_user.id,
        )
        db.add(document)
    else:
        document.schema_version = _COCKPIT_SCHEMA_VERSION
        document.revision = max(int(document.revision or 0) + 1, 1)
        document.values = serialized
        document.updated_by = current_user.id

    await db.commit()
    return payload
