from datetime import datetime
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

# Some legacy route modules still import ``database`` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.routes import tech_jobs as tech_jobs_routes
from backend.api.errors import BusinessAPIError
from backend.api.schemas.jobs import JobStatusTransition
from backend.database.models import JobStatus, JobType, UserRole
from backend.logic import technician_jobs
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    TechnicianStartResult,
)
from backend.logic.workflow import engine as workflow_engine


class _FakeDb:
    def __init__(self, job=None):
        self.commit = AsyncMock()
        self.rollback = AsyncMock()
        self.refresh = AsyncMock()
        self.flush = AsyncMock()
        self.execute = AsyncMock(
            return_value=SimpleNamespace(
                scalar_one_or_none=lambda: job,
            )
        )


def _user(technician_id=3):
    return SimpleNamespace(
        id=3,
        role=UserRole.TECHNICIAN,
        technician_id=technician_id,
    )


def _job(status: JobStatus):
    return SimpleNamespace(
        id=8,
        status=status,
        job_type=JobType.INSTALLATION,
        customer_name="Client Test",
        accepted_at=None,
        started_at=None,
        started_by=None,
        start_latitude=None,
        start_longitude=None,
        gps_latitude=None,
        gps_longitude=None,
        arrival_time=None,
        completed_at=None,
        updated_at=None,
        assignment=SimpleNamespace(technician_id=3),
    )


@pytest.fixture
def start_service(monkeypatch):
    logs = []

    async def log_activity(**kwargs):
        logs.append(kwargs)

    monkeypatch.setattr(workflow_engine, "log_job_activity", log_activity)
    monkeypatch.setattr(
        workflow_engine.WorkflowEngine,
        "_handle_business_rules",
        AsyncMock(),
    )
    return logs


def _assign_job(monkeypatch, job, *, assigned=True):
    monkeypatch.setattr(
        technician_jobs.job_logic,
        "get_job",
        AsyncMock(return_value=job),
    )
    monkeypatch.setattr(
        technician_jobs.assignment_logic,
        "get_assignment_for_technician_job",
        AsyncMock(
            return_value=(
                SimpleNamespace(job_id=job.id, technician_id=3)
                if assigned
                else None
            )
        ),
    )


@pytest.mark.asyncio
async def test_assigned_start_records_acceptance_then_departure(
    monkeypatch,
    start_service,
):
    job = _job(JobStatus.ASSIGNED)
    db = _FakeDb(job)
    _assign_job(monkeypatch, job)

    result = await technician_jobs.accept_and_start_technician_job(
        db,
        job_id=8,
        payload={"latitude": 33.57, "longitude": -7.59, "comment": "Départ"},
        current_user=_user(),
    )

    assert result.job.status == JobStatus.EN_ROUTE
    assert result.transitions == (
        (JobStatus.ASSIGNED, JobStatus.ACCEPTED),
        (JobStatus.ACCEPTED, JobStatus.EN_ROUTE),
    )
    assert job.accepted_at is not None
    assert job.started_at is not None
    assert job.accepted_at <= job.started_at
    assert job.started_by == 3
    assert (job.start_latitude, job.start_longitude) == (33.57, -7.59)
    assert [(log["old_status"], log["new_status"]) for log in start_service] == [
        ("assigned", "accepted"),
        ("accepted", "en_route"),
    ]
    assert [log["technician_id"] for log in start_service] == [3, 3]
    statement = db.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in compiled


@pytest.mark.asyncio
async def test_accepted_start_moves_only_to_en_route(monkeypatch, start_service):
    job = _job(JobStatus.ACCEPTED)
    job.accepted_at = datetime(2026, 8, 5, 8, 0, 0)
    db = _FakeDb(job)
    _assign_job(monkeypatch, job)

    result = await technician_jobs.accept_and_start_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=_user(),
    )

    assert result.transitions == ((JobStatus.ACCEPTED, JobStatus.EN_ROUTE),)
    assert job.status == JobStatus.EN_ROUTE
    assert len(start_service) == 1
    assert start_service[0]["old_status"] == "accepted"


