"""
Schémas Pydantic du moteur de paramètres BlueVector.

Le premier namespace livré est ``operational``. Les autres domaines
(interventions, affectation, stock, mobile, cartographie, intégrations)
pourront suivre le même contrat sans introduire de constantes métier dans
les interfaces.
"""

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, PositiveInt


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


class OperationalSettingsValues(BaseModel):
    """Valeurs opérationnelles consommées par le web et le mobile."""

    model_config = ConfigDict(extra="forbid")

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


class OperationalSettingsUpdate(OperationalSettingsValues):
    """Remplacement complet du document opérationnel V1."""


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
