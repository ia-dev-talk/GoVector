"""Real PostgreSQL contract for V2 normalized completion evidence."""

import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    ApplicationSetting,
    Base,
    Job,
    JobSiteObservation,
    JobStatus,
    JobType,
    Technician,
    TechnicianMedia,
    User,
    UserRole,
)
from backend.logic.completion_policy import CompletionPolicy


ADMIN_URL_ENV = "BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL"


def _admin_url() -> str:
    value = os.getenv(ADMIN_URL_ENV)
    if not value:
        pytest.skip(f"{ADMIN_URL_ENV} is not configured")
    return value.replace("postgresql+asyncpg://", "postgresql://", 1)


def _db_url(admin_url: str, database_name: str) -> str:
    return f"{admin_url.rsplit('/', 1)[0]}/{database_name}"


def _async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


async def _create_database(admin_url: str, name: str) -> None:
    connection = await asyncpg.connect(admin_url)
    try:
        await connection.execute(f'CREATE DATABASE "{name}"')
    finally:
        await connection.close()


async def _drop_database(admin_url: str, name: str) -> None:
    connection = await asyncpg.connect(admin_url)
    try:
        await connection.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
    finally:
        await connection.close()


async def _exercise(database_url: str) -> dict:
    engine = create_async_engine(_async_url(database_url))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with sessions() as db:
            technician = Technician(
                name="Tech Evidence",
                employee_id="EVIDENCE-1",
                home_latitude=33.58,
                home_longitude=-7.62,
                skills=[],
                assigned_routes=[],
                skill_bonuses={},
            )
            job = Job(
                job_number="EVIDENCE-JOB-1",
                job_type=JobType.INSTALLATION,
                status=JobStatus.IN_PROGRESS,
                customer_name="Client Evidence",
                required_skills=[],
            )
            db.add_all([technician, job])
            await db.flush()

            user = User(
                username="evidence-tech",
                email="evidence-tech@example.invalid",
                password_hash="not-used",
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=technician.id,
            )
            db.add(user)
            await db.flush()

            db.add(
                ApplicationSetting(
                    namespace="operational",
                    schema_version=1,
                    revision=1,
                    values={
                        "completion_policy": {
                            "default": {
                                "require_client_signature": True,
                                "require_gps": True,
                                "minimum_photos": 1,
                            }
                        }
                    },
                )
            )
            await db.commit()

            before = await CompletionPolicy(db).evaluate(job)

            now = datetime.now(timezone.utc)
            db.add_all(
                [
                    TechnicianMedia(
                        media_id=str(uuid4()),
                        attachment_id=str(uuid4()),
                        user_id=user.id,
                        technician_id=technician.id,
                        job_id=job.id,
                        kind="signature",
                        storage_key="tech/signature/test.png",
                        original_filename="signature.png",
                        mime_type="image/png",
                        size_bytes=128,
                        sha256="a" * 64,
                        meta_data={},
                    ),
                    TechnicianMedia(
                        media_id=str(uuid4()),
                        attachment_id=str(uuid4()),
                        user_id=user.id,
                        technician_id=technician.id,
                        job_id=job.id,
                        kind="photo",
                        storage_key="tech/photo/test.jpg",
                        original_filename="terrain.jpg",
                        mime_type="image/jpeg",
                        size_bytes=256,
                        sha256="b" * 64,
                        meta_data={"photo_type": "after"},
                    ),
                    JobSiteObservation(
                        job_id=job.id,
                        observation_type="site_location",
                        latitude=33.5812,
                        longitude=-7.6234,
                        accuracy_m=4.2,
                        user_id=user.id,
                        technician_id=technician.id,
                        source="mobile",
                        resolution_status="unreviewed",
                        occurred_at=now,
                    ),
                ]
            )
            await db.commit()

            after = await CompletionPolicy(db).evaluate(job)
            return {
                "before_can_complete": before.can_complete,
                "before_blockers": list(before.blocking_requirements),
                "after_can_complete": after.can_complete,
                "after_blockers": list(after.blocking_requirements),
                "required_keys": list(after.required_field_keys),
            }
    finally:
        await engine.dispose()


def test_mobile_signature_photo_and_site_gps_are_first_class_completion_evidence():
    admin_url = _admin_url()
    database_name = f"bluevector_completion_evidence_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    try:
        result = asyncio.run(_exercise(_db_url(admin_url, database_name)))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["before_can_complete"] is False
    assert any("Signature client" in item for item in result["before_blockers"])
    assert any("Position GPS" in item for item in result["before_blockers"])
    assert any("photo" in item.lower() for item in result["before_blockers"])

    assert result["after_can_complete"] is True
    assert result["after_blockers"] == []
    assert set(result["required_keys"]) == {
        "client_signature",
        "gps",
        "photos",
    }
