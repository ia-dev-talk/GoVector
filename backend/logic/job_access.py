"""Resource-level authorization for jobs and their assignments."""

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.errors import BusinessAPIError
from backend.database.models import (
    Job,
    JobActivityLog,
    TechnicianFieldAction,
    User,
    UserRole,
)
from backend.logic import assignments as assignment_logic


def _denied(message: str = "Accès refusé à cette intervention") -> None:
    raise BusinessAPIError(
        status.HTTP_403_FORBIDDEN,
        "permission_denied",
        message,
    )


async def require_job_read_access(
    db: AsyncSession,
    *,
    job: Job,
    current_user: User,
) -> Job:
    if current_user.role in {UserRole.ADMIN, UserRole.CHEF_ORIENTEUR}:
        return job

    if current_user.role == UserRole.ORIENTEUR:
        if (
            current_user.orienteur_id is not None
            and job.orienteur_id == current_user.orienteur_id
        ):
            return job
        _denied()

    if current_user.role == UserRole.TECHNICIAN:
        if current_user.technician_id is None:
            _denied("Profil technicien non lié")
        assignment = await assignment_logic.get_assignment_for_technician_job(
            db,
            technician_id=current_user.technician_id,
            job_id=job.id,
        )
        if assignment is not None:
            return job
        _denied("Cette intervention n'est pas affectée au technicien authentifié")

    if current_user.role == UserRole.CLIENT:
        if (
            current_user.client_organization_id is not None
            and job.client_organization_id == current_user.client_organization_id
        ):
            return job
        _denied("Cette intervention n'appartient pas à votre entreprise")

    _denied()


async def require_job_read_access_by_id(
    db: AsyncSession,
    *,
    job_id: int,
    current_user: User,
) -> Job:
    """Load a job and enforce the shared resource-level read policy."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise BusinessAPIError(
            status.HTTP_404_NOT_FOUND,
            "job_not_found",
            f"Intervention {job_id} introuvable",
        )
    return await require_job_read_access(
        db,
        job=job,
        current_user=current_user,
    )


async def require_job_collaboration_access(
    db: AsyncSession,
    *,
    job: Job,
    current_user: User,
) -> Job:
    """Allow an internal participant to append context without reopening work.

    A technician keeps this narrow right after completion, failure or report if
    they are still assigned or already authored durable business evidence for
    the intervention. Client accounts remain read-only.
    """
    if current_user.role in {UserRole.ADMIN, UserRole.CHEF_ORIENTEUR}:
        return job
    if current_user.role == UserRole.ORIENTEUR:
        return require_job_operations_access(job=job, current_user=current_user)
    if current_user.role != UserRole.TECHNICIAN or current_user.technician_id is None:
        _denied("Cette intervention est disponible en lecture seule")

    assignment = await assignment_logic.get_assignment_for_technician_job(
        db,
        technician_id=current_user.technician_id,
        job_id=job.id,
    )
    if assignment is not None:
        return job

    participated = await db.scalar(
        select(JobActivityLog.id)
        .where(
            JobActivityLog.job_id == job.id,
            JobActivityLog.technician_id == current_user.technician_id,
        )
        .limit(1)
    )
    if participated is None:
        participated = await db.scalar(
            select(TechnicianFieldAction.id)
            .where(
                TechnicianFieldAction.job_id == job.id,
                TechnicianFieldAction.technician_id == current_user.technician_id,
            )
            .limit(1)
        )
    if participated is not None:
        return job
    _denied("Le technicien n'a pas participé à cette intervention")


def require_job_operations_access(*, job: Job, current_user: User) -> Job:
    """Authorize assignment/dispatch mutations for an operational role."""
    if current_user.role in {UserRole.ADMIN, UserRole.CHEF_ORIENTEUR}:
        return job
    if (
        current_user.role == UserRole.ORIENTEUR
        and current_user.orienteur_id is not None
        and job.orienteur_id == current_user.orienteur_id
    ):
        return job
    _denied("Vous ne pouvez pas modifier l'affectation de cette intervention")
