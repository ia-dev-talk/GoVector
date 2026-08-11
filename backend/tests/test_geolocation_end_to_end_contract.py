"""End-to-end service contract for BlueVector field geolocation.

The test intentionally crosses the live-supervision, field-action and office
field-record boundaries.  It protects the core invariant that a phone fix is
not a planned job coordinate and that technician-confirmed landmarks remain
attributed, append-only evidence.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from backend.api.routes import job_context, supervision
from backend.api.schemas.technicians import GPSLiveUpdate
from backend.database.models import (
    GPSHistory,
    JobSiteObservation,
    TechnicianFieldAction,
    TechnicianLiveStatus,
    UserRole,
)
from backend.logic import technician_field_actions


class _ScalarResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return list(self.values)

    def scalar_one_or_none(self):
        return self.values[0] if self.values else None


class _LiveGpsDb:
    def __init__(self, technician):
        self.technician = technician
        self.added = []
        self.commit = AsyncMock()

    async def execute(self, _statement):
        return _ScalarResult([self.technician])

    def add(self, value):
        self.added.append(value)


class _FieldActionDb:
    def __init__(self):
        self.added = []
        self.flush = AsyncMock()

    async def scalar(self, _statement):
        # No persisted business catalog in this contract fixture. The service
        # therefore uses the complete supported action set, as production does
        # before an administrator customizes the catalog.
        return None

    def add(self, value):
        if isinstance(value, TechnicianFieldAction):
            value.id = len(self.added) + 1
        if isinstance(value, JobSiteObservation):
            value.id = len(self.added) + 1
        self.added.append(value)


class _FieldRecordDb:
    def __init__(self, result_sets):
        self.result_sets = list(result_sets)

    async def execute(self, _statement):
        return _ScalarResult(self.result_sets.pop(0))


def _technician_user():
    return SimpleNamespace(
        id=3,
        username="karim",
        role=UserRole.TECHNICIAN,
        technician_id=3,
        orienteur_id=None,
        client_organization_id=None,
    )


@pytest.mark.asyncio
async def test_address_live_gps_and_confirmed_landmarks_remain_distinct(monkeypatch):
    observed_at = datetime(2026, 8, 10, 9, 30, tzinfo=timezone.utc)
    job = SimpleNamespace(
        id=8,
        service_address="Hay Hassani, Casablanca",
        service_city="Casablanca",
        service_zip=None,
        latitude=None,
        longitude=None,
        planned_location_source=None,
        planned_location_precision=None,
        special_instructions="Accès par la cour arrière",
        coordinator_comments=None,
        notes=None,
    )
    user = _technician_user()
    technician = SimpleNamespace(
        id=3,
        name="Karim Tazi",
        live_status=TechnicianLiveStatus.EN_INTERVENTION,
        current_latitude=None,
        current_longitude=None,
        current_speed=None,
        current_heading=None,
        current_accuracy=None,
        current_battery=None,
        current_job_id=None,
        last_location_update=None,
    )

    access_check = AsyncMock(return_value=job)
    monkeypatch.setattr(supervision, "require_job_read_access_by_id", access_check)
    monkeypatch.setattr(supervision.ws_manager, "broadcast", AsyncMock())
    live_db = _LiveGpsDb(technician)

    response = await supervision.update_technician_gps(
        GPSLiveUpdate(
            job_id=job.id,
            latitude=33.5731,
            longitude=-7.5898,
            accuracy=4.5,
            observed_at=observed_at,
        ),
        db=live_db,
        current_user=user,
    )

    assert response["applied_to_live_position"] is True
    assert technician.current_latitude == 33.5731
    assert technician.current_longitude == -7.5898
    live_point = next(value for value in live_db.added if isinstance(value, GPSHistory))
    assert live_point.job_id == job.id
    assert live_point.technician_id == user.technician_id
    assert live_point.accuracy == 4.5
    assert job.latitude is None
    assert job.longitude is None

    field_db = _FieldActionDb()
    monkeypatch.setattr(
        technician_field_actions,
        "require_assigned_job",
        AsyncMock(return_value=job),
    )
    monkeypatch.setattr(
        technician_field_actions,
        "log_job_activity",
        AsyncMock(),
    )

    coordinates = {
        "site_location": (33.5732, -7.5897),
        "cable_entry": (33.5733, -7.5896),
        "cable_exit": (33.5734, -7.5895),
    }
    for action_type, (latitude, longitude) in coordinates.items():
        await technician_field_actions.record_technician_field_action(
            field_db,
            event_id=str(uuid4()),
            occurred_at=observed_at,
            job_id=job.id,
            event_type=action_type,
            payload={
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": 3.0,
                "note": f"Repère {action_type}",
            },
            current_user=user,
        )

    actions = [
        value
        for value in field_db.added
        if isinstance(value, TechnicianFieldAction)
    ]
    observations = [
        value
        for value in field_db.added
        if isinstance(value, JobSiteObservation)
    ]
    assert [value.observation_type for value in observations] == list(coordinates)
    assert all(value.technician_id == user.technician_id for value in observations)
    assert job.latitude is None
    assert job.longitude is None

    monkeypatch.setattr(
        job_context,
        "_job_for_collaboration",
        AsyncMock(return_value=job),
    )
    field_record_db = _FieldRecordDb(
        [
            actions,
            [],
            list(reversed(observations)),
            [],
            [],
            [],
            [],
            [],
            [technician],
        ]
    )
    record = await job_context.get_field_record(
        job.id,
        db=field_record_db,
        current_user=user,
    )

    assert record["planned_location"] == {
        "address": "Hay Hassani, Casablanca",
        "city": "Casablanca",
        "zip": None,
        "latitude": None,
        "longitude": None,
        "source": None,
        "precision": None,
    }
    assert record["field_reference_location"]["origin"] == "current_job"
    assert record["field_reference_location"]["source_job_id"] == job.id
    assert (
        record["field_reference_location"]["latitude"]
        == coordinates["site_location"][0]
    )
    assert {item["type"] for item in record["site_observations"]} == set(coordinates)
    assert all(
        item["technician_name"] == "Karim Tazi"
        for item in record["site_observations"]
    )
