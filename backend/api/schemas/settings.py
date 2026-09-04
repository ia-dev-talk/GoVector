"""
Schémas Pydantic du moteur de paramètres BlueVector.

Le premier namespace livré est ``operational``. Les autres domaines
(interventions, affectation, stock, mobile, cartographie, intégrations)
pourront suivre le même contrat sans introduire de constantes métier dans
les interfaces.
"""

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, PositiveInt, field_validator


class CompletionRequirementsValues(BaseModel):
    """Evidence policy applied before technician termination."""

    model_config = ConfigDict(extra="forbid")

    require_client_signature: bool = False
    require_cable_length: bool = False
    require_measurements: bool = False
    require_gps: bool = False
    require_stock_consumption: bool = False
    minimum_photos: NonNegativeInt = 0
    required_field_keys: List[str] = Field(default_factory=list)


class CompletionPolicyValues(BaseModel):
    """Completion defaults with safe extension points for business scopes."""

    model_config = ConfigDict(extra="forbid")

    default: CompletionRequirementsValues = Field(
        default_factory=CompletionRequirementsValues
    )
    by_job_type: Dict[str, CompletionRequirementsValues] = Field(
        default_factory=dict
    )
    by_operator: Dict[str, CompletionRequirementsValues] = Field(
        default_factory=dict
    )
    by_client_organization: Dict[str, CompletionRequirementsValues] = Field(default_factory=dict)

    @field_validator("by_client_organization")
    @classmethod
    def canonical_client_ids(cls, rules):
        if any(len(key) > 10 or not key.isascii() or not key.isdigit() or str(int(key)) != key or not 0 < int(key) <= 2147483647 for key in rules):
            raise ValueError("Chaque règle client doit utiliser un identifiant numérique positif canonique")
        return rules


class OrienteurObservationPolicy(BaseModel):
    """Personalize observation only; never grant execution permissions."""

    model_config = ConfigDict(extra="forbid")
    appointment_grace_minutes: int = Field(default=30, ge=0, le=1440, strict=True)
    flag_missing_sector: bool = True


class OperationalSettingsValues(BaseModel):
    """Valeurs opérationnelles consommées par le web et le mobile."""

    model_config = ConfigDict(extra="forbid")

    orienteur_observation: OrienteurObservationPolicy = Field(
        default_factory=OrienteurObservationPolicy
    )

    gps_stale_after_minutes: Optional[PositiveInt] = None
    gps_history_retention_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3650,
        description=(
            "Durée de conservation des points GPS bruts. Une valeur nulle "
            "signifie que la politique n'est pas encore configurée, pas que "
            "les données peuvent être conservées indéfiniment."
        ),
    )
    completion_policy: CompletionPolicyValues = Field(
        default_factory=CompletionPolicyValues
    )


class OperationalSettingsUpdate(BaseModel):
    """Remplacement complet du document opérationnel V1 sous révision."""

    model_config = ConfigDict(extra="forbid")

    expected_revision: NonNegativeInt
    values: OperationalSettingsValues


class SettingsDocumentResponse(BaseModel):
    """Document administratif avec sa version et sa traçabilité."""

    namespace: str
    schema_version: int
    revision: int
    values: OperationalSettingsValues
    updated_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class RuntimeNamespaceMeta(BaseModel):
    """Métadonnées minimales exposées au runtime."""

    schema_version: int
    revision: int
    updated_at: Optional[datetime] = None


class RuntimeSettingsResponse(BaseModel):
    """
    Configuration nécessaire au fonctionnement des clients.

    Ce contrat est volontairement distinct de la réponse administrative :
    il n'expose que les valeurs runtime et leurs versions.
    """

    generated_at: datetime
    operational: OperationalSettingsValues
    meta: Dict[str, RuntimeNamespaceMeta]


class CatalogItem(BaseModel):
    """Editable presentation around an immutable technical identifier."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{1,47}$")
    label: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = Field(default=0, ge=0, le=10000)
    active: bool = True
    metadata: Dict[str, object] = Field(default_factory=dict)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Le libellé ne peut pas être vide")
        return cleaned


class BusinessCatalogValues(BaseModel):
    """Governed catalogs consumed by administrative and runtime clients."""

    model_config = ConfigDict(extra="forbid")

    technician_grades: List[CatalogItem] = Field(default_factory=list)
    job_types: List[CatalogItem] = Field(default_factory=list)
    priorities: List[CatalogItem] = Field(default_factory=list)
    status_presentations: List[CatalogItem] = Field(default_factory=list)
    field_actions: List[CatalogItem] = Field(default_factory=list)

    @field_validator("technician_grades")
    @classmethod
    def classify_technician_grades(
        cls, items: List[CatalogItem]
    ) -> List[CatalogItem]:
        """Make system/custom classification authoritative on every API round-trip."""
        protected_codes = {"junior", "senior"}
        normalized: List[CatalogItem] = []
        for item in items:
            metadata = dict(item.metadata or {})
            metadata["custom"] = item.code not in protected_codes
            normalized.append(item.model_copy(update={"metadata": metadata}))
        return normalized


class BusinessCatalogUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: NonNegativeInt
    values: BusinessCatalogValues


class BusinessCatalogDocumentResponse(BaseModel):
    namespace: str
    schema_version: int
    revision: int
    values: BusinessCatalogValues
    updated_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
