import logging
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationError,
    field_validator,
    model_validator,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user
from backend.auth.security import create_access_token, verify_password
from backend.config import get_settings
from backend.database.connection import get_db
from backend.database.models import ApplicationSetting, ClientOrganization, User, UserRole

settings = get_settings()
logger = logging.getLogger("uvicorn.error")

router = APIRouter()

WEB_ROLES = frozenset({
    UserRole.ADMIN,
    UserRole.ORIENTEUR,
    UserRole.CLIENT,
})

_COCKPIT_SCHEMA_VERSION = 3
_COCKPIT_VIEW_FIELD = "view"
_COCKPIT_ORDER_FIELD = "order"
_COCKPIT_INTENT_FIELD = "client_intent"
_COCKPIT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
_COCKPIT_BLOCK_KEYS = (
    "metrics",
    "progression",
    "decisions",
    "capacity",
    "quality",
    "activity",
    "quickAccess",
)


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
        if not any(getattr(self, key) for key in _COCKPIT_BLOCK_KEYS):
            raise ValueError("Au moins un bloc du cockpit doit rester visible.")
        return self


class CockpitViewLayout(CockpitViewPreferences):
    order: list[str] = list(_COCKPIT_BLOCK_KEYS)
    revision: int = 0

    @field_validator("order")
    @classmethod
    def validate_order(cls, value: list[str]) -> list[str]:
        normalized = [str(item).strip() for item in value]
        if (
            len(normalized) != len(_COCKPIT_BLOCK_KEYS)
            or len(set(normalized)) != len(normalized)
            or set(normalized) != set(_COCKPIT_BLOCK_KEYS)
        ):
            raise ValueError("Ordre des blocs Cockpit invalide")
        return normalized

    @field_validator("revision")
    @classmethod
    def validate_revision(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Révision Cockpit invalide")
        return value


class CockpitViewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    view: CockpitViewPreferences
    order: list[str] | None = None
    client_intent: str
    expected_revision: int | None = None

    @field_validator("order")
    @classmethod
    def validate_optional_order(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return CockpitViewLayout(order=value).order

    @field_validator("client_intent")
    @classmethod
    def validate_client_intent(cls, value: str) -> str:
        _validate_cockpit_intent_clock(value)
        return value

    @field_validator("expected_revision")
    @classmethod
    def validate_expected_revision(cls, value: int | None) -> int | None:
        if value is not None and value < 0:
            raise ValueError("Révision Cockpit attendue invalide")
        return value


def _cockpit_namespace(user_id: int) -> str:
    return f"cockpit_view:user:{int(user_id)}"


def _default_cockpit_view() -> CockpitViewPreferences:
    return CockpitViewPreferences()


def _default_cockpit_order() -> list[str]:
    return list(_COCKPIT_BLOCK_KEYS)


def _cockpit_intent_rank(value: str) -> tuple[int, int, str]:
    token = str(value or "").strip()
    parts = token.split(":", 2)
    if len(parts) != 3 or not parts[2] or len(token) > 160:
        raise ValueError("client_intent Cockpit invalide")

    try:
        clock = int(parts[0])
        sequence = int(parts[1])
    except (TypeError, ValueError) as exc:
        raise ValueError("client_intent Cockpit invalide") from exc

    if clock <= 0 or sequence <= 0:
        raise ValueError("client_intent Cockpit invalide")

    return clock, sequence, token


def _cockpit_server_clock_ms() -> int:
    return int(time.time() * 1000)


def _validate_cockpit_intent_clock(
    value: str,
    *,
    now_ms: int | None = None,
) -> str:
    clock, _, _ = _cockpit_intent_rank(value)
    server_now = _cockpit_server_clock_ms() if now_ms is None else int(now_ms)
    if clock > server_now + _COCKPIT_MAX_FUTURE_SKEW_MS:
        raise ValueError("client_intent Cockpit trop éloigné dans le futur")
    return value


def _cockpit_view_values(values: object) -> dict:
    if not isinstance(values, dict):
        return {}

    nested = values.get(_COCKPIT_VIEW_FIELD)
    if isinstance(nested, dict):
        return nested

    return values


def _cockpit_order_values(values: object) -> list[str]:
    if not isinstance(values, dict):
        return _default_cockpit_order()

    raw = values.get(_COCKPIT_ORDER_FIELD)
    try:
        return CockpitViewLayout(order=raw).order if isinstance(raw, list) else _default_cockpit_order()
    except ValidationError:
        return _default_cockpit_order()


def _cockpit_stored_intent(values: object) -> str | None:
    if not isinstance(values, dict):
        return None
    token = values.get(_COCKPIT_INTENT_FIELD)
    return token if isinstance(token, str) and token.strip() else None


def _cockpit_layout(
    view: CockpitViewPreferences,
    order: list[str],
    *,
    revision: int = 0,
) -> CockpitViewLayout:
    return CockpitViewLayout(**view.model_dump(), order=order, revision=max(int(revision or 0), 0))


def _cockpit_document_values(
    payload: CockpitViewUpdate,
    *,
    existing_values: object | None = None,
) -> dict:
    order = payload.order
    if order is None:
        order = _cockpit_order_values(existing_values)
    return {
        _COCKPIT_VIEW_FIELD: payload.view.model_dump(mode="json"),
        _COCKPIT_ORDER_FIELD: order,
        _COCKPIT_INTENT_FIELD: payload.client_intent,
    }


def _ensure_fresh_cockpit_intent(
    incoming_intent: str,
    stored_values: object,
    *,
    now_ms: int | None = None,
) -> None:
    stored_intent = _cockpit_stored_intent(stored_values)
    if stored_intent is None:
        return

    server_now = _cockpit_server_clock_ms() if now_ms is None else int(now_ms)
    incoming_rank = _cockpit_intent_rank(incoming_intent)
    stored_rank = _cockpit_intent_rank(stored_intent)

    if stored_rank[0] > server_now + _COCKPIT_MAX_FUTURE_SKEW_MS:
        logger.warning("[AUTH] Ignoring poisoned future cockpit intent")
        return

    if incoming_rank <= stored_rank:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une personnalisation Cockpit plus récente est déjà enregistrée.",
        )


def _ensure_cockpit_revision(expected_revision: int, current_revision: int) -> None:
    expected = max(int(expected_revision), 0)
    current = max(int(current_revision or 0), 0)
    if expected != current:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Le profil Cockpit a été modifié depuis votre dernière lecture.",
                "revision": current,
            },
        )


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

    if user.role not in WEB_ROLES:
        logger.warning("[AUTH] Échec de connexion web - rôle mobile")
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


