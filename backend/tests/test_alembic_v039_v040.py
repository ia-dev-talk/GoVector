"""Reversible GIS/visit-stock migration contract on a UUID PostgreSQL database."""

import asyncio
from uuid import uuid4

import asyncpg
from sqlalchemy.ext.asyncio import create_async_engine

from backend.database.bootstrap_schema import Base
from backend.tests.test_alembic_v035 import _run_alembic
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url, _create_database, _database_url, _drop_database, _sqlalchemy_url,
)


V038 = "bp6k7l8m9n0p"
V039 = "cq7l8m9n0p1q"
V040 = "dr8m9n0p1q2r"
GIS_TABLES = {"geo_import_profiles", "geo_datasets", "geo_layers", "geo_features", "geo_feature_revisions"}


async def _bootstrap(url):
    engine = create_async_engine(_sqlalchemy_url(url))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()


async def _inspect(url, revision, *, gis, visits):
    connection = await asyncpg.connect(url)
    try:
        assert await connection.fetchval("SELECT version_num FROM alembic_version") == revision
        tables = set(await connection.fetchval(
            "SELECT array_agg(tablename) FROM pg_tables WHERE schemaname='public'"))
        assert GIS_TABLES <= tables if gis else not GIS_TABLES & tables
        # Non-GIS registries must survive every downgrade/upgrade.
        assert {"jobs", "job_visits", "stock_consumption", "stock_movements", "users"} <= tables
        for table in ("stock_consumption", "stock_movements"):
            columns = await connection.fetch(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=$1 AND column_name='visit_id'", table)
            assert len(columns) == int(visits)
            if visits:
                assert columns[0]["is_nullable"] == "YES"
                definitions = await connection.fetch(
                    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint "
                    "WHERE conrelid=$1::regclass AND contype='f'", table)
                links = [row['definition'] for row in definitions
                         if 'FOREIGN KEY (visit_id)' in row['definition']]
                assert links and all('REFERENCES job_visits(id) ON DELETE SET NULL' in link for link in links)
                assert await connection.fetchval(
                    "SELECT count(*) FROM pg_indexes WHERE schemaname='public' "
                    "AND tablename=$1 AND indexname=$2", table, f"ix_{table}_visit_id") == 1
    finally:
        await connection.close()


def test_v038_v039_v040_round_trip():
    admin = _admin_url()
    name = f"bluevector_gis_stock_migration_{uuid4().hex}"
    url = _database_url(admin, name)
    asyncio.run(_create_database(admin, name))
    try:
        # The historical pre-Alembic baseline cannot bootstrap an empty DB.
        # Derive V038 with real downgrade DDL, then exercise real upgrades.
        asyncio.run(_bootstrap(url))
        _run_alembic(url, "stamp", V040)
        _run_alembic(url, "downgrade", V038)
        asyncio.run(_inspect(url, V038, gis=False, visits=False))
        _run_alembic(url, "upgrade", V039)
        asyncio.run(_inspect(url, V039, gis=True, visits=False))
        _run_alembic(url, "upgrade", V040)
        asyncio.run(_inspect(url, V040, gis=True, visits=True))
        _run_alembic(url, "downgrade", V039)
        asyncio.run(_inspect(url, V039, gis=True, visits=False))
        _run_alembic(url, "upgrade", V040)
        asyncio.run(_inspect(url, V040, gis=True, visits=True))
    finally:
        asyncio.run(_drop_database(admin, name))
