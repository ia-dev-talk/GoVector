from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from backend.api.routes import settings
from backend.api.schemas.jobs import JobCreate
from backend.database.models import JobType
from backend.logic import jobs as job_logic
from backend.logic import technicians as technician_logic
from backend.logic.job_planning import (
    canonical_estimated_duration_minutes,
    default_estimated_duration_minutes,
    job_estimated_duration_minutes,
)


def test_raccordement_has_one_canonical_default_duration():
    assert default_estimated_duration_minutes(JobType.RACCORDEMENT) == 120
    assert default_estimated_duration_minutes("RACCORDEMENT") == 120


def test_raccordement_contract_uses_the_proving_two_hour_slot():
    assert canonical_estimated_duration_minutes(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=60,
        time_slot_start="08:00",
        time_slot_end="10:00",
    ) == 120
    assert canonical_estimated_duration_minutes(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=75,
        time_slot_start="08:00",
        time_slot_end="10:00",
    ) == 75


def test_legacy_projection_is_narrow_and_keeps_other_explicit_estimates():
    assert canonical_estimated_duration_minutes(
        job_type=JobType.INSTALLATION,
        estimated_duration=60,
        time_slot_start="08:00",
        time_slot_end="09:30",
    ) == 60


def test_operational_duration_wrapper_projects_the_same_legacy_contract():
    job = SimpleNamespace(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=60,
        time_slot_start="08:00",
        time_slot_end="10:00",
    )

    assert job_estimated_duration_minutes(job) == 120


def test_capacity_check_uses_the_canonical_legacy_duration():
    job = SimpleNamespace(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=60,
        time_slot_start="08:00",
        time_slot_end="10:00",
        required_skills=[],
        route_criteria=None,
        latitude=None,
        longitude=None,
    )
    technician = SimpleNamespace(
        skills=[],
        assigned_routes=[],
        shift_start="08:00",
        shift_end="09:30",
        assignments=[],
        current_latitude=None,
        current_longitude=None,
        home_latitude=None,
        home_longitude=None,
    )

    result = job_logic.can_technician_do_job(job, technician)

    assert result["has_time"] is False


@pytest.mark.asyncio
async def test_workload_uses_the_same_canonical_legacy_duration():
    job = SimpleNamespace(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=60,
        time_slot_start="08:00",
        time_slot_end="10:00",
    )
    technician = SimpleNamespace(
        id=3,
        name="Karim Tazi",
        max_jobs_per_day=8,
        status="AVAILABLE",
    )
    scalar_result = Mock()
    scalar_result.scalars.return_value.all.return_value = [
        SimpleNamespace(job=job),
    ]
    db = SimpleNamespace(execute=AsyncMock(return_value=scalar_result))

    with patch(
        "backend.logic.technicians.get_technician",
        AsyncMock(return_value=technician),
    ):
        workload = await technician_logic.get_technician_workload(db, 3)

    assert workload["total_estimated_hours"] == 2.0


def test_job_create_applies_type_default_only_when_estimate_is_omitted():
    defaulted = JobCreate(job_type=JobType.RACCORDEMENT)
    overridden = JobCreate(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=75,
    )

    assert defaulted.estimated_duration == 120
    assert overridden.estimated_duration == 75


def test_job_create_normalizes_the_observed_inconsistent_combination_on_write():
    payload = JobCreate(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=60,
        time_slot_start="08:00",
        time_slot_end="10:00",
    )

    assert payload.estimated_duration == 120


@pytest.mark.asyncio
async def test_business_logic_applies_the_same_default_for_non_http_callers():
    db = SimpleNamespace(
        add=Mock(),
        flush=AsyncMock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    with (
        patch(
            "backend.logic.jobs.resolve_sector_for_write",
            AsyncMock(return_value=None),
        ),
        patch(
            "backend.logic.jobs.find_existing_site_for_job",
            AsyncMock(return_value=None),
        ),
    ):
        job = await job_logic.create_job(
            db=db,
            customer_name="Client QA",
            service_address="Sidi Maârouf",
            latitude=None,
            longitude=None,
            job_type=JobType.RACCORDEMENT,
            required_skills=[],
        )

    assert job.estimated_duration == 120


@pytest.mark.asyncio
async def test_business_logic_normalizes_raccordement_duration_on_update():
    job = SimpleNamespace(
        job_type=JobType.RACCORDEMENT,
        estimated_duration=75,
        time_slot_start="08:00",
        time_slot_end="10:00",
        updated_at=None,
    )
    db = SimpleNamespace(
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )

    with patch(
        "backend.logic.jobs.get_job",
        AsyncMock(return_value=job),
    ):
        updated = await job_logic.update_job(
            db,
            31,
            estimated_duration=60,
        )

    assert updated.estimated_duration == 120


def test_business_catalog_exposes_the_canonical_duration_to_clients():
    raccordement = next(
        item
        for item in settings._catalog_defaults().job_types
        if item.code == JobType.RACCORDEMENT.value
    )

    assert raccordement.metadata["default_estimated_duration_minutes"] == 120


def test_catalog_response_repairs_runtime_metadata_without_rewriting_document():
    stored_values = settings._catalog_defaults()
    stored_raccordement = next(
        item
        for item in stored_values.job_types
        if item.code == JobType.RACCORDEMENT.value
    )
    stored_raccordement.metadata = {}
    document = SimpleNamespace(
        namespace="business_catalog",
        schema_version=2,
        revision=4,
        values=stored_values.model_dump(mode="json"),
        updated_by=7,
        created_at=None,
        updated_at=None,
    )

    response = settings._catalog_response(document)
    runtime_raccordement = next(
        item
        for item in response.values.job_types
        if item.code == JobType.RACCORDEMENT.value
    )

    assert stored_raccordement.metadata == {}
    assert runtime_raccordement.metadata["default_estimated_duration_minutes"] == 120
