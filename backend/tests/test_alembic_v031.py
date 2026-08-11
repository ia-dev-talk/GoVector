"""PostgreSQL contract for the v031 multi-visit adoption migration."""

import asyncio
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    Assignment,
    Base,
    Job,
    JobActivityLog,
    JobStatus,
    JobType,
    Technician,
)


ROOT = Path(__file__).resolve().parents[2]
ADMIN_URL_ENV = "BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL"
PREVIOUS_REVISION = "uh8c9d0e1f2a"
HEAD_REVISION = "vi9d0e1f2a3b"


def _admin_url() -> str:
    url = os.getenv(ADMIN_URL_ENV)
    if not url:
        pytest.skip(f"{ADMIN_URL_ENV} is not configured")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _database_url(admin_url: str, database_name: str) -> str:
    return f"{admin_url.rsplit('/', 1)[0]}/{database_name}"


def _sqlalchemy_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


async def _create_database(admin_url: str, database_name: str) -> None:
    connection = await asyncpg.connect(admin_url)
    try:
        await connection.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        await connection.close()


async def _drop_database(admin_url: str, database_name: str) -> None:
    connection = await asyncpg.connect(admin_url)
    try:
        await connection.execute(f'DROP DATABASE "{database_name}" WITH (FORCE)')
    finally:
        await connection.close()


def _run_alembic(database_url: str, *arguments: str) -> subprocess.CompletedProcess:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = _sqlalchemy_url(database_url)
    return subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )


async def _prepare_v030_schema(database_url: str) -> tuple[int, int]:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            technician = Technician(
                name="Technicien historique",
                employee_id="V031-LEGACY",
                home_latitude=33.57,
                home_longitude=-7.59,
            )
            job = Job(
                job_type=JobType.DEPANNAGE,
                status=JobStatus.FAILED,
                service_address="Site de reprise",
                failure_reason="Accès impossible",
            )
            db.add_all([technician, job])
            await db.flush()
            assignment = Assignment(
                job_id=job.id,
                technician_id=technician.id,
            )
            activity = JobActivityLog(
                job_id=job.id,
                technician_id=technician.id,
                action="failure",
                description="Accès impossible",
            )
            db.add_all([assignment, activity])
            await db.commit()
            job_id = job.id
            assignment_id = assignment.id
    finally:
        await engine.dispose()

    connection = await asyncpg.connect(database_url)
    try:
        for table_name in (
            "job_activity_logs",
            "technician_field_actions",
            "technician_media",
            "gps_history",
            "job_site_observations",
            "job_failures",
            "job_postponements",
        ):
            await connection.execute(
                f'ALTER TABLE "{table_name}" DROP COLUMN visit_id CASCADE'
            )
        for column_name in (
            "ended_by_user_id",
            "assigned_by_user_id",
            "end_reason",
            "ended_at",
            "visit_id",
        ):
            await connection.execute(
                f'ALTER TABLE assignments DROP COLUMN "{column_name}" CASCADE'
            )
        await connection.execute("DROP TABLE job_visits CASCADE")
        await connection.execute(
            "ALTER TABLE assignments ADD CONSTRAINT "
            "uq_assignments_job_id_legacy UNIQUE (job_id)"
        )
    finally:
        await connection.close()
    return job_id, assignment_id


async def _inspect_result(
    database_url: str, *, job_id: int, assignment_id: int
) -> dict:
    connection = await asyncpg.connect(database_url)
    try:
        visit = await connection.fetchrow(
            """
            SELECT id, attempt_number, status, outcome, ended_at,
                   backfill_confidence
            FROM job_visits
            WHERE job_id = $1
            """,
            job_id,
        )
        assignment = await connection.fetchrow(
            """
            SELECT id, visit_id, ended_at, end_reason
            FROM assignments
            WHERE id = $1
            """,
            assignment_id,
        )
        activity_visit_id = await connection.fetchval(
            "SELECT visit_id FROM job_activity_logs WHERE job_id = $1",
            job_id,
        )
        return {
            "revision": await connection.fetchval(
                "SELECT version_num FROM alembic_version"
            ),
            "visit": dict(visit),
            "assignment": dict(assignment),
            "activity_visit_id": activity_visit_id,
            "assignment_count": await connection.fetchval(
                "SELECT count(*) FROM assignments WHERE job_id = $1",
                job_id,
            ),
        }
    finally:
        await connection.close()


def test_v031_adopts_legacy_passage_without_data_loss():
    admin_url = _admin_url()
    database_name = f"bluevector_v031_{uuid4().hex}"
    assert re.fullmatch(r"bluevector_v031_[0-9a-f]{32}", database_name)

    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        job_id, assignment_id = asyncio.run(_prepare_v030_schema(database_url))
        _run_alembic(database_url, "stamp", PREVIOUS_REVISION)
        _run_alembic(database_url, "upgrade", HEAD_REVISION)
        result = asyncio.run(
            _inspect_result(
                database_url,
                job_id=job_id,
                assignment_id=assignment_id,
            )
        )
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["revision"] == HEAD_REVISION
    assert result["assignment_count"] == 1
    assert result["visit"]["attempt_number"] == 1
    assert result["visit"]["status"] == JobStatus.FAILED.value
    assert result["visit"]["outcome"] == JobStatus.FAILED.value
    assert result["visit"]["ended_at"] is not None
    assert result["visit"]["backfill_confidence"] == "high"
    assert result["assignment"]["visit_id"] == result["visit"]["id"]
    assert result["assignment"]["ended_at"] is not None
    assert result["assignment"]["end_reason"] == JobStatus.FAILED.value
    assert result["activity_visit_id"] == result["visit"]["id"]
