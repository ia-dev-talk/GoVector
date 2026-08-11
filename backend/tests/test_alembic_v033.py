"""PostgreSQL contract for structured site provenance in v033."""

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
PREVIOUS_REVISION = "wj0e1f2a3b4c"
HEAD_REVISION = "xk1f2a3b4c5d"


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


async def _prepare_v032_schema(database_url: str) -> None:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()
    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute("DROP TABLE site_resolved_attributes CASCADE")
        await connection.execute("DROP TABLE site_attribute_observations CASCADE")
    finally:
        await connection.close()


async def _inspect(database_url: str) -> tuple[set[str], str]:
    connection = await asyncpg.connect(database_url)
    try:
        tables = {
            row["tablename"]
            for row in await connection.fetch(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        }
        revision = await connection.fetchval("SELECT version_num FROM alembic_version")
        return tables, revision
    finally:
        await connection.close()


def test_v033_creates_structured_site_provenance_tables():
    admin_url = _admin_url()
    database_name = f"bluevector_v033_{uuid4().hex}"
    assert re.fullmatch(r"bluevector_v033_[0-9a-f]{32}", database_name)
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        asyncio.run(_prepare_v032_schema(database_url))
        _run_alembic(database_url, "stamp", PREVIOUS_REVISION)
        _run_alembic(database_url, "upgrade", HEAD_REVISION)
        tables, revision = asyncio.run(_inspect(database_url))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert revision == HEAD_REVISION
    assert "site_attribute_observations" in tables
    assert "site_resolved_attributes" in tables
