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
    FieldTeam,
    FieldTeamSector,
    GPSHistory,
    Job,
    JobSiteObservation,
    JobStatus,
    JobType,
    JobVisit,
    Orienteur,
    Sector,
    Site,
    Technician,
    TechnicianFieldAction,
    TechnicianLiveStatus,
    User,
    UserRole,
)
from backend.logic.technician_field_actions import record_technician_field_action
from backend.logic import assignments as assignment_logic
from backend.logic.technician_jobs import (
    accept_and_start_technician_job,
    fail_technician_job,
)
from backend.logic.workflow.engine import WorkflowEngine


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


async def _create_assignment_scope(db, *, suffix: str):
    """Create the canonical sector/team/planning prerequisites for assignment tests."""
    sector = Sector(name=f"Secteur test {suffix}", is_active=True)
    db.add(sector)
    await db.flush()
    orienteur = Orienteur(
        name=f"Orienteur test {suffix}",
        email=f"orienteur.{suffix.lower()}@example.invalid",
        sector_id=sector.id,
        is_active=True,
    )
    db.add(orienteur)
    await db.flush()
    team = FieldTeam(
        name=f"Equipe test {suffix}",
        code=f"TEAM-{suffix}",
        orienteur_id=orienteur.id,
        is_active=True,
    )
    db.add(team)
    await db.flush()
    db.add(FieldTeamSector(team_id=team.id, sector_id=sector.id))
    await db.flush()
    return sector, orienteur, team


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

        gps_count = await db.scalar(select(func.count()).select_from(GPSHistory))
        action_count = await db.scalar(
            select(func.count()).select_from(TechnicianFieldAction)
        )
        observation_count = await db.scalar(
            select(func.count()).select_from(JobSiteObservation)
        )
        assert gps_count == 1
        assert action_count == 3
        assert observation_count == 3
        assert job.site_id is not None
        site = await db.scalar(select(Site).where(Site.id == job.site_id))
        assert site is not None
        assert site.canonical_latitude == pytest.approx(33.5732)
        assert site.canonical_longitude == pytest.approx(-7.5897)
        assert site.location_source == "technician_confirmed"
        assert site.revision == 1

        observations = (
            await db.execute(
                select(JobSiteObservation).order_by(JobSiteObservation.id)
            )
        ).scalars().all()
        assert all(item.site_id == site.id for item in observations)
        assert observations[0].resolution_status == "accepted"
        assert [item.resolution_status for item in observations[1:]] == [
            "unreviewed",
            "unreviewed",
        ]

        record = await job_context.get_field_record(
            job.id,
            db=db,
            current_user=user,
        )
        assert record["planned_location"]["latitude"] is None
        assert record["planned_location"]["longitude"] is None
        assert record["field_reference_location"]["latitude"] == 33.5732
        assert record["field_reference_location"]["origin"] == "canonical_site"
        assert record["site"]["id"] == site.id
        assert {item["type"] for item in record["site_observations"]} == {
            "site_location",
            "cable_entry",
            "cable_exit",
        }


