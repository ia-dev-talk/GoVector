"""Read-only technician and site history contracts."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from backend.database.models import JobStatus, JobType


class TechnicianHistoryActivity(BaseModel):
    action: str
    description: str | None = None
    old_status: str | None = None
    new_status: str | None = None
    technician_id: int | None = None
    technician_name: str | None = None
    created_at: datetime


class TechnicianHistoryItem(BaseModel):
    job_id: int
    job_number: str | None = None
    date: datetime
    activity: JobType
    client: str | None = None
    address: str | None = None
    city: str | None = None
    postal_code: str | None = None
    status: JobStatus
    result: str | None = None
    operator: str | None = None
    nro: str | None = None
    sro: str | None = None
    pbo: str | None = None
    pto: str | None = None
    started_at: datetime | None = None
    arrival_time: datetime | None = None
    duration_minutes: int | None = None
    completed_at: datetime | None = None
    failure_reason: str | None = None
    report: str | None = None
    technician_id: int | None = None
    technician_name: str | None = None
    is_current: bool = False
    timeline: list[TechnicianHistoryActivity] = Field(default_factory=list)


class TechnicianHistoryPage(BaseModel):
    items: list[TechnicianHistoryItem]
    page: int
    page_size: int
    total: int
    pages: int


class TechnicianHistoryDetail(BaseModel):
    intervention: TechnicianHistoryItem
    activity_log: list[TechnicianHistoryActivity]
    field_data: dict[str, Any]
    failures: list[dict[str, Any]]
    postponements: list[dict[str, Any]]
    materials: list[dict[str, Any]]
    media_references: list[dict[str, Any]]
    visits: list[dict[str, Any]] = Field(default_factory=list)
    read_only: bool = True


class TechnicianSiteHistoryPage(TechnicianHistoryPage):
    current_job_id: int
    match_basis: str
    match_confidence: str
