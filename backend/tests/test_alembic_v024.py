"""PostgreSQL integration tests for the v024 adoption migration.

These tests require an explicit admin connection because they create and drop
uniquely named temporary databases. They never operate on DATABASE_URL.
"""

import asyncio
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from backend.database.models import Base


ROOT = Path(__file__).resolve().parents[2]
ADMIN_URL_ENV = "BLUEVECTOR_TEST_DATABASE_ADMIN_URL"
NB1_REVISION = "nb1b2c3d4e5f"
HEAD_REVISION = "pc3d4e5f6a7b"
EXISTING_EVENT_ID = "11111111-1111-4111-8111-111111111111"


def _admin_url() -> str:
    url = os.getenv(ADMIN_URL_ENV)
    if not url:
        pytest.skip(f"{ADMIN_URL_ENV} is required for PostgreSQL migration tests")
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


async def _create_nb1_schema(database_url: str) -> None:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.execute(text("ALTER TABLE jobs DROP COLUMN accepted_at"))
    finally:
        await engine.dispose()


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


@pytest.fixture
def migration_database():
    admin_url = _admin_url()
    database_name = f"fieldopt_migration_test_{uuid4().hex}"
    assert re.fullmatch(r"fieldopt_migration_test_[0-9a-f]{32}", database_name)

    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        asyncio.run(_create_nb1_schema(database_url))
        _run_alembic(database_url, "stamp", NB1_REVISION)
        yield database_url
    finally:
        asyncio.run(_drop_database(admin_url, database_name))


async def _prepare_fresh_case(database_url: str) -> None:
    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute("DROP TABLE technician_sync_events")
    finally:
        await connection.close()


async def _prepare_adoption_case(database_url: str) -> None:
    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute(
            """
            ALTER TABLE technician_sync_events
                ALTER COLUMN payload DROP DEFAULT,
                ALTER COLUMN created_at DROP DEFAULT,
                ALTER COLUMN updated_at DROP DEFAULT
            """
        )
        technician_id = await connection.fetchval(
            """
            INSERT INTO technicians (
                name, status, live_status, is_active,
                home_latitude, home_longitude, skills, assigned_routes,
                speed_factor, skill_bonuses, max_jobs_per_day,
                created_at, updated_at
            ) VALUES (
                'Migration test technician', 'AVAILABLE', 'DECONNECTE', true,
                0, 0, '[]'::jsonb, '[]'::jsonb,
                1, '{}'::jsonb, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING id
            """
        )
        user_id = await connection.fetchval(
            """
            INSERT INTO users (
                username, email, password_hash, role, is_active,
                technician_id, created_at, updated_at
            ) VALUES (
                'migration.test', 'migration.test@example.invalid', 'not-a-secret',
                'TECHNICIAN', true, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING id
            """,
            technician_id,
        )
        await connection.execute(
            """
            INSERT INTO technician_sync_events (
                event_id, schema_version, user_id, technician_id, job_id,
                event_type, payload, occurred_at, request_hash, status,
                created_at, updated_at
            ) VALUES (
                $1, 1, $2, $3, 8, 'complete_job', '{}'::jsonb,
                CURRENT_TIMESTAMP, $4, 'acknowledged',
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            """,
            EXISTING_EVENT_ID,
            user_id,
            technician_id,
            "0" * 64,
        )
    finally:
        await connection.close()


async def _inspect_result(database_url: str) -> dict:
    connection = await asyncpg.connect(database_url)
    try:
        defaults = await connection.fetch(
            """
            SELECT column_name, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'technician_sync_events'
              AND column_name IN ('payload', 'created_at', 'updated_at')
            """
        )
        indexes = await connection.fetch(
            """
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'technician_sync_events'
            """
        )
        constraints = await connection.fetch(
            """
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'technician_sync_events'
            """
        )
        return {
            "revision": await connection.fetchval(
                "SELECT version_num FROM alembic_version"
            ),
            "defaults": {
                row["column_name"]: row["column_default"] for row in defaults
            },
            "indexes": {row["indexname"] for row in indexes},
            "constraints": {
                row["constraint_name"]: row["constraint_type"]
                for row in constraints
            },
            "accepted_enum": await connection.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_enum
                    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
                    WHERE pg_type.typname = 'jobstatus'
                      AND pg_enum.enumlabel = 'ACCEPTED'
                )
                """
            ),
            "accepted_column": await connection.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'jobs'
                      AND column_name = 'accepted_at'
                )
                """
            ),
            "existing_event_count": await connection.fetchval(
                "SELECT COUNT(*) FROM technician_sync_events WHERE event_id = $1",
                EXISTING_EVENT_ID,
            ),
        }
    finally:
        await connection.close()


def _assert_v024_and_v025(result: dict) -> None:
    assert result["revision"] == HEAD_REVISION
    assert result["defaults"]["payload"] == "'{}'::jsonb"
    assert result["defaults"]["created_at"].lower() in {
        "current_timestamp",
        "now()",
    }
    assert result["defaults"]["updated_at"].lower() in {
        "current_timestamp",
        "now()",
    }
    assert {
        "ix_technician_sync_events_user_id",
        "ix_technician_sync_events_technician_id",
        "ix_technician_sync_events_job_id",
    } <= result["indexes"]
    assert result["constraints"]["technician_sync_events_pkey"] == "PRIMARY KEY"
    assert (
        result["constraints"]["uq_technician_sync_events_technician_event"]
        == "UNIQUE"
    )
    assert result["constraints"]["technician_sync_events_user_id_fkey"] == "FOREIGN KEY"
    assert (
        result["constraints"]["technician_sync_events_technician_id_fkey"]
        == "FOREIGN KEY"
    )
    assert result["accepted_enum"] is True
    assert result["accepted_column"] is True


def test_v024_creates_table_from_nb1(migration_database):
    asyncio.run(_prepare_fresh_case(migration_database))

    _run_alembic(migration_database, "upgrade", "head")
    current = _run_alembic(migration_database, "current")
    result = asyncio.run(_inspect_result(migration_database))

    assert HEAD_REVISION in current.stdout
    _assert_v024_and_v025(result)
    assert result["existing_event_count"] == 0


def test_v024_adopts_create_all_table_without_data_loss(migration_database):
    asyncio.run(_prepare_adoption_case(migration_database))

    _run_alembic(migration_database, "upgrade", "head")
    current = _run_alembic(migration_database, "current")
    result = asyncio.run(_inspect_result(migration_database))

    assert HEAD_REVISION in current.stdout
    _assert_v024_and_v025(result)
    assert result["existing_event_count"] == 1
