from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from backend.api.routes import tech_history as history_routes
from backend.database.models import JobStatus, JobType
from backend.logic import technician_history
from backend.logic.technician_jobs import TechnicianJobMutationError


class _Scalars:
    def __init__(self, values):
        self.values = values

    def unique(self):
        return self

    def all(self):
        return self.values


class _Result:
    def __init__(self, *, scalar=None, values=None, one=None):
        self._scalar = scalar
        self._values = values or []
        self._one = one

    def scalar_one(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return _Scalars(self._values)


class _Db:
    def __init__(self, *results):
        self.results = list(results)
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return self.results.pop(0)


def _user(technician_id=3):
    return SimpleNamespace(id=technician_id, technician_id=technician_id)


def _job(
    job_id,
    *,
    status=JobStatus.COMPLETED,
    technician_id=3,
    pto_id=12,
    pto_raw="PTO-12",
):
    now = datetime(2026, 8, 6, 10, 0, tzinfo=timezone.utc)
    technician = SimpleNamespace(id=technician_id, name=f"Tech {technician_id}")
    return SimpleNamespace(
        id=job_id,
        job_number=f"DTLI-{job_id}",
        job_type=JobType.INSTALLATION,
        status=status,
        customer_name=f"Client {job_id}",
        customer_phone="0600000000",
        service_address="10 rue du Pilote",
        service_city="Casablanca",
        service_zip="20000",
        latitude=33.57,
        longitude=-7.59,
        operator="Orange",
        site_id=None,
        nro_id=None,
        nro_raw="NRO-1",
        sro_id=None,
        sro_raw="SRO-1",
        pbo_id=5,
        pbo_raw="PBO-5",
        pto_id=pto_id,
        pto_raw=pto_raw,
        started_at=now,
        arrival_time=now,
        real_duration_minutes=42,
        completed_at=now if status == JobStatus.COMPLETED else None,
        updated_at=now,
        scheduled_date=now,
        created_at=now,
        failure_reason=("PBO inaccessible" if status == JobStatus.FAILED else None),
        validation_status=None,
        coordinator_comments="Travaux réalisés",
        notes=None,
        deleted_at=None,
        assignment=SimpleNamespace(
            technician_id=technician_id,
            technician=technician,
            actual_duration_minutes=42,
        ),
        gps_latitude=None,
        gps_longitude=None,
        optical_power_dbm=None,
        cable_length_m=None,
        ont_serial=None,
        router_serial=None,
        mac_address=None,
        wifi_box_serial=None,
        before_photo=None,
        after_photo=None,
        client_signature=None,
    )


def _compiled(statement):
    return str(statement.compile(compile_kwargs={"literal_binds": True}))


@pytest.mark.asyncio
async def test_personal_history_is_scoped_and_includes_terminal_results():
    jobs = [
        _job(8, status=JobStatus.EN_ATTENTE_VALIDATION),
        _job(9, status=JobStatus.FAILED),
        _job(10, status=JobStatus.POSTPONED),
    ]
    db = _Db(_Result(scalar=3), _Result(values=jobs))

    response = await technician_history.list_technician_history(
        db,
        current_user=_user(3),
        page=1,
        page_size=20,
    )

    assert [item.status for item in response.items] == [
        JobStatus.EN_ATTENTE_VALIDATION,
        JobStatus.FAILED,
        JobStatus.POSTPONED,
    ]
    assert response.items[1].failure_reason == "PBO inaccessible"
    ownership_sql = _compiled(db.statements[0])
    assert "assignments.technician_id = 3" in ownership_sql
    assert "job_activity_logs.technician_id = 3" in ownership_sql
    assert "technician_field_actions.technician_id = 3" in ownership_sql
    assert "technician_sync_events" not in _compiled(db.statements[1])


@pytest.mark.asyncio
async def test_other_account_uses_its_own_technician_scope():
    db = _Db(_Result(scalar=0), _Result(values=[]))

    response = await technician_history.list_technician_history(
        db,
        current_user=_user(4),
        page=1,
        page_size=20,
    )

    assert response.items == []
    ownership_sql = _compiled(db.statements[0])
    assert "assignments.technician_id = 4" in ownership_sql
    assert "job_activity_logs.technician_id = 4" in ownership_sql


@pytest.mark.asyncio
async def test_personal_history_keeps_business_evidence_after_reassignment():
    previous = _job(8, technician_id=7)
    db = _Db(_Result(scalar=1), _Result(values=[previous]))

    response = await technician_history.list_technician_history(
        db,
        current_user=_user(3),
        page=1,
        page_size=20,
    )

    assert response.items[0].job_id == 8
    statement = _compiled(db.statements[0])
    assert "assignments.technician_id = 3" in statement
    assert "job_activity_logs.technician_id = 3" in statement
    assert "technician_field_actions.technician_id = 3" in statement


def test_site_identity_prefers_canonical_pto_and_uses_only_exact_address():
    clause, basis, confidence = technician_history.site_match_clause(_job(8))
    compiled = _compiled(clause)

    assert basis == "pto_id"
    assert confidence == "high"
    assert "jobs.pto_id = 12" in compiled
    assert "service_address" not in compiled

    stable_site = _job(10)
    stable_site.site_id = 77
    clause, basis, confidence = technician_history.site_match_clause(stable_site)
    assert basis == "site_id"
    assert confidence == "high"
    assert "jobs.site_id = 77" in _compiled(clause)

    no_identity = _job(9, pto_id=None, pto_raw=None)
    no_identity.pbo_id = None
    no_identity.pbo_raw = None
    no_identity.latitude = 0
    no_identity.longitude = 0
    no_identity.customer_phone = None
    clause, basis, confidence = technician_history.site_match_clause(no_identity)
    assert basis == "exact_address+city+postal_code"
    assert confidence == "medium"
    compiled = _compiled(clause)
    assert "lower(trim(jobs.service_address)) = '10 rue du pilote'" in compiled
    assert "lower(trim(jobs.service_city)) = 'casablanca'" in compiled
    assert "jobs.service_zip = '20000'" in compiled

    no_identity.service_city = None
    no_identity.service_zip = None
    clause, basis, confidence = technician_history.site_match_clause(no_identity)
    assert basis == confidence == "none"
    assert _compiled(clause) == "false"


@pytest.mark.asyncio
async def test_site_history_can_return_prior_work_by_another_technician(
    monkeypatch,
):
    current = _job(41, status=JobStatus.IN_PROGRESS, technician_id=3)
    previous = _job(8, technician_id=7)
    monkeypatch.setattr(
        technician_history,
        "require_assigned_job",
        AsyncMock(return_value=current),
    )
    db = _Db(
        _Result(scalar=1),
        _Result(values=[previous]),
        _Result(values=[]),
    )

    response = await technician_history.list_site_history(
        db,
        job_id=41,
        current_user=_user(3),
        page=1,
        page_size=20,
    )

    assert response.current_job_id == 41
    assert response.match_basis == "pto_id"
    assert response.items[0].technician_id == 7
    assert response.items[0].is_current is False
    assert "jobs.id != 41" in _compiled(db.statements[0])


@pytest.mark.asyncio
async def test_site_history_refuses_unassigned_current_job(monkeypatch):
    monkeypatch.setattr(
        technician_history,
        "require_assigned_job",
        AsyncMock(
            side_effect=TechnicianJobMutationError(
                "rejected", "job_not_assigned", "Accès refusé"
            )
        ),
    )

    with pytest.raises(TechnicianJobMutationError):
        await technician_history.list_site_history(
            _Db(),
            job_id=99,
            current_user=_user(3),
            page=1,
            page_size=20,
        )


@pytest.mark.asyncio
async def test_history_detail_returns_business_activity_not_sync_receipts():
    job = _job(8)
    log = SimpleNamespace(
        job_id=8,
        action="status_change",
        description="Installation terminée",
        old_status="in_progress",
        new_status="installation_done",
        technician_id=3,
        technician=SimpleNamespace(name="Tech 3"),
        created_at=job.updated_at,
    )
    failure = SimpleNamespace(
        reason="Test",
        comment="Commentaire",
        created_at=job.updated_at,
    )
    postponement = SimpleNamespace(
        reason="Client absent",
        comment=None,
        requested_date=job.updated_at,
        status="PENDING",
        created_at=job.updated_at,
    )
    db = _Db(
        _Result(one=job),
        _Result(values=[log]),
        _Result(values=[failure]),
        _Result(values=[postponement]),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
    )

    detail = await technician_history.get_technician_history_detail(
        db,
        job_id=8,
        current_user=_user(3),
    )

    assert detail.read_only is True
    assert detail.activity_log[0].description == "Installation terminée"
    assert detail.failures[0]["reason"] == "Test"
    assert detail.postponements[0]["reason"] == "Client absent"
    assert all(
        "technician_sync_events" not in _compiled(statement)
        for statement in db.statements
    )


@pytest.mark.asyncio
async def test_site_detail_allows_only_a_matching_prior_intervention(
    monkeypatch,
):
    current = _job(41, status=JobStatus.IN_PROGRESS, technician_id=3)
    previous = _job(8, technician_id=7)
    monkeypatch.setattr(
        technician_history,
        "require_assigned_job",
        AsyncMock(return_value=current),
    )
    db = _Db(
        _Result(one=previous),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
        _Result(values=[]),
    )

    detail = await technician_history.get_site_history_detail(
        db,
        current_job_id=41,
        historical_job_id=8,
        current_user=_user(3),
    )

    assert detail.intervention.job_id == 8
    statement = _compiled(db.statements[0])
    assert "jobs.id = 8" in statement
    assert "jobs.id != 41" in statement
    assert "jobs.pto_id = 12" in statement


@pytest.mark.asyncio
async def test_site_history_route_maps_assignment_failure_to_403(monkeypatch):
    monkeypatch.setattr(
        history_routes,
        "list_site_history",
        AsyncMock(
            side_effect=TechnicianJobMutationError(
                "rejected", "job_not_assigned", "Accès refusé"
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await history_routes.get_job_site_history(
            job_id=99,
            page=1,
            page_size=20,
            db=SimpleNamespace(),
            current_user=_user(3),
        )

    assert exc_info.value.status_code == 403
