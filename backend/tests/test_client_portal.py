from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.api.routes import client_portal
from backend.database.models import JobStatus


def _job(*, organization_id=7, status=JobStatus.IN_PROGRESS, age_minutes=2, current_job_id=44):
    now = datetime.now(timezone.utc)
    technician = SimpleNamespace(
        name="Technicien terrain",
        current_job_id=current_job_id,
        current_latitude=33.57,
        current_longitude=-7.59,
        last_location_update=now - timedelta(minutes=age_minutes),
        phone="private",
        home_address="private",
        current_battery=80,
    )
    return SimpleNamespace(
        id=44,
        client_organization_id=organization_id,
        job_number="CLIENT-44",
        customer_name="Site client",
        service_address="Adresse",
        service_city="Casablanca",
        status=status,
        latitude=33.58,
        longitude=-7.60,
        planned_location_source="office_confirmed",
        planned_location_precision="rooftop",
        assignment=SimpleNamespace(technician=technician),
    ), now


def test_client_kpis_use_canonical_order_and_field_axes():
    kpis = client_portal._kpis_from_counts(
        {
            JobStatus.IN_PROGRESS.value: 2,
            JobStatus.EN_ATTENTE_VALIDATION.value: 3,
            JobStatus.FAILED.value: 1,
            JobStatus.COMPLETED.value: 4,
            JobStatus.CANCELLED.value: 1,
        }
    )

    assert kpis["total"] == 11
    assert kpis["open"] == 6
    assert kpis["field_active"] == 2
    assert kpis["awaiting_validation"] == 3
    assert kpis["interrupted"] == 1
    assert kpis["completed"] == 4


def test_client_live_marker_only_exposes_minimal_fresh_current_operation():
    job, now = _job()
    marker = client_portal._live_operation(job, now=now, stale_after_minutes=30)

    assert marker is not None
    assert marker["job_id"] == 44
    assert marker["technician"] == {"display_name": "Technicien terrain"}
    assert "phone" not in marker["technician"]
    assert "home_address" not in marker["technician"]
    assert "battery" not in marker


def test_client_live_marker_rejects_stale_wrong_job_and_inactive_field_status():
    stale_job, now = _job(age_minutes=31)
    assert client_portal._live_operation(stale_job, now=now, stale_after_minutes=30) is None

    wrong_job, now = _job(current_job_id=999)
    assert client_portal._live_operation(wrong_job, now=now, stale_after_minutes=30) is None

    completed, now = _job(status=JobStatus.COMPLETED)
    assert client_portal._live_operation(completed, now=now, stale_after_minutes=30) is None

    active, now = _job()
    assert client_portal._live_operation(active, now=now, stale_after_minutes=None) is None


def test_planned_marker_keeps_real_zero_coordinates_and_rejects_invalid_values():
    job, _ = _job()
    job.latitude = 0
    job.longitude = 0
    assert client_portal._planned_marker(job)["latitude"] == 0

    job.latitude = None
    assert client_portal._planned_marker(job) is None
