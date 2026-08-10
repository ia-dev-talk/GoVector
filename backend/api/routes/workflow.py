"""Canonical workflow metadata endpoints for authenticated clients."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.errors import BusinessAPIError
from backend.api.schemas.workflow import (
    JobWorkflowCapabilitiesResponse,
    WorkflowCapabilitiesResponse,
)
from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models import User
from backend.logic.completion_policy import CompletionPolicy
from backend.logic.job_access import require_job_read_access
from backend.logic.jobs import get_job
from backend.logic.workflow.capabilities import (
    COMMAND_DEFINITIONS,
    all_status_capabilities,
    allowed_commands_for_job,
    configured_completion_policy,
    status_capability,
)


router = APIRouter(tags=["Workflow Capabilities"])


@router.get("/capabilities", response_model=WorkflowCapabilitiesResponse)
async def get_workflow_capabilities(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return WorkflowCapabilitiesResponse(
        current_role=current_user.role.value,
        statuses=all_status_capabilities(),
        commands=list(COMMAND_DEFINITIONS),
        completion_policy=await configured_completion_policy(db),
    )


@router.get(
    "/jobs/{job_id}/capabilities",
    response_model=JobWorkflowCapabilitiesResponse,
)
async def get_job_workflow_capabilities(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await get_job(db, job_id)
    if job is None:
        raise BusinessAPIError(
            status.HTTP_404_NOT_FOUND,
            "job_not_found",
            f"Intervention {job_id} introuvable",
        )
    await require_job_read_access(db, job=job, current_user=current_user)

    policy = CompletionPolicy(db)
    requirements = await policy.resolve(job)
    assessment = await policy.evaluate(job)
    return JobWorkflowCapabilitiesResponse(
        job_id=job.id,
        status=status_capability(job.status),
        allowed_commands=await allowed_commands_for_job(
            db,
            job=job,
            current_user=current_user,
        ),
        completion_requirements=requirements,
        completion_assessment=assessment.as_dict(),
    )
