from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.main import app
from backend.api.schemas.technicians import (
    GPSLiveUpdate,
    TechnicianLiveStatusUpdate,
    TechnicianResponse,
)
from backend.auth.dependencies import require_orienteur
from backend.database.models import (
    GPSHistory,
    Technician,
    TechnicianLiveStatus,
    TechnicianStatus,
    UserRole,
)
from backend.logic import job_access
from pydantic import ValidationError


class _DB:
    def __init__(self, job=None):
        self.job = job

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.job)


class _GpsDB(_DB):
    def __init__(self, technician):
        super().__init__(technician)
        self.added = []

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        return None


def _user(role, *, technician_id=None, orienteur_id=None, client_organization_id=None):
    return SimpleNamespace(
        role=role,
        technician_id=technician_id,
        orienteur_id=orienteur_id,
        client_organization_id=client_organization_id,
    )


def _job(*, job_id=8, orienteur_id=4, client_organization_id=None):
    return SimpleNamespace(
        id=job_id,
        orienteur_id=orienteur_id,
        client_organization_id=client_organization_id,
    )


@pytest.mark.asyncio
async def test_job_read_access_is_resource_scoped_for_technicians(monkeypatch):
    async def owned(_db, *, technician_id, job_id):
        if technician_id == 3 and job_id == 8:
            return object()
        return None

    monkeypatch.setattr(
        job_access.assignment_logic,
        "get_assignment_for_technician_job",
        owned,
    )
    job = _job()
    owner = _user(UserRole.TECHNICIAN, technician_id=3)
    other = _user(UserRole.TECHNICIAN, technician_id=9)

    assert await job_access.require_job_read_access(
        _DB(), job=job, current_user=owner
    ) is job
    with pytest.raises(job_access.BusinessAPIError) as denied:
        await job_access.require_job_read_access(
            _DB(), job=job, current_user=other
        )
    assert denied.value.status_code == 403
    assert denied.value.code == "permission_denied"


@pytest.mark.asyncio
async def test_office_orienteur_is_global_and_field_agent_has_no_generic_read():
    job = _job(orienteur_id=4)
    assert await job_access.require_job_read_access(
        _DB(),
        job=job,
        current_user=_user(UserRole.ORIENTEUR, orienteur_id=4),
    ) is job
    # There is one central office orienteur: legacy orienteur_id no longer
    # restricts its global exploitation visibility.
    assert await job_access.require_job_read_access(
        _DB(),
        job=job,
        current_user=_user(UserRole.ORIENTEUR, orienteur_id=12),
    ) is job
    assert await job_access.require_job_read_access(
        _DB(), job=job, current_user=_user(UserRole.ADMIN)
    ) is job
    # Historical CHEF_ORIENTEUR is now Agent terrain and must use the explicit
    # team-scoped /orienteur-agent surface rather than generic job access.
    with pytest.raises(job_access.BusinessAPIError) as denied:
        await job_access.require_job_read_access(
            _DB(),
            job=job,
            current_user=_user(UserRole.CHEF_ORIENTEUR, orienteur_id=4),
        )
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_client_read_access_is_strictly_organization_scoped():
    job = _job(client_organization_id=12)
    owner = _user(UserRole.CLIENT, client_organization_id=12)
    other = _user(UserRole.CLIENT, client_organization_id=99)

    assert await job_access.require_job_read_access(
        _DB(), job=job, current_user=owner
    ) is job
    with pytest.raises(job_access.BusinessAPIError) as denied:
        await job_access.require_job_read_access(
            _DB(), job=job, current_user=other
        )
    assert denied.value.status_code == 403


def test_assignment_mutations_are_office_only():
    job = _job(orienteur_id=4)
    assert job_access.require_job_operations_access(
        job=job,
        current_user=_user(UserRole.ORIENTEUR, orienteur_id=99),
    ) is job
    assert job_access.require_job_operations_access(
        job=job, current_user=_user(UserRole.ADMIN)
    ) is job
    for denied_user in (
        _user(UserRole.TECHNICIAN, technician_id=3),
        _user(UserRole.CHEF_ORIENTEUR, orienteur_id=4),
    ):
        with pytest.raises(job_access.BusinessAPIError):
            job_access.require_job_operations_access(
                job=job,
                current_user=denied_user,
            )