@pytest.mark.asyncio
async def test_en_route_double_start_has_no_second_effect(
    monkeypatch,
    start_service,
):
    job = _job(JobStatus.EN_ROUTE)
    job.accepted_at = datetime(2026, 8, 5, 8, 0, 0)
    job.started_at = datetime(2026, 8, 5, 8, 1, 0)
    db = _FakeDb(job)
    _assign_job(monkeypatch, job)

    first = await technician_jobs.accept_and_start_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=_user(),
    )
    second = await technician_jobs.accept_and_start_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=_user(),
    )

    assert first.transitions == second.transitions == ()
    assert job.started_at == datetime(2026, 8, 5, 8, 1, 0)
    assert start_service == []


@pytest.mark.asyncio
async def test_other_technician_cannot_start_job(monkeypatch, start_service):
    job = _job(JobStatus.ASSIGNED)
    _assign_job(monkeypatch, job, assigned=False)

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_jobs.accept_and_start_technician_job(
            _FakeDb(job),
            job_id=8,
            payload={},
            current_user=_user(technician_id=4),
        )

    assert exc_info.value.code == "job_not_assigned"
    assert job.status == JobStatus.ASSIGNED
    assert start_service == []


@pytest.mark.asyncio
async def test_incompatible_status_is_refused(monkeypatch, start_service):
    job = _job(JobStatus.ON_SITE)
    _assign_job(monkeypatch, job)

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_jobs.accept_and_start_technician_job(
            _FakeDb(job),
            job_id=8,
            payload={},
            current_user=_user(),
        )

    assert exc_info.value.code == "invalid_job_status"
    assert job.status == JobStatus.ON_SITE
    assert start_service == []


@pytest.mark.asyncio
async def test_start_route_commits_once_and_returns_success(monkeypatch):
    job = _job(JobStatus.EN_ROUTE)
    db = _FakeDb()
    command = AsyncMock(
        return_value=TechnicianStartResult(
            job=job,
            transitions=(
                (JobStatus.ASSIGNED, JobStatus.ACCEPTED),
                (JobStatus.ACCEPTED, JobStatus.EN_ROUTE),
            ),
        )
    )
    monkeypatch.setattr(
        tech_jobs_routes,
        "accept_and_start_technician_job",
        command,
    )
    monkeypatch.setattr(
        tech_jobs_routes.JobResponse,
        "from_orm_with_assignment",
        classmethod(lambda cls, value: {"id": value.id, "status": value.status}),
    )
    monkeypatch.setattr(
        "backend.api.job_responses.hydrate_job_sector_identities",
        AsyncMock(side_effect=lambda _db, jobs: list(jobs)),
    )
    dashboard = SimpleNamespace(
        broadcast_job_event=AsyncMock(),
        broadcast_dashboard_update=AsyncMock(),
    )
    monkeypatch.setattr(
        tech_jobs_routes,
        "DashboardService",
        lambda _db: dashboard,
    )

    response = await tech_jobs_routes.start_job_mobile(
        job_id=8,
        transition=JobStatusTransition(
            new_status="en_route",
            latitude=33.57,
            longitude=-7.59,
        ),
        db=db,
        current_user=_user(),
    )

    assert response == {"id": 8, "status": JobStatus.EN_ROUTE}
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()
    dashboard.broadcast_job_event.assert_awaited_once()


def test_start_route_is_technician_scoped_not_orienteur():
    route = next(
        route
        for route in tech_jobs_routes.router.routes
        if route.path == "/{job_id}/start"
    )
    dependency_names = {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }
    assert "require_technician" in dependency_names
    assert "require_orienteur" not in dependency_names


@pytest.mark.asyncio
async def test_start_route_rolls_back_business_refusal(monkeypatch):
    db = _FakeDb()
    monkeypatch.setattr(
        tech_jobs_routes,
        "accept_and_start_technician_job",
        AsyncMock(
            side_effect=TechnicianJobMutationError(
                "rejected",
                "job_not_assigned",
                "Intervention non affectée",
            )
        ),
    )

    with pytest.raises(BusinessAPIError) as exc_info:
        await tech_jobs_routes.start_job_mobile(
            job_id=8,
            transition=JobStatusTransition(new_status="en_route"),
            db=db,
            current_user=_user(technician_id=4),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "job_not_assigned"
    db.rollback.assert_awaited_once()
    db.commit.assert_not_awaited()
