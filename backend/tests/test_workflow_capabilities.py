from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.errors import BusinessAPIError, install_business_error_handler
from backend.api.routes.tech_jobs import _mutation_http_exception
from backend.database.models import JobStatus, UserRole
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.completion_policy import CompletionPolicy
from backend.logic.workflow import capabilities


EXPECTED_AXES = {
    JobStatus.PENDING: (True, False),
    JobStatus.ASSIGNED: (True, True),
    JobStatus.ACCEPTED: (True, True),
    JobStatus.EN_ROUTE: (True, True),
    JobStatus.ON_SITE: (True, True),
    JobStatus.IN_PROGRESS: (True, True),
    JobStatus.WORK_IN_PROGRESS: (True, True),
    JobStatus.INSTALLATION_DONE: (True, True),
    JobStatus.CLIENT_VALIDATION: (True, True),
    JobStatus.EN_ATTENTE_VALIDATION: (True, False),
    JobStatus.COMPLETED: (False, False),
    JobStatus.CANCELLED: (False, False),
    JobStatus.FAILED: (True, False),
    JobStatus.CLIENT_ABSENT: (True, False),
    JobStatus.POSTPONED: (True, False),
    JobStatus.ON_HOLD: (True, False),
    JobStatus.SUSPENDED: (True, False),
}


def test_every_job_status_has_canonical_metadata_and_two_axes():
    assert set(capabilities.STATUS_METADATA) == set(JobStatus)
    assert set(EXPECTED_AXES) == set(JobStatus)
    for status, (order_open, field_active) in EXPECTED_AXES.items():
        item = capabilities.status_capability(status)
        assert item["code"] == status.value
        assert item["label"]
        assert item["order_open"] is order_open
        assert item["field_active"] is field_active
        assert item["category"]


def test_work_in_progress_is_an_explicit_compatibility_alias():
    item = capabilities.status_capability(JobStatus.WORK_IN_PROGRESS)
    assert item["canonical"] == JobStatus.IN_PROGRESS.value


def test_zero_coordinates_and_zero_measure_are_known_values():
    job = SimpleNamespace(
        client_signature=None,
        cable_length_m=None,
        optical_power_dbm=0.0,
        ont_serial=None,
        router_serial=None,
        mac_address=None,
        coordinator_comments=None,
        notes=None,
        nro_id=None,
        nro_raw=None,
        sro_id=None,
        sro_raw=None,
        pbo_id=None,
        pbo_raw=None,
        pto_id=None,
        pto_raw=None,
        gps_latitude=0.0,
        gps_longitude=0.0,
        before_photo=None,
        after_photo=None,
    )
    missing = CompletionPolicy._missing_evidence(job)
    assert "optical_power_dbm" not in missing
    assert "gps" not in missing


def test_command_catalog_has_unique_codes_and_declared_roles():
    codes = [item["code"] for item in capabilities.COMMAND_DEFINITIONS]
    assert len(codes) == len(set(codes))
    assert set(codes) == {
        "accept_and_start",
        "arrive",
        "start_work",
        "close_field_visit",
        "fail",
        "postpone",
        "validate",
        "reassign",
    }
    assert all(item["roles"] for item in capabilities.COMMAND_DEFINITIONS)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "primary"),
    [
        (JobStatus.ASSIGNED, "accept_and_start"),
        (JobStatus.ACCEPTED, "accept_and_start"),
        (JobStatus.EN_ROUTE, "arrive"),
        (JobStatus.ON_SITE, "start_work"),
        (JobStatus.IN_PROGRESS, "close_field_visit"),
        (JobStatus.WORK_IN_PROGRESS, "close_field_visit"),
        (JobStatus.INSTALLATION_DONE, "close_field_visit"),
        (JobStatus.CLIENT_VALIDATION, "close_field_visit"),
    ],
)
async def test_assigned_technician_gets_server_driven_primary_command(
    monkeypatch,
    status,
    primary,
):
    monkeypatch.setattr(
        capabilities.assignment_logic,
        "get_assignment_for_technician_job",
        AsyncMock(return_value=object()),
    )
    user = SimpleNamespace(role=UserRole.TECHNICIAN, technician_id=7)
    job = SimpleNamespace(id=41, status=status)
    allowed = await capabilities.allowed_commands_for_job(
        AsyncMock(), job=job, current_user=user
    )
    assert primary in allowed


@pytest.mark.asyncio
async def test_unassigned_technician_gets_no_job_commands(monkeypatch):
    monkeypatch.setattr(
        capabilities.assignment_logic,
        "get_assignment_for_technician_job",
        AsyncMock(return_value=None),
    )
    user = SimpleNamespace(role=UserRole.TECHNICIAN, technician_id=8)
    job = SimpleNamespace(id=41, status=JobStatus.EN_ROUTE)
    assert await capabilities.allowed_commands_for_job(
        AsyncMock(), job=job, current_user=user
    ) == []


@pytest.mark.asyncio
async def test_orienteur_validation_and_reassignment_commands():
    user = SimpleNamespace(role=UserRole.ORIENTEUR, technician_id=None)
    job = SimpleNamespace(id=41, status=JobStatus.EN_ATTENTE_VALIDATION)
    allowed = await capabilities.allowed_commands_for_job(
        AsyncMock(), job=job, current_user=user
    )
    assert allowed == ["validate", "reassign"]


def test_business_error_has_stable_top_level_shape():
    app = FastAPI()
    install_business_error_handler(app)

    @app.get("/failure")
    async def failure():
        raise BusinessAPIError(
            409,
            "revision_conflict",
            "Version obsolète",
            {"revision": 4},
        )

    response = TestClient(app).get("/failure")
    assert response.status_code == 409
    assert response.json() == {
        "code": "revision_conflict",
        "message": "Version obsolète",
        "details": {"revision": 4},
    }


def test_technician_transition_error_is_canonical_at_http_boundary():
    error = _mutation_http_exception(
        TechnicianJobMutationError(
            "conflict",
            "invalid_job_status",
            "Transition impossible",
        )
    )
    assert isinstance(error, BusinessAPIError)
    assert error.status_code == 409
    assert error.code == "invalid_transition"