@pytest.mark.asyncio
async def test_postgres_preserves_each_visit_and_assignment_after_retry(
    postgres_session_factory,
    monkeypatch,
):
    monkeypatch.setattr(WorkflowEngine, "_broadcast", AsyncMock())
    async with postgres_session_factory() as db:
        sector, orienteur, team = await _create_assignment_scope(db, suffix="VISIT")
        first_technician = Technician(
            name="Premier technicien",
            employee_id="B1-VISIT-A",
            home_latitude=33.57,
            home_longitude=-7.59,
            orienteur_id=orienteur.id,
            team_id=team.id,
        )
        second_technician = Technician(
            name="Technicien reprise",
            employee_id="B1-VISIT-B",
            home_latitude=33.58,
            home_longitude=-7.60,
            orienteur_id=orienteur.id,
            team_id=team.id,
        )
        db.add_all([first_technician, second_technician])
        await db.flush()
        first_user = User(
            username="visit.first",
            email="visit.first@bluevector.test",
            password_hash="not-used",
            role=UserRole.TECHNICIAN,
            technician_id=first_technician.id,
        )
        job = Job(
            job_type=JobType.DEPANNAGE,
            status=JobStatus.PENDING,
            service_address="Site multi-passage",
            sector_id=sector.id,
            scheduled_date=datetime(2026, 9, 14, 9, 0, tzinfo=timezone.utc),
        )
        db.add_all([first_user, job])
        await db.commit()

        first_assignment = await assignment_logic.create_assignment(
            db,
            job_id=job.id,
            technician_id=first_technician.id,
        )
        await accept_and_start_technician_job(
            db,
            job_id=job.id,
            payload={},
            current_user=first_user,
        )
        await fail_technician_job(
            db,
            job_id=job.id,
            payload={"reason": "Accès impossible"},
            current_user=first_user,
        )
        await db.commit()

        await db.refresh(first_assignment)
        assert first_assignment.ended_at is not None
        assert first_assignment.end_reason == JobStatus.FAILED.value
        first_visit_id = first_assignment.visit_id

        second_assignment = await assignment_logic.create_assignment(
            db,
            job_id=job.id,
            technician_id=second_technician.id,
        )
        await db.commit()

        assignments = (
            await db.execute(
                select(Assignment)
                .where(Assignment.job_id == job.id)
                .order_by(Assignment.assigned_at.asc(), Assignment.id.asc())
            )
        ).scalars().all()
        visits = (
            await db.execute(
                select(JobVisit)
                .where(JobVisit.job_id == job.id)
                .order_by(JobVisit.attempt_number.asc())
            )
        ).scalars().all()

        assert [visit.attempt_number for visit in visits] == [1, 2]
        assert visits[0].id == first_visit_id
        assert visits[0].outcome == JobStatus.FAILED.value
        assert visits[0].ended_at is not None
        assert visits[1].ended_at is None
        assert len(assignments) == 2
        assert assignments[0].technician_id == first_technician.id
        assert assignments[0].ended_at is not None
        assert assignments[1].id == second_assignment.id
        assert assignments[1].technician_id == second_technician.id
        assert assignments[1].ended_at is None


@pytest.mark.asyncio
async def test_reassignment_closes_old_visit_and_exposes_new_current_attempt(
    postgres_session_factory,
    monkeypatch,
):
    monkeypatch.setattr(WorkflowEngine, "_broadcast", AsyncMock())
    async with postgres_session_factory() as db:
        sector, orienteur, team = await _create_assignment_scope(db, suffix="REASSIGN")
        karim = Technician(
            name="Karim Tazi",
            employee_id="B1-REASSIGN-KARIM",
            home_latitude=33.57,
            home_longitude=-7.59,
            orienteur_id=orienteur.id,
            team_id=team.id,
        )
        khadija = Technician(
            name="Khadija El Harti",
            employee_id="B1-REASSIGN-KHADIJA",
            home_latitude=33.58,
            home_longitude=-7.60,
            orienteur_id=orienteur.id,
            team_id=team.id,
        )
        db.add_all([karim, khadija])
        await db.flush()
        admin = User(
            username="visit.reassignment.admin",
            email="visit.reassignment.admin@bluevector.test",
            password_hash="not-used",
            role=UserRole.ADMIN,
        )
        job = Job(
            job_type=JobType.DEPANNAGE,
            status=JobStatus.PENDING,
            service_address="Intervention 31",
            sector_id=sector.id,
            scheduled_date=datetime(2026, 9, 14, 11, 0, tzinfo=timezone.utc),
        )
        db.add_all([admin, job])
        await db.commit()

        await assignment_logic.create_assignment(
            db,
            job_id=job.id,
            technician_id=karim.id,
        )
        await WorkflowEngine(db).transition_job(
            job,
            JobStatus.ACCEPTED,
            technician_id=karim.id,
            broadcast=False,
        )
        await db.commit()

        await assignment_logic.reassign_job(
            db,
            job_id=job.id,
            new_technician_id=khadija.id,
        )

        visits = (
            await db.execute(
                select(JobVisit)
                .where(JobVisit.job_id == job.id)
                .order_by(JobVisit.attempt_number.asc())
            )
        ).scalars().all()
        assert len(visits) == 2
        assert visits[0].primary_technician_id == karim.id
        assert visits[0].outcome == "reassigned"
        assert visits[0].ended_at is not None
        assert visits[1].primary_technician_id == khadija.id
        assert visits[1].ended_at is None

        record = await job_context.get_field_record(
            job.id,
            db=db,
            current_user=admin,
        )
        assert record["current_assignment"]["technician_name"] == "Khadija El Harti"
        assert record["visits"][0]["is_historical"] is True
        assert record["visits"][0]["status_label"] == "Réaffecté"
        assert record["visits"][1]["is_current"] is True