def test_every_p0_route_declares_oauth_security():
    schema = app.openapi()
    protected_operations = (
        ("/api/v1/interventions/{job_id}/complete", "post"),
        ("/api/v1/assignments/job/{job_id}", "get"),
        ("/api/v1/assignments/batch-unassign", "post"),
        ("/api/v1/jobs/{job_id}", "get"),
        ("/api/v1/audit/log", "get"),
        ("/api/v1/audit/summary", "get"),
        ("/api/v1/dashboard/performance", "get"),
        ("/api/v1/dashboard/success-rate", "get"),
        ("/api/v1/dashboard/charts/secteurs", "get"),
        ("/api/v1/dashboard/charts/status", "get"),
        ("/api/v1/supervision/gps", "post"),
        ("/api/v1/supervision/status", "post"),
        ("/api/v1/supervision/map", "get"),
        ("/api/v1/supervision/gps-history/{technician_id}", "get"),
        ("/api/v1/supervision/alerts", "get"),
        ("/api/v1/supervision/alerts/{alert_id}/read", "post"),
        ("/api/v1/supervision/alerts/read-all", "post"),
    )
    for path, method in protected_operations:
        assert schema["paths"][path][method].get("security"), path


def test_dashboard_and_audit_do_not_expose_static_or_random_fallbacks():
    import inspect
    from backend.api.routes import audit, dashboard

    source = inspect.getsource(audit) + inspect.getsource(dashboard)
    assert "random.randint" not in source
    assert '"MOHAMMEDIA": 11' not in source
    assert '"Interrompu": 12' not in source


@pytest.mark.asyncio
async def test_supervision_read_routes_reject_non_office_roles():
    for denied_user in (
        _user(UserRole.TECHNICIAN, technician_id=3),
        _user(UserRole.CHEF_ORIENTEUR, orienteur_id=4),
    ):
        with pytest.raises(HTTPException) as denied:
            await require_orienteur(denied_user)
        assert denied.value.status_code == 403
    assert await require_orienteur(_user(UserRole.ORIENTEUR, orienteur_id=4))


@pytest.mark.asyncio
async def test_supervision_job_reference_uses_shared_resource_access(monkeypatch):
    async def owned(_db, *, technician_id, job_id):
        return object() if (technician_id, job_id) == (3, 8) else None

    monkeypatch.setattr(
        job_access.assignment_logic,
        "get_assignment_for_technician_job",
        owned,
    )
    job = _job()

    assert await job_access.require_job_read_access_by_id(
        _DB(job),
        job_id=8,
        current_user=_user(UserRole.TECHNICIAN, technician_id=3),
    ) is job
    with pytest.raises(job_access.BusinessAPIError) as denied:
        await job_access.require_job_read_access_by_id(
            _DB(job),
            job_id=8,
            current_user=_user(UserRole.TECHNICIAN, technician_id=9),
        )
    assert denied.value.status_code == 403


def test_supervision_payloads_do_not_invent_telemetry_or_accept_identity():
    payload = GPSLiveUpdate(latitude=33.58, longitude=-7.60)
    assert payload.speed is None
    assert payload.heading is None
    assert payload.accuracy is None
    assert payload.battery_level is None

    with pytest.raises(ValidationError):
        TechnicianLiveStatusUpdate(
            status=TechnicianLiveStatus.DISPONIBLE,
            technician_id=999,
        )

    for column in (
        Technician.__table__.c.current_speed,
        Technician.__table__.c.current_heading,
        Technician.__table__.c.current_accuracy,
        Technician.__table__.c.current_battery,
        GPSHistory.__table__.c.speed,
        GPSHistory.__table__.c.heading,
        GPSHistory.__table__.c.accuracy,
        GPSHistory.__table__.c.battery_level,
    ):
        assert column.default is None


