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
    FieldFormCatalogDocumentResponse,
    FieldFormCatalogUpdate,
    FieldFormCatalogValues,
    FieldFormTemplateVersion,
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
    ClientOrganization,
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
from backend.logic.job_planning import default_estimated_duration_minutes
from backend.logic.workflow.capabilities import STATUS_METADATA


router = APIRouter()

_OPERATIONAL_NAMESPACE = "operational"
_OPERATIONAL_SCHEMA_VERSION = 3
_CATALOG_NAMESPACE = "business_catalog"
_CATALOG_SCHEMA_VERSION = 4
_FIELD_FORMS_NAMESPACE = "field_forms"
_FIELD_FORMS_SCHEMA_VERSION = 1


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
            _item(
                value.value,
                job_labels.get(value.value, value.value.title()),
                index,
                metadata={
                    "default_estimated_duration_minutes": (
                        default_estimated_duration_minutes(value)
                    ),
                },
            )
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
        installation_modes=[
            _item("SP", "Sous PEHD · conduite / souterrain", 0),
            _item("TR", "Travée / tronçon · aérien", 1),
            _item("FSD", "Façade / sous-dalle · immeuble", 2),
        ],
        cable_types=[
            _item("FO16", "FO16 · 16 fibres", 0),
            _item("FO64", "FO64 · 64 fibres", 1),
        ],
        technician_skills=[
            _item("PB", "PB", 0),
            _item("PM", "PM", 1),
            _item("POSE_CABLE_SPCO", "POSE DE CABLE SPCO", 2),
            _item("PTO", "PTO", 3),
            _item("RACCORDEMENT_REALISABLE", "RACCORDEMENT REALISABLE", 4),
            _item("RACCORDEMENT_SAV", "RACCORDEMENT SAV", 5),
        ],
        dashboard_indicators=[
            _item("PLANIFIER_AUJOURDHUI", "Interventions à planifier pour aujourd'hui", 0),
            _item("PLANIFIER_DEMAIN", "Interventions à planifier pour demain", 1),
            _item("TERMINER_J_2H", "Interventions à terminer à J dans 2 heures", 2),
            _item("TERMINER_J_4H", "Interventions à terminer à J dans 4 heures", 3),
            _item("RDV_NON_HONORES_J", "Interventions avec RDV non honorés à J", 4),
            _item("EN_COURS_J", "Interventions en cours à J", 5),
            _item("SORTIES_PCO_RACCORDEES", "Nombre de sorties de PCO raccordées", 6),
            _item("PLAN_CHARGE_J1", "Répartition du plan de charge à J+1", 7),
            _item("DUREE_DEPASSEE", "Seuil durée d'intervention dépassé", 8),
            _item("TAUX_CLOTURE_GTR", "Taux de clôture avec respect GTR", 9),
            _item("TAUX_REALISATION_TEMPS_REEL", "Taux de réalisation temps réel", 10),
            _item("TAUX_VALIDATION_TEMPS_REEL", "Taux de validation temps réel", 11),
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

    active_system_codes = {
        code
        for code in expected_codes
        if force_system_active or submitted_by_code[code].active
    }

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
        if item.active and canonical not in active_system_codes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"L'élément métier « {item.code} » de {section} ne peut pas "
                    f"rester actif car son comportement système « {canonical} » "
                    "est archivé. Choisissez un comportement système actif ou "
                    "archivez l'élément métier."
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
        installation_modes=sorted(
            values.installation_modes, key=lambda item: (item.sort_order, item.code)
        ),
        cable_types=sorted(
            values.cable_types, key=lambda item: (item.sort_order, item.code)
        ),
        technician_skills=sorted(
            values.technician_skills, key=lambda item: (item.sort_order, item.code)
        ),
        dashboard_indicators=sorted(
            values.dashboard_indicators, key=lambda item: (item.sort_order, item.code)
        ),
    )


