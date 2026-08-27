from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.database.models import JobStatus
from backend.logic import jobs as job_logic


class _MutationSession:
    def __init__(self):
        self.commit_count = 0
        self.refresh_count = 0
        self.delete_called = False

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, _obj):
        self.refresh_count += 1

    async def delete(self, _obj):
        self.delete_called = True
        raise AssertionError(
            "Soft delete must never call AsyncSession.delete(job)"
        )


class _QueryResult:
    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return self

    def all(self):
        return []


class _ReadSession:
    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _QueryResult()


def _statement_sql(statement):
    return str(
        statement.compile(
            compile_kwargs={"literal_binds": True},
        )
    )


@pytest.mark.asyncio
async def test_cancelled_job_is_archived_without_hard_delete(monkeypatch):
    job = SimpleNamespace(
        status=JobStatus.CANCELLED,
        deleted_at=None,
        deleted_by=None,
    )

    async def fake_get_job(_db, job_id):
        assert job_id == 32
        return job

    monkeypatch.setattr(job_logic, "get_job", fake_get_job)

    db = _MutationSession()

    result = await job_logic.delete_job(
        db,
        32,
        deleted_by=7,
    )

    assert result is True
    assert job.deleted_at is not None
    assert job.deleted_by == 7

    assert db.commit_count == 1
    assert db.refresh_count == 1
    assert db.delete_called is False


@pytest.mark.asyncio
async def test_non_cancelled_job_cannot_be_archived(monkeypatch):
    job = SimpleNamespace(
        status=JobStatus.ASSIGNED,
        deleted_at=None,
        deleted_by=None,
    )

    async def fake_get_job(_db, _job_id):
        return job

    monkeypatch.setattr(job_logic, "get_job", fake_get_job)

    db = _MutationSession()

    with pytest.raises(
        ValueError,
        match="Only a cancelled intervention can be archived",
    ):
        await job_logic.delete_job(
            db,
            32,
            deleted_by=7,
        )

    assert job.deleted_at is None
    assert job.deleted_by is None
    assert db.commit_count == 0
    assert db.delete_called is False


@pytest.mark.asyncio
async def test_get_job_excludes_archived_rows():
    db = _ReadSession()

    result = await job_logic.get_job(db, 32)

    assert result is None

    sql = _statement_sql(db.statements[-1])

    assert "jobs.id = 32" in sql
    assert "jobs.deleted_at IS NULL" in sql


@pytest.mark.asyncio
async def test_active_job_collections_exclude_archived_rows():
    db = _ReadSession()

    await job_logic.get_pending_jobs(db)
    pending_sql = _statement_sql(db.statements[-1])

    await job_logic.get_assigned_jobs(db)
    assigned_sql = _statement_sql(db.statements[-1])

    await job_logic.search_jobs(db)
    search_sql = _statement_sql(db.statements[-1])

    assert "jobs.deleted_at IS NULL" in pending_sql
    assert "jobs.deleted_at IS NULL" in assigned_sql
    assert "jobs.deleted_at IS NULL" in search_sql


def test_technician_collection_and_delete_route_keep_soft_delete_contract():
    source = Path(
        "backend/api/routes/jobs.py"
    ).read_text(encoding="utf-8")

    assert "Job.deleted_at.is_(None)" in source

    assert "deleted_by=current_user.id" in source

    assert (
        "Archive a cancelled job while preserving audit history."
        in source
    )
