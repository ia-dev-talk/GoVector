"""Canonical lifecycle classification and user-facing workflow commands."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.settings import (
    CompletionPolicyValues,
    OperationalSettingsValues,
)
from backend.database.models import (
    ApplicationSetting,
    Job,
    JobStatus,
    User,
    UserRole,
)
from backend.logic import assignments as assignment_logic
from backend.logic.workflow.engine import get_valid_transitions


@dataclass(frozen=True)
class StatusMetadata:
    label: str
    order_open: bool
    field_active: bool
    canonical: JobStatus
    category: str


STATUS_METADATA: dict[JobStatus, StatusMetadata] = {
    JobStatus.PENDING: StatusMetadata("À affecter", True, False, JobStatus.PENDING, "unassigned"),
    JobStatus.ASSIGNED: StatusMetadata("Affectée", True, True, JobStatus.ASSIGNED, "field_active"),
    JobStatus.ACCEPTED: StatusMetadata("Acceptée", True, True, JobStatus.ACCEPTED, "field_active"),
    JobStatus.EN_ROUTE: StatusMetadata("En route", True, True, JobStatus.EN_ROUTE, "field_active"),
    JobStatus.ON_SITE: StatusMetadata("Sur site", True, True, JobStatus.ON_SITE, "field_active"),
    JobStatus.IN_PROGRESS: StatusMetadata("Travaux en cours", True, True, JobStatus.IN_PROGRESS, "field_active"),
    JobStatus.WORK_IN_PROGRESS: StatusMetadata("Travaux en cours", True, True, JobStatus.IN_PROGRESS, "field_active"),
    JobStatus.INSTALLATION_DONE: StatusMetadata("Installation terminée", True, True, JobStatus.INSTALLATION_DONE, "field_active"),
    JobStatus.CLIENT_VALIDATION: StatusMetadata("Validation client", True, True, JobStatus.CLIENT_VALIDATION, "field_active"),
    JobStatus.EN_ATTENTE_VALIDATION: StatusMetadata("En attente de validation", True, False, JobStatus.EN_ATTENTE_VALIDATION, "awaiting_validation"),
    JobStatus.COMPLETED: StatusMetadata("Terminée", False, False, JobStatus.COMPLETED, "closed"),
    JobStatus.CANCELLED: StatusMetadata("Annulée", False, False, JobStatus.CANCELLED, "closed"),
    JobStatus.FAILED: StatusMetadata("Échec terrain", True, False, JobStatus.FAILED, "interrupted"),
    JobStatus.CLIENT_ABSENT: StatusMetadata("Client absent", True, False, JobStatus.CLIENT_ABSENT, "interrupted"),
    JobStatus.POSTPONED: StatusMetadata("Reportée", True, False, JobStatus.POSTPONED, "paused"),
    JobStatus.ON_HOLD: StatusMetadata("En attente", True, False, JobStatus.ON_HOLD, "paused"),
    JobStatus.SUSPENDED: StatusMetadata("Suspendue", True, False, JobStatus.SUSPENDED, "paused"),
}


COMMAND_DEFINITIONS = (
    {"code": "accept_and_start", "label": "Accepter & démarrer", "roles": ["TECHNICIAN", "CHEF_ORIENTEUR"]},
    {"code": "arrive", "label": "Arrivé sur site", "roles": ["TECHNICIAN", "CHEF_ORIENTEUR"]},
    {"code": "start_work", "label": "Commencer les travaux", "roles": ["TECHNICIAN", "CHEF_ORIENTEUR"]},
    {"code": "close_field_visit", "label": "Clôturer l'intervention", "roles": ["TECHNICIAN", "CHEF_ORIENTEUR"]},
    {"code": "fail", "label": "Déclarer un échec", "roles": ["TECHNICIAN", "CHEF_ORIENTEUR"]},
    {"code": "postpone", "label": "Reporter", "roles": ["TECHNICIAN", "CHEF_ORIENTEUR", "ORIENTEUR", "ADMIN"]},
    {"code": "validate", "label": "Valider", "roles": ["ORIENTEUR", "ADMIN"]},
    {"code": "reassign", "label": "Réaffecter", "roles": ["ORIENTEUR", "ADMIN"]},
)


def status_capability(status: JobStatus, presentation: dict | None = None) -> dict:
    metadata = STATUS_METADATA[status]
    configured = presentation or {}
    return {
        "code": status.value,
        "label": configured.get("label") or metadata.label,
        "color": configured.get("color"),
        "sort_order": configured.get("sort_order", 0),
        "order_open": metadata.order_open,
        "field_active": metadata.field_active,
        "canonical": metadata.canonical.value,
        "category": metadata.category,
    }


def all_status_capabilities(presentations: dict[str, dict] | None = None) -> list[dict]:
    configured = presentations or {}
    return [
        status_capability(status, configured.get(status.value))
        for status in JobStatus
    ]


async def configured_status_presentations(db: AsyncSession) -> dict[str, dict]:
    result = await db.execute(
        select(ApplicationSetting).where(
            ApplicationSetting.namespace == "business_catalog"
        )
    )
    document = result.scalar_one_or_none()
    if document is None:
        return {}
    items = (document.values or {}).get("status_presentations", [])
    return {
        str(item["code"]): item
        for item in items
        if isinstance(item, dict) and item.get("code")
    }


async def configured_completion_policy(db: AsyncSession) -> CompletionPolicyValues:
    result = await db.execute(
        select(ApplicationSetting).where(ApplicationSetting.namespace == "operational")
    )
    document = result.scalar_one_or_none()
    values = OperationalSettingsValues.model_validate(
        document.values if document is not None else {}
    )
    return values.completion_policy


async def allowed_commands_for_job(
    db: AsyncSession,
    *,
    job: Job,
    current_user: User,
) -> list[str]:
    allowed: list[str] = []
    role = current_user.role

    if role in {UserRole.TECHNICIAN, UserRole.CHEF_ORIENTEUR} and current_user.technician_id:
        assignment = await assignment_logic.get_assignment_for_technician_job(
            db,
            technician_id=current_user.technician_id,
            job_id=job.id,
        )
        if assignment is not None:
            if job.status in {JobStatus.ASSIGNED, JobStatus.ACCEPTED}:
                allowed.append("accept_and_start")
            elif job.status == JobStatus.EN_ROUTE:
                allowed.append("arrive")
            elif job.status == JobStatus.ON_SITE:
                allowed.append("start_work")
            elif job.status in {
                JobStatus.IN_PROGRESS,
                JobStatus.WORK_IN_PROGRESS,
                JobStatus.INSTALLATION_DONE,
                JobStatus.CLIENT_VALIDATION,
            }:
                allowed.append("close_field_visit")

            transitions = set(get_valid_transitions(job.status))
            if JobStatus.FAILED in transitions:
                allowed.append("fail")
            if JobStatus.POSTPONED in transitions:
                allowed.append("postpone")

    if role in {UserRole.ORIENTEUR, UserRole.ADMIN}:
        transitions = set(get_valid_transitions(job.status))
        from backend.logic.validation_pipeline import is_field_agent_verified

        if (
            JobStatus.COMPLETED in transitions
            and job.status == JobStatus.EN_ATTENTE_VALIDATION
            and is_field_agent_verified(getattr(job, "validation_status", None))
        ):
            allowed.append("validate")
        if STATUS_METADATA[job.status].order_open:
            allowed.append("reassign")
        if JobStatus.POSTPONED in transitions and "postpone" not in allowed:
            allowed.append("postpone")

    return allowed
