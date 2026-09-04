from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.api.errors import BusinessAPIError, install_business_error_handler
from backend.api.routes.orienteur_agent import router
from backend.api.schemas.settings import OrienteurObservationPolicy
from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models import JobStatus, UserRole
from backend.services.orienteur_assessment import assess_facts, assess_job

NOW = datetime(2026, 9, 4, 12, tzinfo=timezone.utc)


def job(status=JobStatus.PENDING, **changes):
    values = dict(id=1, status=status, updated_at=NOW, deleted_at=None,
                  sector_id=2, scheduled_date=None, orienteur_id=7)
    return SimpleNamespace(**(values | changes))


def assessment(target, **changes):
    values = dict(job=target, assignment=None, visit=None, commands=[],
                  material={"movement_count": 3, "unlinked_visit_count": 1}, now=NOW)
    return assess_facts(**(values | changes))


@pytest.mark.parametrize("status", list(JobStatus))
def test_every_lifecycle_is_observation_only(status):
    result = assessment(job(status))
    assert result["execution_enabled"] is False
    assert result["mode"] == "SIMULATION_ONLY"
    assert result["approval_required"] is True
    assert result["lifecycle"]["code"] == status.value
    assert result["allowed_commands"] == []


def test_closed_order_is_not_reported_overdue_or_reopened():
    result = assessment(job(JobStatus.COMPLETED, sector_id=None, scheduled_date=NOW - timedelta(days=1)))
    assert {item["code"] for item in result["findings"]} == {"material_without_visit"}
    assert "fermé" in result["next_step"]


def test_active_passage_requires_consistent_assignment_and_visit():
    target = job(JobStatus.ASSIGNED)
    assert assessment(target)["assessment_status"] == "BLOCKED"
    visit = SimpleNamespace(id=8, primary_technician_id=2, status="ASSIGNED", attempt_number=1)
    assignment = SimpleNamespace(id=3, technician_id=2, visit_id=9)
    assert assessment(target, assignment=assignment, visit=visit)["assessment_status"] == "BLOCKED"
    assignment.visit_id = 8
    assert assessment(target, assignment=assignment, visit=visit)["assessment_status"] == "REVIEW"


def test_observation_personalization_has_real_effect_without_enabling_execution():
    target = job(sector_id=None, scheduled_date=NOW - timedelta(minutes=20))
    default_codes = {item["code"] for item in assessment(target)["findings"]}
    assert "missing_sector" in default_codes and "elapsed_appointment" not in default_codes
    result = assessment(target, policy=OrienteurObservationPolicy(
        appointment_grace_minutes=10, flag_missing_sector=False), policy_revision=12)
    codes = {item["code"] for item in result["findings"]}
    assert "missing_sector" not in codes and "elapsed_appointment" in codes
    assert result["policy_revision"] == 12
    assert result["execution_enabled"] is False


def test_naive_datetime_is_not_silently_assumed_utc():
    result = assessment(job(scheduled_date=NOW.replace(tzinfo=None)))
    assert "schedule_timezone_unknown" in {item["code"] for item in result["findings"]}


@pytest.mark.parametrize("values", [{"appointment_grace_minutes": -1},
    {"appointment_grace_minutes": 1441}, {"appointment_grace_minutes": True},
    {"execution_enabled": True}])
def test_policy_rejects_invalid_values_and_execution_switch(values):
    with pytest.raises(ValidationError):
        OrienteurObservationPolicy(**values)


@pytest.mark.asyncio
@pytest.mark.parametrize("owner", [None, 8])
async def test_foreign_or_unlinked_orienteur_cannot_read_related_facts(owner):
    db = AsyncMock()
    db.get.return_value = job()
    with pytest.raises(BusinessAPIError) as error:
        await assess_job(db, job_id=1, current_user=SimpleNamespace(role=UserRole.ORIENTEUR, orienteur_id=owner))
    assert error.value.status_code == 403
    db.execute.assert_not_called()
    db.scalar.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.parametrize("role", [UserRole.CLIENT, UserRole.TECHNICIAN, UserRole.COORDINATEUR])
def test_http_roles_denied_before_database_access(role):
    app = FastAPI()
    app.include_router(router)
    install_business_error_handler(app)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role=role)
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    response = TestClient(app).get('/orienteur-agent/jobs/1/assessment')
    assert response.status_code == 403
    db.get.assert_not_called()


def test_http_response_and_missing_job():
    app = FastAPI()
    app.include_router(router)
    db = AsyncMock()
    db.get.return_value = None
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role=UserRole.ADMIN)
    client = TestClient(app)
    assert client.get('/orienteur-agent/jobs/1/assessment').status_code == 404
    assert client.get('/orienteur-agent/jobs/0/assessment').status_code == 422
