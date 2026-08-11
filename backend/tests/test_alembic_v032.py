"""PostgreSQL contract for canonical-site adoption in v032."""

import asyncio
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    Base,
    Job,
    JobSiteObservation,
    JobStatus,
    JobType,
    Technician,
    User,
    UserRole,
)


ROOT = Path(__file__).resolve().parents[2]
ADMIN_URL_ENV = "BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL"
PREVIOUS_REVISION = "vi9d0e1f2a3b"
HEAD_REVISION = "wj0e1f2a3b4c"


def _admin_url() -> str:
    url = os.getenv(ADMIN_URL_ENV)
    if not url:
        pytest.skip(f"{ADMIN_URL_ENV} is not configured")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _database_url(admin_url: str, database_name: str) -> str:
    return f"{admin_url.rsplit('/', 1)[0]}/{database_name}"


def _sqlalchemy_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


def _run_alembic(database_url: str, *arguments: str) -> None:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = _sqlalchemy_url(database_url)
    subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )


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


async def _inspect_result(
    database_url: str, *, first_id: int, second_id: int, observation_id: int
) -> tuple[dict, str]:
    connection = await asyncpg.connect(database_url)
    try:
        result = await connection.fetchrow(
            """
            SELECT s.id, s.canonical_latitude, s.canonical_longitude,
                   s.resolved_observation_id, s.revision,
                   a.site_id AS first_site_id, b.site_id AS second_site_id,
                   o.resolution_status
            FROM jobs a
            JOIN jobs b ON b.id = $2
            JOIN sites s ON s.id = a.site_id
            JOIN job_site_observations o ON o.id = $3
            WHERE a.id = $1
            """,
            first_id,
            second_id,
            observation_id,
        )
        revision = await connection.fetchval(
            "SELECT version_num FROM alembic_version"
        )
        return dict(result), revision
    finally:
        await connection.close()


async def _prepare_v031_schema(database_url: str) -> tuple[int, int, int]:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as db:
            technician = Technician(
                name="Technicien site",
                employee_id="V032-SITE",
                home_latitude=33.57,
                home_longitude=-7.59,
            )
            db.add(technician)
            await db.flush()
            user = User(
                username="v032.site",
                email="v032.site@bluevector.test",
                password_hash="not-used",
                role=UserRole.TECHNICIAN,
                technician_id=technician.id,
            )
            first = Job(
                job_type=JobType.INSTALLATION,
                status=JobStatus.COMPLETED,
                service_address="Résidence test, appartement 9",
                service_city="Casablanca",
                service_zip="20000",
                operator="Orange",
                pto_raw="PTO-V032-1",
            )
            second = Job(
                job_type=JobType.DEPANNAGE,
                status=JobStatus.PENDING,
                service_address="Résidence test, appartement 9",
                service_city="Casablanca",
                service_zip="20000",
                operator="Orange",
                pto_raw=" pto-v032-1 ",
            )
            db.add_all([user, first, second])
            await db.flush()
            observation = JobSiteObservation(
                job_id=first.id,
                observation_type="site_location",
                latitude=33.54789,
                longitude=-7.59582,
                accuracy_m=4.0,
                user_id=user.id,
                technician_id=technician.id,
                source="mobile",
                occurred_at=datetime(2026, 8, 11, 10, 0, tzinfo=timezone.utc),
            )
            db.add(observation)
            await db.commit()
            ids = (first.id, second.id, observation.id)
    finally:
        await engine.dispose()

    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute("ALTER TABLE jobs DROP COLUMN site_id CASCADE")
        for column in (
            "resolved_by_user_id",
            "resolved_at",
            "resolution_status",
            "site_id",
        ):
            await connection.execute(
                f'ALTER TABLE job_site_observations DROP COLUMN "{column}" CASCADE'
            )
        await connection.execute("DROP TABLE sites CASCADE")
    finally:
        await connection.close()
    return ids


def test_v032_adopts_strong_site_identity_and_preserves_field_fix():
    admin_url = _admin_url()
    database_name = f"bluevector_v032_{uuid4().hex}"
    assert re.fullmatch(r"bluevector_v032_[0-9a-f]{32}", database_name)
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        first_id, second_id, observation_id = asyncio.run(
            _prepare_v031_schema(database_url)
        )
        _run_alembic(database_url, "stamp", PREVIOUS_REVISION)
        _run_alembic(database_url, "upgrade", "head")
        result, revision = asyncio.run(
            _inspect_result(
                database_url,
                first_id=first_id,
                second_id=second_id,
                observation_id=observation_id,
            )
        )
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert revision == HEAD_REVISION
    assert result["first_site_id"] == result["second_site_id"] == result["id"]
    assert result["canonical_latitude"] == pytest.approx(33.54789)
    assert result["canonical_longitude"] == pytest.approx(-7.59582)
    assert result["resolved_observation_id"] == observation_id
    assert result["resolution_status"] == "accepted"
    assert result["revision"] == 1
