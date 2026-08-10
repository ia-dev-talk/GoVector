from contextlib import AbstractAsyncContextManager
from datetime import datetime, timezone
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

# Some legacy route modules still import ``database`` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.routes import tech_sync as tech_sync_routes
from backend.api.schemas.tech_sync import (
    TechnicianSyncBatchRequest,
    TechnicianSyncEventRequest,
    TechnicianSyncEventResult,
)
from backend.database.models import JobStatus, UserRole
from backend.logic import technician_jobs, technician_sync
from backend.logic.technician_jobs import TechnicianJobMutationError


class _NestedTransaction(AbstractAsyncContextManager):
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        self.snapshot = dict(self.db.receipts)
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        if exc_type is not None:
            self.db.receipts = self.snapshot
        return False


class _FakeDb:
    def __init__(self):
        self.receipts = {}
        self.commit = AsyncMock()

    def begin_nested(self):
        return _NestedTransaction(self)

    def add(self, receipt):
        self.receipts[(receipt.technician_id, receipt.event_id)] = receipt

    async def flush(self):
        return None

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: None)


def _user(technician_id=3):
    return SimpleNamespace(
        id=3,
        role=UserRole.TECHNICIAN,
        technician_id=technician_id,
    )


def _event(event_type="complete_job", *, event_id=None, job_id=8, payload=None):
    return TechnicianSyncEventRequest(
        event_id=event_id or uuid4(),
        schema_version=1,
        job_id=job_id,
        type=event_type,
        occurred_at=datetime.now(timezone.utc),
        payload=payload or {},
    )


@pytest.fixture
def fake_receipt_lookup(monkeypatch):
    async def find(db, *, technician_id, event_id):
        return db.receipts.get((technician_id, event_id))

    monkeypatch.setattr(technician_sync, "_find_receipt", find)


@pytest.mark.asyncio
async def test_assigned_technician_complete_event_is_acknowledged(
    monkeypatch,
    fake_receipt_lookup,
):
    db = _FakeDb()
    terminate = AsyncMock()
    monkeypatch.setattr(technician_sync, "terminate_technician_job", terminate)
    event = _event(payload={"wifi_box_serial": "ONT-42"})

    result = await technician_sync.process_technician_sync_event(
        db,
        event=event,
        current_user=_user(),
    )

    assert result.status == "acknowledged"
    terminate.assert_awaited_once_with(
        db,
        job_id=8,
        payload={"wifi_box_serial": "ONT-42"},
        current_user=ANY,
    )


@pytest.mark.asyncio
async def test_complete_event_without_optional_evidence_is_acknowledged(
    monkeypatch,
    fake_receipt_lookup,
):
    db = _FakeDb()
    job = SimpleNamespace(
        id=8,
        status=JobStatus.CLIENT_VALIDATION,
        job_type=SimpleNamespace(value="RACCORDEMENT"),
        operator="Orange",
        assignment=SimpleNamespace(technician_id=3),
    )
    monkeypatch.setattr(
        technician_jobs,
        "require_assigned_job",
        AsyncMock(return_value=job),
    )

    async def transition(current_job, new_status, **_kwargs):
        current_job.status = new_status

    monkeypatch.setattr(
        technician_jobs.WorkflowEngine,
        "transition_job",
        AsyncMock(side_effect=transition),
    )

    result = await technician_sync.process_technician_sync_event(
        db,
        event=_event(payload={}),
        current_user=_user(),
    )

    assert result.status == "acknowledged"
    assert job.status == JobStatus.EN_ATTENTE_VALIDATION


@pytest.mark.asyncio
async def test_unassigned_job_is_individually_rejected(
    monkeypatch,
    fake_receipt_lookup,
):
    db = _FakeDb()
    terminate = AsyncMock(
        side_effect=TechnicianJobMutationError(
            "rejected",
            "job_not_assigned",
            "not assigned",
        )
    )
    monkeypatch.setattr(technician_sync, "terminate_technician_job", terminate)

    result = await technician_sync.process_technician_sync_event(
        db,
        event=_event(job_id=99),
        current_user=_user(),
    )

    assert result.status == "rejected"
    assert result.code == "job_not_assigned"


@pytest.mark.asyncio
async def test_same_event_id_applies_business_effect_once(
    monkeypatch,
    fake_receipt_lookup,
):
    db = _FakeDb()
    terminate = AsyncMock()
    monkeypatch.setattr(technician_sync, "terminate_technician_job", terminate)
    event = _event()

    first = await technician_sync.process_technician_sync_event(
        db,
        event=event,
        current_user=_user(),
    )
    second = await technician_sync.process_technician_sync_event(
        db,
        event=event,
        current_user=_user(),
    )

    assert first.status == second.status == "acknowledged"
    assert terminate.await_count == 1


