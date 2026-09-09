"""Delivery-week workflow helpers for Agent terrain review decisions.

The canonical workflow graph intentionally remains conservative for legacy
callers.  Agent terrain review is the one delivery-specific exception that can
re-open a submitted job from EN_ATTENTE_VALIDATION back to IN_PROGRESS.  This
subclass is only used by the team-scoped Agent review endpoint, so office and
technician callers cannot gain the transition implicitly.
"""

from __future__ import annotations

from backend.database.models import Job, JobStatus
from backend.logic.workflow.engine import WorkflowEngine


class FieldAgentReviewWorkflowEngine(WorkflowEngine):
    """Workflow engine with the single Agent-return transition enabled."""

    async def _validate_transition(self, job: Job, new_status: JobStatus):
        if (
            job.status == JobStatus.EN_ATTENTE_VALIDATION
            and new_status == JobStatus.IN_PROGRESS
        ):
            return
        await super()._validate_transition(job, new_status)

    def _build_description(
        self,
        job: Job,
        old_status: JobStatus,
        new_status: JobStatus,
        metadata=None,
    ) -> str:
        extra = (metadata or {}).get("extra") or {}
        if (
            old_status == JobStatus.EN_ATTENTE_VALIDATION
            and new_status == JobStatus.IN_PROGRESS
            and extra.get("source") == "field_agent_return"
        ):
            reason = str(extra.get("reason") or "").strip()
            suffix = f" — motif : {reason}" if reason else ""
            return f"Retournée au technicien pour correction{suffix}"
        return super()._build_description(job, old_status, new_status, metadata)
