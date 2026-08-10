"""PostgreSQL integration contract for the complete field geolocation chain."""

import os
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes import job_context, supervision
from backend.api.schemas.technicians import GPSLiveUpdate
from backend.database.models import (
    Assignment,
    Base,
    GPSHistory,
    Job,
    JobSiteObservation,
    JobStatus,
    JobType,
    Technician,
    TechnicianFieldAction,
    TechnicianLiveStatus,
    User,
    UserRole,
)
from backend.logic.technician_field_actions import (
    record_technician_field_action,
)


ADMIN_URL_ENV = "BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL"


@pytest_asyncio.fixture
async def postgres_session_factory():
    admin_url = os.getenv(ADMIN_URL_ENV)
    if not admin_url:
        pytest.skip(f"{ADMIN_URL_ENV} is not configured")

    import asyncpg

    database_name = f"bluevector_geo_{uuid4().hex}"
    admin_connection = await asyncpg.connect(admin_url)
    try:
        await admin_connection.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        await admin_connection.close()

    database_url = admin_url.rsplit("/", 1)[0] + f"/{database_name}"
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace(
            "postgresql://",
            "postgresql+asyncpg://",
            1,
        )
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()
        admin_connection = await asyncpg.connect(admin_url)
        try:
            await admin_connection.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = $1 AND pid <> pg_backend_pid()",
                database_name,
            )
            await admin_connection.execute(f'DROP DATABASE "{database_name}"')
        finally:
            await admin_connection.close()


@pytest.mark.asyncio
async def test_postgres_preserves_planned_live_and_confirmed_locations(
    postgres_session_factory,
    monkeypatch,
):
    observed_at = datetime(2026, 8, 10, 9, 30, tzinfo=timezone.utc)

    async with postgres_session_factory() as db:
        technician = Technician(
            name="Karim Tazi",
            employee_id="B1-GEO-TECH",
            home_latitude=33.5730,
            home_longitude=-7.5900,
            live_status=TechnicianLiveStatus.EN_INTERVENTION,
        )
        db.add(technician)
        await db.flush()

        user = User(
            username="b1.geo.tech",
            email="b1.geo.tech@bluevector.test",
            password_hash="not-used-by-contract-test",
            role=UserRole.TECHNICIAN,
            technician_id=technician.id,
        )
        job = Job(
            job_type=JobType.INSTALLATION,
            status=JobStatus.ASSIGNED,
            service_address="Hay Hassani, Casablanca",
            service_city="Casablanca",
            latitude=None,
            longitude=None,
        )
        db.add_all([user, job])
        await db.flush()
        db.add(Assignment(job_id=job.id, technician_id=technician.id))
        await db.commit()

        monkeypatch.setattr(supervision.ws_manager, "broadcast", AsyncMock())

        await supervision.update_technician_gps(
            GPSLiveUpdate(
                job_id=job.id,
                latitude=33.5731,
                longitude=-7.5898,
                accuracy=4.5,
                observed_at=observed_at,
            ),
            db=db,
            current_user=user,
        )

        for action_type, latitude, longitude in (
            ("site_location", 33.5732, -7.5897),
            ("cable_entry", 33.5733, -7.5896),
            ("cable_exit", 33.5734, -7.5895),
        ):
            await record_technician_field_action(
                db,
                event_id=str(uuid4()),
                occurred_at=observed_at,
                job_id=job.id,
                event_type=action_type,
                payload={
                    "latitude": latitude,
                    "longitude": longitude,
                    "accuracy": 3.0,
                    "note": f"Repère {action_type}",
                },
                current_user=user,
            )
        await db.commit()

        await db.refresh(job)
        await db.refresh(technician)
        assert job.latitude is None
        assert job.longitude is None
        assert technician.current_latitude == 33.5731
        assert technician.current_longitude == -7.5898

        gps_count = await db.scalar(
            select(func.count()).select_from(GPSHistory)
        )
        action_count = await db.scalar(
            select(func.count()).select_from(TechnicianFieldAction)
        )
        observation_count = await db.scalar(
            select(func.count()).select_from(JobSiteObservation)
        )
        assert gps_count == 1
        assert action_count == 3
        assert observation_count == 3

        record = await job_context.get_field_record(
            job.id,
            db=db,
            current_user=user,
        )
        assert record["planned_location"]["latitude"] is None
        assert record["planned_location"]["longitude"] is None
        assert record["field_reference_location"]["latitude"] == 33.5732
        assert {item["type"] for item in record["site_observations"]} == {
            "site_location",
            "cable_entry",
            "cable_exit",
        }
