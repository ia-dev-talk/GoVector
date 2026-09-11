from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import backend.api.routes.technicians as technicians_route
from backend.api.routes.technicians import (
    TechnicianProfileSave,
    _revision_key,
    save_technician_profile,
)
from backend.api.schemas import TechnicianUpdate
from backend.database.models import Technician, TechnicianLiveStatus, UserRole


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _NoopResult:
    pass


class _FakeDb:
    def __init__(self, technician, *, fail_mutation=False):
        self.technician = technician
        self.fail_mutation = fail_mutation
        self.execute_count = 0
        self.commit_count = 0
        self.rollback_count = 0

    async def execute(self, statement, params=None):
        del params
        self.execute_count += 1
        if self.execute_count == 1:
            return _ScalarResult(self.technician)
        if self.fail_mutation:
            raise RuntimeError("forced mutation failure")
        return _NoopResult()

    async def commit(self):
        self.commit_count += 1

    async def rollback(self):
        self.rollback_count += 1


def _technician(updated_at):
    return Technician(
        id=7,
        name="Nadia Tech",
        home_latitude=33.57,
        home_longitude=-7.59,
        updated_at=updated_at,
        live_status=TechnicianLiveStatus.DISPONIBLE,
    )


def test_revision_key_treats_naive_timestamp_as_utc():
    naive = datetime(2026, 8, 23, 18, 30, 0, 123456)
    aware = naive.replace(tzinfo=timezone.utc)
    assert _revision_key(naive) == _revision_key(aware)


@pytest.mark.asyncio
async def test_profile_save_rejects_stale_revision_before_any_mutation():
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    db = _FakeDb(_technician(current))
    payload = TechnicianProfileSave(
        expected_updated_at=current - timedelta(seconds=1),
        updates=TechnicianUpdate(name="Nouvelle valeur"),
        sector_ids=[],
    )

    with pytest.raises(HTTPException) as exc_info:
        await save_technician_profile(7, payload, db=db, current_user=object())

    assert exc_info.value.status_code == 409
    assert db.execute_count == 1
    assert db.commit_count == 0
    assert db.rollback_count == 0


@pytest.mark.asyncio
async def test_profile_save_commits_profile_and_assignment_once():
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    technician = _technician(current)
    db = _FakeDb(technician)
    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(name="Nadia Mise à jour"),
        sector_ids=[],
    )

    result = await save_technician_profile(
        7,
        payload,
        db=db,
        current_user=object(),
    )

    assert result["success"] is True
    assert technician.name == "Nadia Mise à jour"
    assert db.commit_count == 1
    assert db.rollback_count == 0
    assert db.execute_count == 2


@pytest.mark.asyncio
async def test_office_orienteur_can_save_skills_for_own_technician():
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    technician = _technician(current)
    technician.orienteur_id = 4
    db = _FakeDb(technician)
    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(skills=["PB", "POSE_CABLE_SPCO"]),
        sector_ids=[],
    )

    result = await save_technician_profile(
        7,
        payload,
        db=db,
        current_user=SimpleNamespace(role=UserRole.ORIENTEUR, orienteur_id=4),
    )

    assert result["success"] is True
    assert technician.skills == ["PB", "POSE_CABLE_SPCO"]
    assert db.commit_count == 1


@pytest.mark.asyncio
async def test_office_orienteur_cannot_save_another_team_technician():
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    technician = _technician(current)
    technician.orienteur_id = 4
    db = _FakeDb(technician)
    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(skills=["PB"]),
        sector_ids=[],
    )

    with pytest.raises(HTTPException) as exc_info:
        await save_technician_profile(
            7,
            payload,
            db=db,
            current_user=SimpleNamespace(role=UserRole.ORIENTEUR, orienteur_id=5),
        )

    assert exc_info.value.status_code == 403
    assert db.commit_count == 0


@pytest.mark.asyncio
async def test_profile_save_rolls_back_when_assignment_mutation_fails():
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    db = _FakeDb(_technician(current), fail_mutation=True)
    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(name="Ne doit pas être partiel"),
        sector_ids=[],
    )

    with pytest.raises(RuntimeError, match="forced mutation failure"):
        await save_technician_profile(7, payload, db=db, current_user=object())

    assert db.commit_count == 0
    assert db.rollback_count == 1


@pytest.mark.asyncio
async def test_profile_save_broadcasts_status_change_only_after_commit(monkeypatch):
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    technician = _technician(current)
    db = _FakeDb(technician)
    observed = []

    async def fake_broadcast(event, payload, room):
        assert db.commit_count == 1
        observed.append(("ws", event, payload, room))

    class FakeDashboardService:
        def __init__(self, service_db):
            assert service_db is db

        async def broadcast_dashboard_update(self):
            assert db.commit_count == 1
            observed.append(("dashboard",))

    monkeypatch.setattr(technicians_route.ws_manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(technicians_route, "DashboardService", FakeDashboardService)

    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(name="Nadia Mise à jour"),
        sector_ids=[],
        live_status=TechnicianLiveStatus.HORS_SERVICE,
    )

    await save_technician_profile(7, payload, db=db, current_user=object())

    assert technician.live_status == TechnicianLiveStatus.HORS_SERVICE
    assert observed[0][0] == "ws"
    assert observed[0][2]["technician_id"] == 7
    assert observed[0][2]["old_status"] == "disponible"
    assert observed[0][2]["new_status"] == "hors_service"
    assert observed[0][3] == "supervision"
    assert observed[1] == ("dashboard",)


@pytest.mark.asyncio
async def test_profile_save_does_not_broadcast_when_status_is_unchanged(monkeypatch):
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    db = _FakeDb(_technician(current))
    calls = []

    async def fake_broadcast(*args, **kwargs):
        calls.append((args, kwargs))

    monkeypatch.setattr(technicians_route.ws_manager, "broadcast", fake_broadcast)

    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(name="Nadia Mise à jour"),
        sector_ids=[],
        live_status=TechnicianLiveStatus.DISPONIBLE,
    )

    await save_technician_profile(7, payload, db=db, current_user=object())

    assert calls == []


@pytest.mark.asyncio
async def test_profile_save_never_broadcasts_status_when_transaction_rolls_back(monkeypatch):
    current = datetime(2026, 8, 23, 18, 30, tzinfo=timezone.utc)
    db = _FakeDb(_technician(current), fail_mutation=True)
    calls = []

    async def fake_broadcast(*args, **kwargs):
        calls.append((args, kwargs))

    monkeypatch.setattr(technicians_route.ws_manager, "broadcast", fake_broadcast)

    payload = TechnicianProfileSave(
        expected_updated_at=current,
        updates=TechnicianUpdate(name="Ne doit pas être partiel"),
        sector_ids=[],
        live_status=TechnicianLiveStatus.HORS_SERVICE,
    )

    with pytest.raises(RuntimeError, match="forced mutation failure"):
        await save_technician_profile(7, payload, db=db, current_user=object())

    assert db.commit_count == 0
    assert db.rollback_count == 1
    assert calls == []
