from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend.api.routes.technicians import (
    TechnicianProfileSave,
    _revision_key,
    save_technician_profile,
)
from backend.api.schemas import TechnicianUpdate
from backend.database.models import Technician


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