@pytest.mark.asyncio
async def test_previously_unsupported_receipt_is_retried_after_handler_exists(
    monkeypatch,
    fake_receipt_lookup,
):
    db = _FakeDb()
    event = _event(
        "equipment_scan",
        payload={"code": "ONT-42"},
    )
    request_hash = technician_sync._request_hash(event)
    receipt = SimpleNamespace(
        event_id=str(event.event_id),
        request_hash=request_hash,
        status="rejected",
        code="unsupported_action",
        error="unsupported",
        updated_at=None,
        processed_at=None,
    )
    db.receipts[(3, str(event.event_id))] = receipt
    record = AsyncMock()
    monkeypatch.setattr(
        technician_sync,
        "record_technician_field_action",
        record,
    )

    result = await technician_sync.process_technician_sync_event(
        db,
        event=event,
        current_user=_user(),
    )

    assert result.status == "acknowledged"
    record.assert_awaited_once()


@pytest.mark.asyncio
async def test_mixed_batch_returns_individual_results(monkeypatch):
    db = _FakeDb()
    events = [_event("complete_job"), _event("intervention_video")]

    async def process(_db, *, event, current_user):
        status = "acknowledged" if event.type == "complete_job" else "rejected"
        return TechnicianSyncEventResult(
            event_id=event.event_id,
            status=status,
            code=None if status == "acknowledged" else "unsupported_action",
        )

    monkeypatch.setattr(tech_sync_routes, "process_technician_sync_event", process)
    response = await tech_sync_routes.sync_technician_events(
        TechnicianSyncBatchRequest(events=events),
        db=db,
        current_user=_user(),
    )

    assert [item.status for item in response.results] == [
        "acknowledged",
        "rejected",
    ]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_termination_service_enforces_assignment_and_technician_rules(
    monkeypatch,
):
    job = SimpleNamespace(
        id=8,
        status=JobStatus.IN_PROGRESS,
        updated_at=None,
        gps_latitude=None,
        gps_longitude=None,
    )
    technician = SimpleNamespace(live_status=None, current_job_id=8)
    db = SimpleNamespace(
        execute=AsyncMock(
            return_value=SimpleNamespace(
                scalar_one_or_none=lambda: technician,
            )
        ),
        flush=AsyncMock(),
    )
    require_job = AsyncMock(return_value=job)
    monkeypatch.setattr(
        technician_jobs,
        "require_assigned_job",
        require_job,
    )
    monkeypatch.setattr(
        technician_jobs.WorkflowEngine,
        "can_complete",
        AsyncMock(return_value={"can_complete": True, "issues": []}),
    )
    async def transition(current_job, new_status, **_kwargs):
        current_job.status = new_status
        return current_job

    engine_transition = AsyncMock(side_effect=transition)
    monkeypatch.setattr(
        technician_jobs.WorkflowEngine,
        "transition_job",
        engine_transition,
    )

    result = await technician_jobs.terminate_technician_job(
        db,
        job_id=8,
        payload={"gps_latitude": 33.5, "gps_longitude": -7.6},
        current_user=_user(),
    )

    assert result.status == JobStatus.EN_ATTENTE_VALIDATION
    require_job.assert_awaited_once_with(
        db,
        job_id=8,
        current_user=_user(),
        lock=True,
    )
    assert [
        call.args[1] for call in engine_transition.await_args_list
    ] == [
        JobStatus.INSTALLATION_DONE,
        JobStatus.CLIENT_VALIDATION,
        JobStatus.EN_ATTENTE_VALIDATION,
    ]
    db.flush.assert_awaited_once()


def test_unsupported_action_is_not_mistaken_for_synchronized():
    error = TechnicianJobMutationError(
        "rejected",
        "unsupported_action",
        "unsupported",
    )
    assert error.status == "rejected"
    assert error.code == "unsupported_action"


def test_malformed_event_has_clear_schema_validation():
    with pytest.raises(ValidationError) as exc_info:
        TechnicianSyncBatchRequest.model_validate(
            {
                "events": [
                    {
                        "event_id": "not-a-uuid",
                        "schema_version": 2,
                        "job_id": 0,
                        "type": "complete_job",
                        "occurred_at": "not-a-date",
                        "payload": {},
                    }
                ]
            }
        )

    fields = {error["loc"][-1] for error in exc_info.value.errors()}
    assert {"event_id", "schema_version", "job_id", "occurred_at"} <= fields


def test_sync_route_is_technician_scoped_and_not_orienteur_complete():
    route = next(route for route in tech_sync_routes.router.routes if route.path == "/sync")
    dependency_names = {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }
    assert "require_technician" in dependency_names
    assert "require_orienteur" not in dependency_names