def _catalog_response(
    document: ApplicationSetting | None,
) -> BusinessCatalogDocumentResponse:
    defaults = _catalog_defaults()
    values = BusinessCatalogValues.model_validate(document.values) if document is not None else defaults

    if document is not None:
        stored_keys = set((document.values or {}).keys())
        additive_sections = {
            "installation_modes",
            "cable_types",
            "technician_skills",
            "dashboard_indicators",
        }
        values = values.model_copy(
            update={
                section: getattr(defaults, section)
                for section in additive_sections
                if section not in stored_keys
            }
        )

    if document is not None and document.schema_version < _CATALOG_SCHEMA_VERSION:
        installation_codes = {
            "CONDUITE_PEHD": ("SP", "Sous PEHD · conduite / souterrain"),
            "AERIEN": ("TR", "Travée / tronçon · aérien"),
            "FACADE_IMMEUBLE": ("FSD", "Façade / sous-dalle · immeuble"),
        }
        cable_codes = {
            "FO_16": ("FO16", "FO16 · 16 fibres"),
            "FO_64": ("FO64", "FO64 · 64 fibres"),
        }

        def upgrade_items(items, replacements):
            upgraded = []
            for item in items:
                replacement = replacements.get(item.code)
                if replacement is None:
                    if item.code in {"FO_96", "FO96"}:
                        continue
                    upgraded.append(item)
                    continue
                code, label = replacement
                upgraded.append(item.model_copy(update={"code": code, "label": label}))
            return upgraded

        values = values.model_copy(
            update={
                "installation_modes": upgrade_items(
                    values.installation_modes, installation_codes
                ),
                "cable_types": upgrade_items(values.cable_types, cable_codes),
            }
        )

    if document is not None:
        default_job_types = {item.code: item for item in defaults.job_types}
        values = values.model_copy(
            update={
                "job_types": [
                    item.model_copy(
                        update={
                            "metadata": {
                                **dict(item.metadata or {}),
                                **dict(default_job_types[item.code].metadata or {}),
                            }
                        }
                    )
                    if item.code in default_job_types
                    else item
                    for item in values.job_types
                ]
            }
        )
    return BusinessCatalogDocumentResponse(
        namespace=_CATALOG_NAMESPACE,
        schema_version=_CATALOG_SCHEMA_VERSION,
        revision=document.revision if document is not None else 0,
        values=values,
        updated_by=document.updated_by if document is not None else None,
        created_at=document.created_at if document is not None else None,
        updated_at=document.updated_at if document is not None else None,
    )


async def _get_document(
    db: AsyncSession,
    namespace: str,
    *,
    for_update: bool = False,
) -> ApplicationSetting | None:
    statement = select(ApplicationSetting).where(
        ApplicationSetting.namespace == namespace
    )
    if for_update:
        statement = statement.with_for_update()
    result = await db.execute(statement)
    return result.scalar_one_or_none()


def _field_forms_response(
    document: ApplicationSetting | None,
) -> FieldFormCatalogDocumentResponse:
    values = FieldFormCatalogValues.model_validate(document.values or {}) \
        if document is not None else FieldFormCatalogValues()
    return FieldFormCatalogDocumentResponse(
        namespace=_FIELD_FORMS_NAMESPACE,
        schema_version=_FIELD_FORMS_SCHEMA_VERSION,
        revision=document.revision if document is not None else 0,
        values=values,
        updated_by=document.updated_by if document is not None else None,
        created_at=document.created_at if document is not None else None,
        updated_at=document.updated_at if document is not None else None,
    )


