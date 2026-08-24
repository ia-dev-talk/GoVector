import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql
from starlette.routing import Match

# Some legacy route modules still import ``database`` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.routes import jobs as jobs_routes
from backend.database.models import UserRole


class _Scalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _ExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _Scalars(self._values)


def test_jobs_my_static_route_precedes_job_id_route():
    scope = {
        "type": "http",
        "path": "/my",
        "method": "GET",
        "root_path": "",
        "headers": [],
        "query_string": b"",
    }

    matching_paths = [
        route.path
        for route in jobs_routes.router.routes
        if route.matches(scope)[0] == Match.FULL
    ]

    assert matching_paths[0] == "/my"
    assert "/{job_id}" in matching_paths


@pytest.mark.asyncio
async def test_jobs_my_returns_only_assignments_for_technician_three(monkeypatch):
    assignments = [SimpleNamespace(job_id=8), SimpleNamespace(job_id=41)]
    assigned_jobs = [SimpleNamespace(id=41), SimpleNamespace(id=8)]
    get_assignments = AsyncMock(return_value=assignments)
    db = SimpleNamespace(execute=AsyncMock(return_value=_ExecuteResult(assigned_jobs)))
    current_user = SimpleNamespace(
        id=3,
        role=UserRole.TECHNICIAN,
        technician_id=3,
        orienteur_id=None,
    )

    monkeypatch.setattr(
        jobs_routes.assignment_logic,
        "get_assignments_for_technician",
        get_assignments,
    )
    monkeypatch.setattr(
        jobs_routes.JobResponse,
        "from_orm_with_assignment",
        classmethod(lambda cls, job: {"id": job.id}),
    )
    monkeypatch.setattr(
        "backend.api.job_responses.hydrate_job_sector_identities",
        AsyncMock(side_effect=lambda _db, jobs: list(jobs)),
    )

    response = await jobs_routes.get_my_jobs(
        status=None,
        scheduled_date=None,
        skip=0,
        limit=100,
        db=db,
        current_user=current_user,
    )

    assert response == [{"id": 41}, {"id": 8}]
    get_assignments.assert_awaited_once_with(db, technician_id=3)

    statement = db.execute.await_args.args[0]
    compiled = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "jobs.id IN (8, 41)" in compiled


@pytest.mark.asyncio
async def test_jobs_my_with_no_assignments_returns_empty_list(monkeypatch):
    get_assignments = AsyncMock(return_value=[])
    db = SimpleNamespace(execute=AsyncMock())
    current_user = SimpleNamespace(
        id=3,
        role=UserRole.TECHNICIAN,
        technician_id=3,
        orienteur_id=None,
    )

    monkeypatch.setattr(
        jobs_routes.assignment_logic,
        "get_assignments_for_technician",
        get_assignments,
    )

    response = await jobs_routes.get_my_jobs(
        status=None,
        scheduled_date=None,
        skip=0,
        limit=100,
        db=db,
        current_user=current_user,
    )

    assert response == []
    db.execute.assert_not_awaited()
