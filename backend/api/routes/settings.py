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
    BusinessCatalogDocumentResponse,
    BusinessCatalogUpdate,
    BusinessCatalogValues,
    CatalogItem,
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
    JobPriority,
    JobStatus,
    JobType,
    Technician,
    User,
)
from backend.logic.technician_field_actions import (
    FIELD_ACTION_LABELS,
    SUPPORTED_FIELD_ACTION_TYPES,
)
from backend.logic.operational_audit import record_operational_audit
from backend.logic.workflow.capabilities import STATUS_METADATA


router = APIRouter()

_OPERATIONAL_NAMESPACE = "operational"
_OPERATIONAL_SCHEMA_VERSION = 3
_CATALOG_NAMESPACE = "business_catalog"
_CATALOG_SCHEMA_VERSION = 2


_CATALOG_COLORS = (
    "#4B8DFF",
    "#31C48D",
    "#F4B84A",
    "#A78BFA",
    "#50D5FF",
    "#FF647C",
)


def _item(
    code: str,
    label: str,
    order: int,
    *,
    color: str | None = None,
    active: bool = True,
    metadata: dict | None = None,
) -> CatalogItem:
    return CatalogItem(
        code=code,
        label=label,
        color=color or _CATALOG_COLORS[order % len(_CATALOG_COLORS)],
        sort_order=order * 10,
        active=active,
        metadata=metadata or {},
    )


def _catalog_defaults() -> BusinessCatalogValues:
    job_labels = {
        "INSTALLATION": "Installation",
        "DEPANNAGE": "Dépannage",
        "MAINTENANCE": "Maintenance",
        "SAV": "Service après-vente",
        "DISCONNECT": "Déconnexion",
        "INSPECTION": "Inspection",
        "INCIDENT": "Incident",
        "URGENCE": "Urgence",
        "MIGRATION": "Migration",
        "RACCORDEMENT": "Raccordement",
        "AUDIT": "Audit",
        "TUBAGE": "Tubage",
        "NON_JOIGNABLE": "Client non joignable",
        "ANNULATION": "Annulation",
        "SPLITTER": "Splitter",
        "CROQUIS_RESEAU": "Croquis réseau",
    }
    priority_labels = {
        "URGENT": "Urgente",
        "HAUTE": "Haute",
        "NORMALE": "Normale",
        "FAIBLE": "Faible",
    }
    return BusinessCatalogValues(
        technician_grades=[
            _item("junior", "Technicien débutant", 0, color="#50D5FF"),
            _item("senior", "Technicien senior", 1, color="#A78BFA"),
        ],
        job_types=[
            _item(value.value, job_labels.get(value.value, value.value.title()), index)
            for index, value in enumerate(JobType)
        ],
        priorities=[
            _item(
                value.value,
                priority_labels[value.value],
                index,
                color={
                    "URGENT": "#FF647C",
                    "HAUTE": "#F4B84A",
                    "NORMALE": "#4B8DFF",
                    "FAIBLE": "#7E91AC",
                }[value.value],
            )
            for index, value in enumerate(JobPriority)
        ],
        status_presentations=[
            _item(
                status.value,
                STATUS_METADATA[status].label,
                index,
                metadata={
                    "category": STATUS_METADATA[status].category,
                    "order_open": STATUS_METADATA[status].order_open,
                    "field_active": STATUS_METADATA[status].field_active,
                    "canonical": STATUS_METADATA[status].canonical.value,
                },
            )
            for index, status in enumerate(JobStatus)
        ],
        field_actions=[
            _item(code, FIELD_ACTION_LABELS.get(code, code), index)
            for index, code in enumerate(sorted(SUPPORTED_FIELD_ACTION_TYPES))
        ],
    )


def _unique_codes(items: list[CatalogItem], section: str) -> None:
    codes = [item.code for item in items]
    if len(codes) != len(set(codes)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le catalogue {section} contient un code en double.",
        )


def _merge_extensible_catalog(
    submitted: list[CatalogItem],
    defaults: list[CatalogItem],
    *,
    section: str,
    force_system_active: bool = False,
) -> list[CatalogItem]:
    """Preserve engine codes while allowing business aliases.

    Engine-backed identifiers remain mandatory because PostgreSQL/workflow
    contracts still rely on them. Additional rows are safe presentation aliases:
    each one must declare the canonical system code it maps to in metadata.
    This lets administrators extend business vocabulary without introducing an
    unsupported enum value into jobs or technician sync.
    """

    _unique_codes(submitted, section)
    submitted_by_code = {item.code: item for item in submitted}
    default_by_code = {item.code: item for item in defaults}
    expected_codes = set(default_by_code)
    missing_codes = sorted(expected_codes - set(submitted_by_code))
    if missing_codes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Les identifiants système de {section} sont protégés. "
                "Restaurez : " + ", ".join(missing_codes)
            ),
        )

    merged: list[CatalogItem] = []
    for default in defaults:
        submitted_item = submitted_by_code[default.code]
        merged.append(
            CatalogItem(
                code=default.code,
                label=submitted_item.label,
                description=submitted_item.description,
                color=submitted_item.color,
                sort_order=submitted_item.sort_order,
                active=True if force_system_active else submitted_item.active,
                metadata=default.metadata,
            )
        )

    for item in submitted:
        if item.code in expected_codes:
            continue
        metadata = dict(item.metadata or {})
        canonical = str(metadata.get("canonical") or "").strip()
        if canonical not in expected_codes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"L'élément métier « {item.code} » de {section} doit être "
                    "rattaché à un comportement système existant."
                ),
            )
        metadata["custom"] = True
        metadata["canonical"] = canonical
        merged.append(
            CatalogItem(
                code=item.code,
                label=item.label,
                description=item.description,
                color=item.color,
                sort_order=item.sort_order,
                active=item.active,
                metadata=metadata,
            )
        )

    return sorted(merged, key=lambda item: (item.sort_order, item.code))