async def _validated_field_forms(
    db: AsyncSession,
    submitted: FieldFormCatalogValues,
    previous: FieldFormCatalogValues,
    *,
    current_user: User,
) -> FieldFormCatalogValues:
    """Validate scopes and preserve every historical form definition."""
    previous_by_id = {
        (item.template_key, item.version): item for item in previous.templates
    }
    submitted_by_id = {
        (item.template_key, item.version): item for item in submitted.templates
    }
    if len(submitted_by_id) != len(submitted.templates):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Une version de formulaire est présente plusieurs fois.",
        )
    removed = sorted(set(previous_by_id) - set(submitted_by_id))
    if removed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Une version publiée ne peut pas être supprimée. "
                "Désactivez-la afin de préserver les anciennes réponses."
            ),
        )

    normalized: list[FieldFormTemplateVersion] = []
    now = datetime.now(timezone.utc)
    previous_versions: dict[str, list[int]] = {}
    for item in previous.templates:
        previous_versions.setdefault(item.template_key, []).append(item.version)

    for item in submitted.templates:
        identity = (item.template_key, item.version)
        old = previous_by_id.get(identity)
        if old is not None:
            immutable_old = old.model_dump(exclude={"active"})
            immutable_new = item.model_dump(exclude={"active"})
            if immutable_new != immutable_old:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Le formulaire {item.template_key} v{item.version} est publié "
                        "et immuable. Créez une nouvelle version pour le modifier."
                    ),
                )
            normalized.append(old.model_copy(update={"active": item.active}))
            continue

        versions = previous_versions.get(item.template_key, [])
        expected_version = max(versions) + 1 if versions else 1
        if item.version != expected_version:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"La prochaine version de {item.template_key} doit être "
                    f"v{expected_version}."
                ),
            )
        normalized.append(
            item.model_copy(update={"created_at": now, "created_by": current_user.id})
        )

    active_by_key: dict[str, int] = {}
    for item in normalized:
        if not item.active:
            continue
        if item.template_key in active_by_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Une seule version du formulaire {item.template_key} "
                    "peut être active."
                ),
            )
        active_by_key[item.template_key] = item.version

    catalog_document = await _get_document(db, _CATALOG_NAMESPACE)
    catalog = _catalog_response(catalog_document).values
    activity_codes = {item.code for item in catalog.job_types if item.active}
    referenced_activities = {
        code for item in normalized for code in item.scope.activity_codes
    }
    unknown_activities = sorted(referenced_activities - activity_codes)
    if unknown_activities:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Un formulaire référence une activité absente ou archivée : "
                + ", ".join(unknown_activities)
            ),
        )

    client_ids = {
        client_id
        for item in normalized
        for client_id in item.scope.client_organization_ids
    }
    if client_ids:
        existing_client_ids = set(
            (
                await db.execute(
                    select(ClientOrganization.id).where(
                        ClientOrganization.id.in_(client_ids)
                    )
                )
            ).scalars().all()
        )
        missing_clients = sorted(client_ids - existing_client_ids)
        if missing_clients:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Un formulaire référence une entreprise cliente inexistante : "
                    + ", ".join(str(value) for value in missing_clients)
                ),
            )

    return FieldFormCatalogValues(
        templates=sorted(
            normalized,
            key=lambda item: (item.template_key, item.version),
        )
    )


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
    Remplace le document opérationnel V1 avec précondition de révision.

    ``null`` désactive ou laisse volontairement non configurée une règle.
    Aucune valeur métier implicite n'est ajoutée par le backend.
    """

    document = await _get_document(
        db,
        _OPERATIONAL_NAMESPACE,
        for_update=True,
    )
    previous_values = dict(document.values or {}) if document is not None else None
    current_revision = int(document.revision or 0) if document is not None else 0

    if payload.expected_revision != current_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "La configuration opérationnelle a été modifiée depuis "
                    "votre dernière lecture. Rechargez avant d'enregistrer."
                ),
                "revision": current_revision,
            },
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

    client_ids = {int(key) for key in payload.values.completion_policy.by_client_organization}
    if client_ids:
        existing = set((await db.execute(select(ClientOrganization.id).where(ClientOrganization.id.in_(client_ids)))).scalars().all())
        if client_ids - existing:
            raise HTTPException(status_code=422, detail="Une règle de clôture référence une entreprise cliente inexistante.")
    serialized_values = payload.values.model_dump(
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
        document.revision = current_revision + 1
        document.values = serialized_values
        document.updated_by = current_user.id

    try:
        record_operational_audit(
            db,
            current_user=current_user,
            action="settings.operational_updated",
            entity_type="application_setting",
            entity_id=_OPERATIONAL_NAMESPACE,
            before={"revision": current_revision, "values": previous_values},
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


@router.get("/forms", response_model=FieldFormCatalogDocumentResponse)
async def get_field_forms(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return all form versions so historical submissions remain readable."""
    return _field_forms_response(
        await _get_document(db, _FIELD_FORMS_NAMESPACE)
    )


@router.put("/forms", response_model=FieldFormCatalogDocumentResponse)
async def update_field_forms(
    payload: FieldFormCatalogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Publish, version, duplicate, activate or soft-archive terrain forms."""
    document = await _get_document(
        db,
        _FIELD_FORMS_NAMESPACE,
        for_update=True,
    )
    current_revision = int(document.revision or 0) if document is not None else 0
    if payload.expected_revision != current_revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Les formulaires ont été modifiés. Rechargez avant d'enregistrer.",
        )
    if document is not None and document.schema_version > _FIELD_FORMS_SCHEMA_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le catalogue de formulaires utilise une version plus récente.",
        )

    previous = FieldFormCatalogValues.model_validate(
        document.values or {}
    ) if document is not None else FieldFormCatalogValues()
    values = await _validated_field_forms(
        db,
        payload.values,
        previous,
        current_user=current_user,
    )
    serialized = values.model_dump(mode="json")
    if document is None:
        document = ApplicationSetting(
            namespace=_FIELD_FORMS_NAMESPACE,
            schema_version=_FIELD_FORMS_SCHEMA_VERSION,
            revision=1,
            values=serialized,
            updated_by=current_user.id,
        )
        db.add(document)
    else:
        document.schema_version = _FIELD_FORMS_SCHEMA_VERSION
        document.revision = current_revision + 1
        document.values = serialized
        document.updated_by = current_user.id

    try:
        record_operational_audit(
            db,
            current_user=current_user,
            action="settings.field_forms_updated",
            entity_type="application_setting",
            entity_id=_FIELD_FORMS_NAMESPACE,
            before={"revision": current_revision, "values": previous.model_dump(mode="json")},
            after={"revision": document.revision, "values": serialized},
        )
        await db.commit()
        await db.refresh(document)
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Les formulaires ont été modifiés simultanément.",
        ) from error
    return _field_forms_response(document)
