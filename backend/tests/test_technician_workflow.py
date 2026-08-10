from datetime import date, datetime, timezone
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

# Some legacy route modules still import ``database`` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.routes import tech_jobs as tech_jobs_routes
from backend.api.errors import BusinessAPIError
from backend.api.schemas.jobs import JobPostponementCreate, JobStatusTransition
from backend.database.models import (
    JobFailure,
    JobPostponement,
    JobStatus,
    JobType,
    TechnicianLiveStatus,
)
from backend.logic import technician_jobs
from backend.logic.activity_log import log_job_activity
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.workflow import engine as workflow_engine


class _FakeDb:
    def __init__(self, job):
        self.job = job
        self.added = []
        self.flush = AsyncMock()

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.job)

    def add(self, value):
        self.added.append(value)


class _RouteDb(_FakeDb):
    def __init__(self, job):
        super().__init__(job)
        self.commit = AsyncMock()
        self.rollback = AsyncMock()
        self.refresh = AsyncMock()


def _user(technician_id=3):
    return SimpleNamespace(id=3, technician_id=technician_id)


def _job(status=JobStatus.ASSIGNED):
    return SimpleNamespace(
        id=8,
        status=status,
        job_type=JobType.INSTALLATION,
        customer_name="Client Test",
        job_number="DTLI-8",
        assigned_technician_name="Technicien Test",
        accepted_at=None,
        started_at=None,
        started_by=None,
        start_latitude=None,
        start_longitude=None,
        end_latitude=None,
        end_longitude=None,
        gps_latitude=None,
        gps_longitude=None,
        arrival_time=None,
        completed_at=None,
        updated_at=None,
        real_duration_minutes=None,
        failure_reason=None,
        assignment=SimpleNamespace(
            technician_id=3,
            actual_arrival=None,
        ),
    )


@pytest.fixture
def workflow(monkeypatch):
    logs = []

    async def log_activity(**kwargs):
        logs.append(kwargs)

    monkeypatch.setattr(workflow_engine, "log_job_activity", log_activity)
    monkeypatch.setattr(
        workflow_engine.WorkflowEngine,
        "_handle_business_rules",
        AsyncMock(),
    )
    monkeypatch.setattr(
        technician_jobs.WorkflowEngine,
        "can_complete",
        AsyncMock(return_value={"can_complete": True, "issues": []}),
    )
    return logs


def _assign(monkeypatch, *, assigned=True):
    monkeypatch.setattr(
        technician_jobs.assignment_logic,
        "get_assignment_for_technician_job",
        AsyncMock(
            return_value=(
                SimpleNamespace(job_id=8, technician_id=3)
                if assigned
                else None
            )
        ),
    )


async def _transition(db, status, user):
    return await technician_jobs.transition_technician_job(
        db,
        job_id=8,
        new_status=status,
        payload={},
        current_user=user,
    )


@pytest.mark.asyncio
async def test_complete_technician_workflow_uses_one_engine(
    monkeypatch,
    workflow,
):
    job = _job()
    db = _FakeDb(job)
    user = _user()
    _assign(monkeypatch)

    await technician_jobs.accept_and_start_technician_job(
        db,
        job_id=8,
        payload={"latitude": 33.57, "longitude": -7.59},
        current_user=user,
    )
    assert job.status == JobStatus.EN_ROUTE
    assert job.accepted_at and job.accepted_at.tzinfo == timezone.utc
    assert job.started_at and job.started_at.tzinfo == timezone.utc

    await technician_jobs.transition_technician_job(
        db,
        job_id=8,
        new_status=JobStatus.ON_SITE,
        payload={"latitude": 33.58, "longitude": -7.60},
        current_user=user,
    )
    assert job.status == JobStatus.ON_SITE
    assert job.arrival_time and job.arrival_time.tzinfo == timezone.utc
    assert job.assignment.actual_arrival == job.arrival_time
    assert (job.end_latitude, job.end_longitude) == (33.58, -7.60)

    await _transition(db, JobStatus.IN_PROGRESS, user)
    assert job.status == JobStatus.IN_PROGRESS
    await _transition(db, JobStatus.INSTALLATION_DONE, user)
    assert job.status == JobStatus.INSTALLATION_DONE
    await _transition(db, JobStatus.CLIENT_VALIDATION, user)
    assert job.status == JobStatus.CLIENT_VALIDATION

    await technician_jobs.terminate_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=user,
    )
    assert job.status == JobStatus.EN_ATTENTE_VALIDATION

    await workflow_engine.WorkflowEngine(db).transition_job(
        job,
        JobStatus.COMPLETED,
        technician_id=3,
        broadcast=False,
    )
    assert job.status == JobStatus.COMPLETED
    assert job.completed_at and job.completed_at.tzinfo == timezone.utc
    assert [item["new_status"] for item in workflow] == [
        "accepted",
        "en_route",
        "on_site",
        "in_progress",
        "installation_done",
        "client_validation",
        "en_attente_validation",
        "completed",
    ]