async def _validated_catalog(
    db: AsyncSession, values: BusinessCatalogValues
) -> BusinessCatalogValues:
    defaults = _catalog_defaults()
    _unique_codes(values.technician_grades, "technician_grades")

    submitted_grade_codes = {item.code for item in values.technician_grades}
    protected_grade_codes = {item.code for item in defaults.technician_grades}
    missing_system_grades = sorted(protected_grade_codes - submitted_grade_codes)
    if missing_system_grades:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Les identifiants système de technician_grades sont protégés. "
                "Restaurez : " + ", ".join(missing_system_grades)
            ),
        )

    active_grades = {item.code for item in values.technician_grades if item.active}
    if not active_grades:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Au moins un grade technicien doit rester actif.",
        )

    referenced_grades = set(
        (await db.execute(select(Technician.grade))).scalars().all()
    )
    removed_referenced_grades = sorted(
        grade
        for grade in referenced_grades
        if grade and grade not in submitted_grade_codes
    )
    if removed_referenced_grades:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Impossible de supprimer un grade référencé par un technicien : "
                + ", ".join(removed_referenced_grades)
            ),
        )

    active_used_grades = set(
        (
            await db.execute(
                select(Technician.grade).where(Technician.is_active.is_(True))
            )
        ).scalars().all()
    )
    archived_active_used_grades = sorted(
        grade
        for grade in active_used_grades
        if grade and grade not in active_grades
    )
    if archived_active_used_grades:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Impossible d'archiver un grade utilisé par un technicien actif : "
                + ", ".join(archived_active_used_grades)
            ),
        )
    return BusinessCatalogValues(
        technician_grades=sorted(
            values.technician_grades, key=lambda item: (item.sort_order, item.code)
        ),
        job_types=_merge_extensible_catalog(
            values.job_types, defaults.job_types, section="job_types"
        ),
        priorities=_merge_extensible_catalog(
            values.priorities, defaults.priorities, section="priorities"
        ),
        status_presentations=_merge_extensible_catalog(
            values.status_presentations,
            defaults.status_presentations,
            section="status_presentations",
            force_system_active=True,
        ),
        field_actions=_merge_extensible_catalog(
            values.field_actions, defaults.field_actions, section="field_actions"
        ),
    )


def _catalog_response(
    document: ApplicationSetting | None,
) -> BusinessCatalogDocumentResponse:
    values = (
        BusinessCatalogValues.model_validate(document.values)
        if document is not None
        else _catalog_defaults()
    )
    return BusinessCatalogDocumentResponse(
        namespace=_CATALOG_NAMESPACE,
        schema_version=_CATALOG_SCHEMA_VERSION if document is None else document.schema_version,
        revision=document.revision if document is not None else 0,
        values=values,
        updated_by=document.updated_by if document is not None else None,
        created_at=document.created_at if document is not None else None,
        updated_at=document.updated_at if document is not None else None,
    )


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
    previous_values = dict(document.values or {}) if document is not None else None
    previous_revision = int(document.revision or 0) if document is not None else 0

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
        record_operational_audit(
            db,
            current_user=current_user,
            action="settings.operational_updated",
            entity_type="application_setting",
            entity_id=_OPERATIONAL_NAMESPACE,
            before={"revision": previous_revision, "values": previous_values},
            after={"revision": document.revision, "values": serialized_values},
        )
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


@router.get("/catalog", response_model=BusinessCatalogDocumentResponse)
async def get_business_catalog(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return the active governed catalog and its revision."""
    return _catalog_response(await _get_document(db, _CATALOG_NAMESPACE))


@router.put("/catalog", response_model=BusinessCatalogDocumentResponse)
async def update_business_catalog(
    payload: BusinessCatalogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Atomically replace catalog presentation using optimistic revision."""
    document = await _get_document(db, _CATALOG_NAMESPACE)
    current_revision = int(document.revision or 0) if document is not None else 0
    previous_values = dict(document.values or {}) if document is not None else None
    if payload.expected_revision != current_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le catalogue a été modifié. Rechargez avant d'enregistrer.",
        )
    values = await _validated_catalog(db, payload.values)
    serialized = values.model_dump(mode="json")
    if document is None:
        document = ApplicationSetting(
            namespace=_CATALOG_NAMESPACE,
            schema_version=_CATALOG_SCHEMA_VERSION,
            revision=1,
            values=serialized,
            updated_by=current_user.id,
        )
        db.add(document)
    else:
        document.schema_version = _CATALOG_SCHEMA_VERSION
        document.revision = current_revision + 1
        document.values = serialized
        document.updated_by = current_user.id
    try:
        record_operational_audit(
            db,
            current_user=current_user,
            action="settings.catalog_updated",
            entity_type="application_setting",
            entity_id=_CATALOG_NAMESPACE,
            before={"revision": current_revision, "values": previous_values},
            after={"revision": document.revision, "values": serialized},
        )
        await db.commit()
        await db.refresh(document)
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le catalogue a été modifié simultanément.",
        ) from error
    return _catalog_response(document)