@router.get("/me/cockpit-view", response_model=CockpitViewLayout)
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
        return _cockpit_layout(_default_cockpit_view(), _default_cockpit_order(), revision=0)

    try:
        view = CockpitViewPreferences.model_validate(
            _cockpit_view_values(document.values or {})
        )
        return _cockpit_layout(
            view,
            _cockpit_order_values(document.values or {}),
            revision=document.revision,
        )
    except ValidationError:
        logger.warning(
            "[AUTH] Invalid cockpit preferences ignored - user_id=%s",
            current_user.id,
        )
        return _cockpit_layout(
            _default_cockpit_view(),
            _default_cockpit_order(),
            revision=document.revision,
        )


async def _update_existing_cockpit_document(
    *,
    db: AsyncSession,
    document: ApplicationSetting,
    payload: CockpitViewUpdate,
    user_id: int,
) -> CockpitViewLayout:
    current_revision = max(int(document.revision or 0), 0)
    if payload.expected_revision is None:
        _ensure_fresh_cockpit_intent(payload.client_intent, document.values)
    else:
        _ensure_cockpit_revision(payload.expected_revision, current_revision)

    previous_values = document.values
    order = payload.order or _cockpit_order_values(previous_values)
    document.schema_version = _COCKPIT_SCHEMA_VERSION
    document.revision = current_revision + 1
    document.values = _cockpit_document_values(payload, existing_values=previous_values)
    document.updated_by = user_id
    await db.commit()
    return _cockpit_layout(payload.view, order, revision=document.revision)


@router.put("/me/cockpit-view", response_model=CockpitViewLayout)
async def update_my_cockpit_view(
    payload: CockpitViewUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist the authenticated user's cockpit layout with optimistic concurrency."""
    namespace = _cockpit_namespace(current_user.id)
    result = await db.execute(
        select(ApplicationSetting)
        .where(ApplicationSetting.namespace == namespace)
        .with_for_update()
    )
    document = result.scalar_one_or_none()

    if document is not None:
        return await _update_existing_cockpit_document(
            db=db,
            document=document,
            payload=payload,
            user_id=current_user.id,
        )

    if payload.expected_revision not in (None, 0):
        _ensure_cockpit_revision(payload.expected_revision, 0)

    order = payload.order or _default_cockpit_order()
    document = ApplicationSetting(
        namespace=namespace,
        schema_version=_COCKPIT_SCHEMA_VERSION,
        revision=1,
        values=_cockpit_document_values(payload),
        updated_by=current_user.id,
    )
    db.add(document)

    try:
        await db.commit()
        return _cockpit_layout(payload.view, order, revision=document.revision)
    except IntegrityError:
        await db.rollback()
        result = await db.execute(
            select(ApplicationSetting)
            .where(ApplicationSetting.namespace == namespace)
            .with_for_update()
        )
        document = result.scalar_one_or_none()
        if document is None:
            raise

        return await _update_existing_cockpit_document(
            db=db,
            document=document,
            payload=payload,
            user_id=current_user.id,
        )