@pytest.mark.asyncio
async def test_workflow_gps_updates_live_quality_and_client_absent_releases_tech():
    tech = SimpleNamespace(
        id=3,
        live_status=TechnicianLiveStatus.EN_INTERVENTION,
        current_job_id=8,
        current_latitude=None,
        current_longitude=None,
        current_accuracy=None,
        last_location_update=None,
    )
    db = _FakeDb(tech)
    job = _job(JobStatus.ON_SITE)
    engine = workflow_engine.WorkflowEngine(db)

    await engine._update_technician_status(
        job,
        JobStatus.CLIENT_ABSENT,
        {"latitude": 33.5731, "longitude": -7.5898, "accuracy": 3.4},
    )

    assert tech.live_status == TechnicianLiveStatus.DISPONIBLE
    assert tech.current_job_id is None
    assert tech.current_latitude == 33.5731
    assert tech.current_longitude == -7.5898
    assert tech.current_accuracy == 3.4
    assert tech.last_location_update is not None
    assert tech.last_location_update.tzinfo == timezone.utc

    await engine._record_gps_position(
        job,
        {
            "latitude": 33.5731,
            "longitude": -7.5898,
            "accuracy": 3.4,
            "speed": 1.5,
            "heading": 90.0,
        },
    )
    point = db.added[-1]
    assert point.accuracy == 3.4
    assert point.speed == 1.5
    assert point.heading == 90.0
    assert point.recorded_at.tzinfo == timezone.utc


@pytest.mark.asyncio
async def test_close_from_in_progress_applies_audited_legal_chain(
    monkeypatch,
    workflow,
):
    job = _job(JobStatus.IN_PROGRESS)
    db = _FakeDb(job)
    _assign(monkeypatch)

    result = await technician_jobs.terminate_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=_user(),
    )

    assert result.status == JobStatus.EN_ATTENTE_VALIDATION
    assert [item["new_status"] for item in workflow] == [
        "installation_done",
        "client_validation",
        "en_attente_validation",
    ]

    again = await technician_jobs.terminate_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=_user(),
    )
    assert again.status == JobStatus.EN_ATTENTE_VALIDATION
    assert len(workflow) == 3


@pytest.mark.asyncio
async def test_close_refuses_incompatible_status_before_mutation(
    monkeypatch,
    workflow,
):
    job = _job(JobStatus.EN_ROUTE)
    db = _FakeDb(job)
    _assign(monkeypatch)

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_jobs.terminate_technician_job(
            db,
            job_id=8,
            payload={"comment": "must not be applied"},
            current_user=_user(),
        )

    assert exc_info.value.code == "invalid_job_status"
    assert job.status == JobStatus.EN_ROUTE
    assert workflow == []


