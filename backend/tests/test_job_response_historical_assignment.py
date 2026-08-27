from datetime import datetime, timezone
from types import SimpleNamespace

from backend.api.schemas.jobs import JobResponse
from backend.database.models import (
    Job,
    JobPriority,
    JobStatus,
    JobType,
)


def build_job():
    now = datetime(
        2026,
        8,
        20,
        8,
        0,
        tzinfo=timezone.utc,
    )

    job = Job(
        id=101,
        job_number="SYN-20260820-0001",
        job_type=JobType.INSTALLATION,
        status=JobStatus.COMPLETED,
        customer_name="Client Synthétique",
        service_address="Adresse synthétique",
        service_city="Casablanca",
        service_zip="20000",
        latitude=33.58,
        longitude=-7.60,
        required_skills=["install"],
        route_criteria="CAS-MAARIF",
        operator="IAM",
        priority=JobPriority.NORMALE,
        scheduled_date=now,
        time_slot_start="08:00",
        time_slot_end="10:00",
        estimated_duration=60,
        created_at=now,
        updated_at=now,
        completed_at=now,
        rejected_by_operator=False,
    )

    job.__dict__["assignment"] = None

    return job


def assignment(
    technician_id,
    technician_name,
    assigned_at,
):
    return SimpleNamespace(
        technician_id=technician_id,
        technician=SimpleNamespace(
            name=technician_name,
        ),
        assigned_at=assigned_at,
        estimated_arrival=None,
        actual_duration_minutes=55,
    )


def test_closed_job_uses_latest_historical_assignment():
    job = build_job()

    historical = assignment(
        7,
        "Technicien Historique",
        datetime(
            2026,
            8,
            20,
            7,
            45,
            tzinfo=timezone.utc,
        ),
    )

    job.__dict__["_response_assignment"] = historical

    response = JobResponse.from_orm_with_assignment(
        job,
    )

    assert response.assigned_tech_id == 7
    assert (
        response.assigned_tech_name
        == "Technicien Historique"
    )
    assert response.actual_duration_minutes == 55


def test_current_assignment_has_priority_over_history():
    job = build_job()

    current = assignment(
        8,
        "Technicien Courant",
        datetime(
            2026,
            8,
            20,
            8,
            0,
            tzinfo=timezone.utc,
        ),
    )

    historical = assignment(
        7,
        "Technicien Historique",
        datetime(
            2026,
            8,
            20,
            7,
            30,
            tzinfo=timezone.utc,
        ),
    )

    job.__dict__["assignment"] = current
    job.__dict__["_response_assignment"] = historical

    response = JobResponse.from_orm_with_assignment(
        job,
    )

    assert response.assigned_tech_id == 8
    assert (
        response.assigned_tech_name
        == "Technicien Courant"
    )
