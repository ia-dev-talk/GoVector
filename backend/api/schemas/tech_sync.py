from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


SyncEventStatus = Literal[
    "acknowledged",
    "retryable",
    "conflict",
    "rejected",
]


class TechnicianSyncEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: UUID
    schema_version: Literal[1]
    job_id: int = Field(gt=0)
    type: str = Field(min_length=1, max_length=64)
    occurred_at: datetime
    payload: dict[str, Any] = Field(default_factory=dict)


class TechnicianSyncBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[TechnicianSyncEventRequest] = Field(
        min_length=1,
        max_length=100,
    )


class TechnicianSyncEventResult(BaseModel):
    event_id: UUID
    status: SyncEventStatus
    code: str | None = None
    error: str | None = None


class TechnicianSyncBatchResponse(BaseModel):
    results: list[TechnicianSyncEventResult]
