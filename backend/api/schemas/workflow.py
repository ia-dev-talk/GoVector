"""Canonical workflow metadata shared by API, Web and Mobile clients."""

from typing import Any

from pydantic import BaseModel, Field

from backend.api.schemas.settings import (
    CompletionPolicyValues,
    CompletionRequirementsValues,
)


class WorkflowStatusCapability(BaseModel):
    code: str
    label: str
    order_open: bool
    field_active: bool
    canonical: str
    category: str


class WorkflowCommandCapability(BaseModel):
    code: str
    label: str
    roles: list[str]


class WorkflowCapabilitiesResponse(BaseModel):
    schema_version: int = 1
    current_role: str
    statuses: list[WorkflowStatusCapability]
    commands: list[WorkflowCommandCapability]
    completion_policy: CompletionPolicyValues


class JobWorkflowCapabilitiesResponse(BaseModel):
    schema_version: int = 1
    job_id: int
    status: WorkflowStatusCapability
    allowed_commands: list[str]
    completion_requirements: CompletionRequirementsValues
    completion_assessment: dict[str, Any] = Field(default_factory=dict)
