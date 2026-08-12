"""Central completion-evidence policy for technician interventions.

Workflow state, authentication, assignment and permissions are enforced by the
technician command service. This component only evaluates field evidence.
Public V2 treats normalized technician evidence (media, field actions and site
observations) as first-class truth while preserving legacy Job fields for
backward compatibility. A technician must never enter the same proof twice just
because an older screen expected a denormalized column.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.settings import (
    CompletionPolicyValues,
    CompletionRequirementsValues,
    OperationalSettingsValues,
)
from backend.database.models import (
    ApplicationSetting,
    Job,
    JobSiteObservation,
    StockConsumption,
    TechnicianFieldAction,
    TechnicianMedia,
)


_OPERATIONAL_NAMESPACE = "operational"

_FIELD_LABELS = {
    "client_signature": "Signature client",
    "cable_length_m": "Longueur de câble",
    "optical_power_dbm": "Mesure optique",
    "gps": "Position GPS",
    "stock_consumption": "Matériel consommé",
    "photos": "Photo terrain",
    "comment": "Commentaire terrain",
    "nro": "NRO",
    "sro": "SRO",
    "pbo": "PBO",
    "pto": "PTO",
    "ont_serial": "Numéro de série ONT",
    "router_serial": "Numéro de série routeur",
    "mac_address": "Adresse MAC",
}


@dataclass(frozen=True)
class CompletionAssessment:
    can_complete: bool
    blocking_requirements: tuple[str, ...]
    warnings: tuple[str, ...]
    optional_missing: tuple[str, ...]
    required_field_keys: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        issues = list(self.blocking_requirements)
        return {
            "can_complete": self.can_complete,
            "issues": issues,
            "missing_count": len(issues),
            "blocking_requirements": issues,
            "warnings": list(self.warnings),
            "optional_missing": list(self.optional_missing),
            "required_field_keys": list(self.required_field_keys),
        }


class CompletionPolicy:
    """Resolve and evaluate the versioned operational completion policy."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def resolve(self, job: Job) -> CompletionRequirementsValues:
        result = await self.db.execute(
            select(ApplicationSetting).where(
                ApplicationSetting.namespace == _OPERATIONAL_NAMESPACE
            )
        )
        document = result.scalar_one_or_none()
        values = OperationalSettingsValues.model_validate(
            document.values if document is not None else {}
        )
        policy: CompletionPolicyValues = values.completion_policy

        job_type = getattr(job.job_type, "value", str(job.job_type))
        operator = (getattr(job, "operator", None) or "").strip().lower()
        operator_keys = {
            key.strip().lower(): key for key in policy.by_operator
        }
        if operator and operator in operator_keys:
            return policy.by_operator[operator_keys[operator]]
        if job_type in policy.by_job_type:
            return policy.by_job_type[job_type]
        return policy.default

    async def evaluate(self, job: Job) -> CompletionAssessment:
        requirements = await self.resolve(job)
        missing = self._missing_legacy_evidence(job)
        evidence = await self._normalized_evidence(job.id)

        # V2 normalized facts satisfy their matching legacy evidence key.
        if evidence["has_signature"]:
            missing.pop("client_signature", None)
        if evidence["has_site_gps"]:
            missing.pop("gps", None)
        if evidence["has_comment"]:
            missing.pop("comment", None)

        legacy_photo_keys = {
            str(value)
            for value in (
                getattr(job, "before_photo", None),
                getattr(job, "after_photo", None),
            )
            if value
        }
        photo_keys = legacy_photo_keys | evidence["mobile_photo_keys"]
        photo_count = len(photo_keys)
        if photo_count > 0:
            missing.pop("photos", None)

        if requirements.require_stock_consumption:
            result = await self.db.execute(
                select(func.count(StockConsumption.id)).where(
                    StockConsumption.job_id == job.id,
                    StockConsumption.status == "VALIDE",
                )
            )
            if (result.scalar() or 0) == 0:
                missing["stock_consumption"] = _FIELD_LABELS[
                    "stock_consumption"
                ]

        required_keys = set(requirements.required_field_keys)
        if requirements.require_client_signature:
            required_keys.add("client_signature")
        if requirements.require_cable_length:
            required_keys.add("cable_length_m")
        if requirements.require_measurements:
            required_keys.add("optical_power_dbm")
        if requirements.require_gps:
            required_keys.add("gps")
        if requirements.require_stock_consumption:
            required_keys.add("stock_consumption")
        if requirements.minimum_photos > 0:
            required_keys.add("photos")

        blocking = []
        for key in sorted(required_keys):
            if key == "photos":
                if photo_count < requirements.minimum_photos:
                    blocking.append(
                        f"{requirements.minimum_photos} photo(s) terrain requise(s)"
                    )
            elif key in missing:
                blocking.append(f"{missing[key]} obligatoire")

        optional_missing = [
            label for key, label in missing.items() if key not in required_keys
        ]
        warnings = [
            f"{label} non renseigné (facultatif)" for label in optional_missing
        ]
        return CompletionAssessment(
            can_complete=not blocking,
            blocking_requirements=tuple(blocking),
            warnings=tuple(warnings),
            optional_missing=tuple(optional_missing),
            required_field_keys=tuple(sorted(required_keys)),
        )

    async def _normalized_evidence(self, job_id: int) -> dict[str, Any]:
        media_rows = (
            await self.db.execute(
                select(
                    TechnicianMedia.kind,
                    TechnicianMedia.storage_key,
                ).where(TechnicianMedia.job_id == job_id)
            )
        ).all()
        media_by_kind: dict[str, set[str]] = {}
        for kind, storage_key in media_rows:
            media_by_kind.setdefault(str(kind), set()).add(
                str(storage_key or "")
            )

        action_types = set(
            (
                await self.db.execute(
                    select(TechnicianFieldAction.action_type).where(
                        TechnicianFieldAction.job_id == job_id
                    )
                )
            ).scalars().all()
        )
        observation_types = set(
            (
                await self.db.execute(
                    select(JobSiteObservation.observation_type).where(
                        JobSiteObservation.job_id == job_id
                    )
                )
            ).scalars().all()
        )

        return {
            "has_signature": bool(media_by_kind.get("signature"))
            or "client_signature" in action_types,
            "mobile_photo_keys": media_by_kind.get("photo", set()),
            "has_site_gps": bool(
                {"site_location", "gps_position"} & (action_types | observation_types)
            ),
            "has_comment": "intervention_comment" in action_types,
            "action_types": action_types,
            "observation_types": observation_types,
        }

    @staticmethod
    def _missing_legacy_evidence(job: Job) -> dict[str, str]:
        missing: dict[str, str] = {}
        direct_fields = (
            "client_signature",
            "cable_length_m",
            "optical_power_dbm",
            "ont_serial",
            "router_serial",
            "mac_address",
        )
        for key in direct_fields:
            value = getattr(job, key, None)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing[key] = _FIELD_LABELS[key]

        if not getattr(job, "coordinator_comments", None) and not getattr(
            job, "notes", None
        ):
            missing["comment"] = _FIELD_LABELS["comment"]

        for key in ("nro", "sro", "pbo", "pto"):
            if not getattr(job, f"{key}_id", None) and not getattr(
                job, f"{key}_raw", None
            ):
                missing[key] = _FIELD_LABELS[key]

        if (
            getattr(job, "gps_latitude", None) is None
            or getattr(job, "gps_longitude", None) is None
        ):
            missing["gps"] = _FIELD_LABELS["gps"]
        if not getattr(job, "before_photo", None) and not getattr(
            job, "after_photo", None
        ):
            missing["photos"] = _FIELD_LABELS["photos"]
        return missing
