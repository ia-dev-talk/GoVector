"""PostgreSQL contract for operational governance through current head."""

import asyncio
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from backend.database.models import Base


ROOT = Path(__file__).resolve().parents[2]
ADMIN_URL_ENV = "BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL"
PREVIOUS_REVISION = "xk1f2a3b4c5d"


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


def _current_head_revision() -> str:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "heads"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    heads = [
        line.split()[0]
        for line in result.stdout.splitlines()
        if line.strip().endswith("(head)")
    ]
    assert len(heads) == 1, f"Expected one Alembic head, got: {heads}"
    return heads[0]


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


async def _prepare_v033_schema(database_url: str) -> None:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()
    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute("DROP TABLE operational_audit_events CASCADE")
        await connection.execute("DROP TABLE site_merge_records CASCADE")
        await connection.execute("ALTER TABLE sites DROP COLUMN merge_reason")
        await connection.execute("ALTER TABLE sites DROP COLUMN merged_by_user_id")
        await connection.execute("ALTER TABLE sites DROP COLUMN merged_at")
        await connection.execute("ALTER TABLE sites DROP COLUMN merged_into_site_id")
    finally:
        await connection.close()


async def _inspect(database_url: str) -> dict:
    connection = await asyncpg.connect(database_url)
    try:
        tables = {
            row["tablename"]
            for row in await connection.fetch(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        }
        site_columns = {
            row["column_name"]
            for row in await connection.fetch(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'sites'
                """
            )
        }
        technician_sector_columns = {
            row["column_name"]
            for row in await connection.fetch(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'technician_sectors'
                """
            )
        }
        revision = await connection.fetchval("SELECT version_num FROM alembic_version")
        return {
            "tables": tables,
            "site_columns": site_columns,
            "technician_sector_columns": technician_sector_columns,
            "revision": revision,
        }
    finally:
        await connection.close()


def test_v034_v035_upgrade_from_v033_to_current_head():
    admin_url = _admin_url()
    database_name = f"bluevector_v035_{uuid4().hex}"
    assert re.fullmatch(r"bluevector_v035_[0-9a-f]{32}", database_name)
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        asyncio.run(_prepare_v033_schema(database_url))
        _run_alembic(database_url, "stamp", PREVIOUS_REVISION)
        _run_alembic(database_url, "upgrade", "head")
        result = asyncio.run(_inspect(database_url))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["revision"] == _current_head_revision()
    assert "site_merge_records" in result["tables"]
    assert "operational_audit_events" in result["tables"]
    assert "technician_sectors" in result["tables"]
    assert {
        "technician_id",
        "sector_id",
        "is_primary",
        "created_at",
    }.issubset(result["technician_sector_columns"])
    assert {
        "merged_into_site_id",
        "merged_at",
        "merged_by_user_id",
        "merge_reason",
    }.issubset(result["site_columns"])
