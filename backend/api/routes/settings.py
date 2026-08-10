"""
Routes du moteur de paramètres BlueVector.

Lecture runtime :
    GET /api/v1/settings/runtime

Administration du domaine opérationnel :
    GET /api/v1/settings/operational
    PUT /api/v1/settings/operational
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.settings import (
    OperationalSettingsUpdate,
    OperationalSettingsValues,
    RuntimeNamespaceMeta,
    RuntimeSettingsResponse,
    SettingsDocumentResponse,
)
from backend.auth.dependencies import (
    get_current_user,
    require_admin,
)
from backend.database.connection import get_db
from backend.database.models import (
    ApplicationSetting,
    User,
)


router = APIRouter()

_OPERATIONAL_NAMESPACE = "operational"
_OPERATIONAL_SCHEMA_VERSION = 3


async def _get_document(
    db: AsyncSession,
    namespace: str,
) -> ApplicationSetting | None:
    result = await db.execute(
        select(ApplicationSetting).where(
            ApplicationSetting.namespace == namespace
        )
    )
    return result.scalar_one_or_none()


def _operational_values(
    document: ApplicationSetting | None,
) -> OperationalSettingsValues:
    if document is None:
        return OperationalSettingsValues()

    return OperationalSettingsValues.model_validate(
        document.values or {}
    )


def _document_response(
    document: ApplicationSetting | None,
) -> SettingsDocumentResponse:
    if document is None:
        return SettingsDocumentResponse(
            namespace=_OPERATIONAL_NAMESPACE,
            schema_version=_OPERATIONAL_SCHEMA_VERSION,
            revision=0,
            values=OperationalSettingsValues(),
        )

    return SettingsDocumentResponse(
        namespace=document.namespace,
        schema_version=document.schema_version,
        revision=document.revision,
        values=_operational_values(document),
        updated_by=document.updated_by,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


@router.get(
    "/runtime",
    response_model=RuntimeSettingsResponse,
)
async def get_runtime_settings(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    Retourne uniquement les paramètres nécessaires aux interfaces.

    L'absence d'un document enregistré est un état valide : les valeurs
    restent alors explicitement non configurées.
    """

    document = await _get_document(
        db,
        _OPERATIONAL_NAMESPACE,
    )

    if document is None:
        metadata = RuntimeNamespaceMeta(
            schema_version=_OPERATIONAL_SCHEMA_VERSION,
            revision=0,
        )
    else:
        metadata = RuntimeNamespaceMeta(
            schema_version=document.schema_version,
            revision=document.revision,
            updated_at=document.updated_at,
        )

    return RuntimeSettingsResponse(
        generated_at=datetime.now(timezone.utc),
        operational=_operational_values(document),
        meta={
            _OPERATIONAL_NAMESPACE: metadata,
        },
    )


@router.get(
    "/operational",
    response_model=SettingsDocumentResponse,
)
async def get_operational_settings(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Lit le document opérationnel et ses métadonnées."""

    document = await _get_document(
        db,
        _OPERATIONAL_NAMESPACE,
    )
    return _document_response(document)


@router.put(
    "/operational",
    response_model=SettingsDocumentResponse,
)
async def update_operational_settings(
    payload: OperationalSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Remplace le document opérationnel V1.

    ``null`` désactive ou laisse volontairement non configurée une règle.
    Aucune valeur métier implicite n'est ajoutée par le backend.
    """

    document = await _get_document(
        db,
        _OPERATIONAL_NAMESPACE,
    )

    if (
        document is not None
        and document.schema_version
        > _OPERATIONAL_SCHEMA_VERSION
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La configuration opérationnelle utilise une version "
                "plus récente que cette API."
            ),
        )

    serialized_values = payload.model_dump(
        mode="json",
    )

    if document is None:
        document = ApplicationSetting(
            namespace=_OPERATIONAL_NAMESPACE,
            schema_version=_OPERATIONAL_SCHEMA_VERSION,
            revision=1,
            values=serialized_values,
            updated_by=current_user.id,
        )
        db.add(document)
    else:
        document.schema_version = (
            _OPERATIONAL_SCHEMA_VERSION
        )
        document.revision = max(
            int(document.revision or 0) + 1,
            1,
        )
        document.values = serialized_values
        document.updated_by = current_user.id

    try:
        await db.commit()
        await db.refresh(document)
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La configuration a été modifiée simultanément. "
                "Rechargez les paramètres puis réessayez."
            ),
        ) from error

    return _document_response(document)