def test_technician_response_preserves_unknown_live_telemetry_as_null():
    now = datetime.now(timezone.utc)
    tech = SimpleNamespace(
        id=3,
        name="Karim Tazi",
        employee_id="TECH-3",
        phone=None,
        email=None,
        status=TechnicianStatus.AVAILABLE,
        live_status=TechnicianLiveStatus.DISPONIBLE,
        is_active=True,
        current_latitude=None,
        current_longitude=None,
        current_speed=None,
        current_heading=None,
        current_accuracy=None,
        current_battery=None,
        current_job_id=None,
        last_location_update=None,
        home_latitude=33.5731,
        home_longitude=-7.5898,
        home_address=None,
        skills=[],
        assigned_routes=[],
        shift_start=None,
        shift_end=None,
        max_jobs_per_day=8,
        orienteur_id=None,
        orienteur=None,
        created_at=now,
        updated_at=now,
        assignments=[],
    )

    response = TechnicianResponse.from_orm_with_counts(tech)
    assert response.current_speed is None
    assert response.current_heading is None
    assert response.current_accuracy is None
    assert response.current_battery is None


@pytest.mark.parametrize(
    "values",
    [
        {"speed": -1},
        {"heading": -1},
        {"heading": 361},
        {"accuracy": -0.1},
        {"battery_level": -1},
        {"battery_level": 101},
    ],
)
def test_live_gps_rejects_invalid_device_telemetry(values):
    with pytest.raises(ValidationError):
        GPSLiveUpdate(latitude=33.58, longitude=-7.60, **values)


def test_live_gps_requires_timezone_when_device_observation_time_is_sent():
    observed_at = datetime.now(timezone.utc)
    payload = GPSLiveUpdate(
        latitude=33.58,
        longitude=-7.60,
        observed_at=observed_at,
    )
    assert payload.observed_at == observed_at

    with pytest.raises(ValidationError):
        GPSLiveUpdate(
            latitude=33.58,
            longitude=-7.60,
            observed_at=datetime.now(),
        )


@pytest.mark.asyncio
async def test_late_gps_fix_is_historized_without_rewinding_live_position(monkeypatch):
    from backend.api.routes import supervision

    broadcasts = []

    async def broadcast(*args, **kwargs):
        broadcasts.append((args, kwargs))

    monkeypatch.setattr(supervision.ws_manager, "broadcast", broadcast)
    tech = SimpleNamespace(
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
    db = _GpsDB(tech)
    current_user = _user(UserRole.TECHNICIAN, technician_id=3)
    observed_at = datetime.now(timezone.utc) - timedelta(seconds=5)

    applied = await supervision.update_technician_gps(
        GPSLiveUpdate(
            latitude=33.58,
            longitude=-7.60,
            accuracy=3.5,
            observed_at=observed_at,
        ),
        db=db,
        current_user=current_user,
    )
    late = await supervision.update_technician_gps(
        GPSLiveUpdate(
            latitude=33.57,
            longitude=-7.59,
            accuracy=12,
            observed_at=observed_at - timedelta(seconds=10),
        ),
        db=db,
        current_user=current_user,
    )

    assert applied["applied_to_live_position"] is True
    assert late["applied_to_live_position"] is False
    assert tech.current_latitude == 33.58
    assert tech.current_longitude == -7.60
    assert tech.current_accuracy == 3.5
    assert tech.last_location_update == observed_at
    assert db.added[-1].recorded_at == observed_at - timedelta(seconds=10)
    assert len(broadcasts) == 1


def test_supervision_routes_apply_role_and_resource_dependencies():
    import inspect
    from backend.api.routes import supervision

    source = inspect.getsource(supervision)
    assert source.count("Depends(require_technician)") == 2
    assert source.count("Depends(require_orienteur)") == 5
    assert source.count("require_job_read_access_by_id(") == 2
    assert "battery_level or 100" not in source
