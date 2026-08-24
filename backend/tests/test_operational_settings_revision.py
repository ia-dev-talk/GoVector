import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import settings
from backend.api.schemas.settings import (
    OperationalSettingsUpdate,
    OperationalSettingsValues,
)


class FakeDb:
    def __init__(self):
        self.commit_calls = 0
        self.refresh_calls = 0
        self.added = []
        self.rollback_calls = 0

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.commit_calls += 1

    async def refresh(self, _value):
        self.refresh_calls += 1

    async def rollback(self):
        self.rollback_calls += 1


def document(*, revision=4, stale_minutes=30):
    return SimpleNamespace(
        namespace="operational",
        schema_version=3,
        revision=revision,
        values={
            "gps_stale_after_minutes": stale_minutes,
            "gps_history_retention_days": 90,
            "completion_policy": {},
        },
        updated_by=1,
        created_at=None,
        updated_at=None,
    )


def payload(*, expected_revision=4, stale_minutes=45):
    return OperationalSettingsUpdate(
        expected_revision=expected_revision,
        values=OperationalSettingsValues(
            gps_stale_after_minutes=stale_minutes,
            gps_history_retention_days=90,
        ),
    )


def test_operational_update_rejects_stale_revision_before_mutation_or_audit(monkeypatch):
    current = document()
    db = FakeDb()
    audited = []

    async def get_document(_db, namespace, *, for_update=False):
        assert namespace == "operational"
        assert for_update is True
        return current

    monkeypatch.setattr(settings, "_get_document", get_document)
    monkeypatch.setattr(
        settings,
        "record_operational_audit",
        lambda *args, **kwargs: audited.append((args, kwargs)),
    )

    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            settings.update_operational_settings(
                payload(expected_revision=3),
                db,
                SimpleNamespace(id=9),
            )
        )

    assert caught.value.status_code == 409
    assert caught.value.detail["revision"] == 4
    assert current.revision == 4
    assert current.values["gps_stale_after_minutes"] == 30
    assert db.commit_calls == 0
    assert db.refresh_calls == 0
    assert audited == []


def test_operational_update_commits_exact_next_revision(monkeypatch):
    current = document()
    db = FakeDb()
    audits = []

    async def get_document(_db, namespace, *, for_update=False):
        assert namespace == "operational"
        assert for_update is True
        return current

    monkeypatch.setattr(settings, "_get_document", get_document)
    monkeypatch.setattr(
        settings,
        "record_operational_audit",
        lambda *args, **kwargs: audits.append(kwargs),
    )

    response = asyncio.run(
        settings.update_operational_settings(
            payload(expected_revision=4, stale_minutes=45),
            db,
            SimpleNamespace(id=9),
        )
    )

    assert current.revision == 5
    assert current.values["gps_stale_after_minutes"] == 45
    assert current.updated_by == 9
    assert db.commit_calls == 1
    assert db.refresh_calls == 1
    assert len(audits) == 1
    assert audits[0]["before"]["revision"] == 4
    assert audits[0]["after"]["revision"] == 5
    assert response.revision == 5


def test_operational_update_schema_requires_revision_envelope():
    with pytest.raises(Exception):
        OperationalSettingsUpdate(
            gps_stale_after_minutes=30,
            gps_history_retention_days=90,
        )