@pytest.mark.asyncio
async def test_technician_http_commands_cover_the_full_field_chain(
    monkeypatch,
    workflow,
):
    job = _job()
    db = _RouteDb(job)
    user = _user()
    _assign(monkeypatch)
    monkeypatch.setattr(
        tech_jobs_routes.JobResponse,
        "from_orm_with_assignment",
        classmethod(lambda cls, value: value),
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

    await tech_jobs_routes.start_job_mobile(
        job_id=8,
        transition=JobStatusTransition(new_status="en_route"),
        db=db,
        current_user=user,
    )
    assert job.status == JobStatus.EN_ROUTE

    for target in (
        JobStatus.ON_SITE,
        JobStatus.IN_PROGRESS,
        JobStatus.INSTALLATION_DONE,
        JobStatus.CLIENT_VALIDATION,
    ):
        await tech_jobs_routes.update_job_mobile_status(
            job_id=8,
            transition=JobStatusTransition(new_status=target.value),
            db=db,
            current_user=user,
        )
        assert job.status == target

    await tech_jobs_routes.terminate_job_from_mobile(
        job_id=8,
        payload={},
        db=db,
        current_user=user,
    )
    assert job.status == JobStatus.EN_ATTENTE_VALIDATION
    assert db.commit.await_count == 6
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_arrival_is_idempotent_without_duplicate_history(
    monkeypatch,
    workflow,
):
    job = _job(JobStatus.EN_ROUTE)
    db = _FakeDb(job)
    _assign(monkeypatch)

    first = await technician_jobs.transition_technician_job(
        db,
        job_id=8,
        new_status=JobStatus.ON_SITE,
        payload={"latitude": 33.58, "longitude": -7.60},
        current_user=_user(),
    )
    arrived_at = job.arrival_time
    second = await technician_jobs.transition_technician_job(
        db,
        job_id=8,
        new_status=JobStatus.ON_SITE,
        payload={"latitude": 34.0, "longitude": -8.0},
        current_user=_user(),
    )

    assert first.transitions == ((JobStatus.EN_ROUTE, JobStatus.ON_SITE),)
    assert second.transitions == ()
    assert job.arrival_time == arrived_at
    assert (job.end_latitude, job.end_longitude) == (33.58, -7.60)
    assert len(workflow) == 1


@pytest.mark.asyncio
async def test_arrival_refuses_incompatible_status(monkeypatch, workflow):
    job = _job(JobStatus.ASSIGNED)
    _assign(monkeypatch)

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_jobs.transition_technician_job(
            _FakeDb(job),
            job_id=8,
            new_status=JobStatus.ON_SITE,
            payload={},
            current_user=_user(),
        )

    assert exc_info.value.code == "invalid_job_status"
    assert job.status == JobStatus.ASSIGNED
    assert workflow == []


@pytest.mark.asyncio
async def test_en_route_cannot_skip_arrival(monkeypatch, workflow):
    job = _job(JobStatus.EN_ROUTE)
    _assign(monkeypatch)

    with pytest.raises(TechnicianJobMutationError):
        await _transition(_FakeDb(job), JobStatus.IN_PROGRESS, _user())

    assert job.status == JobStatus.EN_ROUTE
    assert workflow == []


@pytest.mark.asyncio
async def test_other_technician_cannot_run_workflow_command(
    monkeypatch,
    workflow,
):
    job = _job(JobStatus.EN_ROUTE)
    _assign(monkeypatch, assigned=False)

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_jobs.transition_technician_job(
            _FakeDb(job),
            job_id=8,
            new_status=JobStatus.ON_SITE,
            payload={},
            current_user=_user(technician_id=4),
        )

    assert exc_info.value.code == "job_not_assigned"
    assert job.status == JobStatus.EN_ROUTE
    assert workflow == []


@pytest.mark.asyncio
async def test_other_technician_receives_http_403(monkeypatch):
    db = _RouteDb(_job(JobStatus.EN_ROUTE))
    monkeypatch.setattr(
        tech_jobs_routes,
        "transition_technician_job",
        AsyncMock(
            side_effect=TechnicianJobMutationError(
                "rejected",
                "job_not_assigned",
                "Intervention non affectée",
            )
        ),
    )

    with pytest.raises(BusinessAPIError) as exc_info:
        await tech_jobs_routes.update_job_mobile_status(
            job_id=8,
            transition=JobStatusTransition(new_status="on_site"),
            db=db,
            current_user=_user(technician_id=4),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "job_not_assigned"
    db.rollback.assert_awaited_once()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_failure_uses_engine_and_is_idempotent(monkeypatch, workflow):
    job = _job(JobStatus.ON_SITE)
    db = _FakeDb(job)
    _assign(monkeypatch)
    payload = {
        "reason": "Accès impossible",
        "comment": "Portail fermé",
        "latitude": 33.58,
        "longitude": -7.60,
    }

    first = await technician_jobs.fail_technician_job(
        db,
        job_id=8,
        payload=payload,
        current_user=_user(),
    )
    second = await technician_jobs.fail_technician_job(
        db,
        job_id=8,
        payload=payload,
        current_user=_user(),
    )

    assert first.transitions == ((JobStatus.ON_SITE, JobStatus.FAILED),)
    assert second.transitions == ()
    assert job.status == JobStatus.FAILED
    assert job.failure_reason == "Accès impossible"
    assert len([item for item in db.added if isinstance(item, JobFailure)]) == 1
    assert len(workflow) == 1


@pytest.mark.asyncio
async def test_postpone_accepts_flutter_date_and_uses_engine(
    monkeypatch,
    workflow,
):
    request = JobPostponementCreate.model_validate(
        {
            "reason": "Client indisponible",
            "requested_date": "2026-08-07",
        }
    )
    assert request.requested_date == date(2026, 8, 7)

    job = _job(JobStatus.EN_ROUTE)
    db = _FakeDb(job)
    _assign(monkeypatch)
    result = await technician_jobs.postpone_technician_job(
        db,
        job_id=8,
        payload=request.model_dump(),
        current_user=_user(),
    )

    postponement = next(
        item for item in db.added if isinstance(item, JobPostponement)
    )
    assert result.transitions == ((JobStatus.EN_ROUTE, JobStatus.POSTPONED),)
    assert job.status == JobStatus.POSTPONED
    assert postponement.requested_date == datetime(
        2026,
        8,
        7,
        tzinfo=timezone.utc,
    )
    assert len(workflow) == 1


@pytest.mark.asyncio
async def test_activity_log_timestamp_is_utc():
    db = _FakeDb(None)

    entry = await log_job_activity(
        db,
        job_id=8,
        action="on_site",
        technician_id=3,
    )

    assert entry.created_at.tzinfo == timezone.utc
    assert db.added == [entry]
