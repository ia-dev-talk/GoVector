"""Real PostgreSQL isolation contract for Agent terrain team access."""

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    Assignment,
    Base,
    FieldTeam,
    Job,
    JobStatus,
    JobType,
    Orienteur,
    Technician,
    UserRole,
)
from backend.logic.field_agent_access import (
    list_field_agent_team_jobs,
    require_field_agent_team_job,
)
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url,
    _create_database,
    _database_url,
    _drop_database,
    _sqlalchemy_url,
)


async def _exercise(database_url: str) -> dict:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with factory() as db:
            owner_a = Orienteur(name="Agent team A")
            owner_b = Orienteur(name="Agent team B")
            db.add_all([owner_a, owner_b])
            await db.flush()

            team_a = FieldTeam(name="Field team A", orienteur_id=owner_a.id)
            team_b = FieldTeam(name="Field team B", orienteur_id=owner_b.id)
            db.add_all([team_a, team_b])
            await db.flush()

            # Canonical team_id must win over stale legacy orienteur_id.
            tech_a = Technician(
                name="Tech A",
                employee_id="FIELD-A",
                home_latitude=33.58,
                home_longitude=-7.62,
                skills=[],
                assigned_routes=[],
                skill_bonuses={},
                team_id=team_a.id,
                orienteur_id=owner_b.id,  # deliberately stale/wrong legacy link
            )
            tech_b = Technician(
                name="Tech B",
                employee_id="FIELD-B",
                home_latitude=33.59,
                home_longitude=-7.61,
                skills=[],
                assigned_routes=[],
                skill_bonuses={},
                team_id=team_b.id,
                orienteur_id=owner_a.id,  # deliberately stale/wrong legacy link
            )
            db.add_all([tech_a, tech_b])
            await db.flush()

            job_a = Job(
                job_number="FIELD-AGENT-A",
                job_type=JobType.INSTALLATION,
                status=JobStatus.ASSIGNED,
                customer_name="Client A",
                route_criteria="CAS-A",
                operator="ORANGE",
                required_skills=[],
            )
            job_b = Job(
                job_number="FIELD-AGENT-B",
                job_type=JobType.INSTALLATION,
                status=JobStatus.ASSIGNED,
                customer_name="Client B",
                route_criteria="CAS-B",
                operator="ORANGE",
                required_skills=[],
            )
            db.add_all([job_a, job_b])
            await db.flush()

            assignment_a = Assignment(job_id=job_a.id, technician_id=tech_a.id)
            assignment_b = Assignment(job_id=job_b.id, technician_id=tech_b.id)
            db.add_all([assignment_a, assignment_b])
            await db.commit()

            agent_a = SimpleNamespace(
                id=9001,
                role=UserRole.CHEF_ORIENTEUR,
                orienteur_id=owner_a.id,
                technician_id=None,
            )

            contexts = await list_field_agent_team_jobs(db, current_user=agent_a)
            initial_ids = [context.job.id for context in contexts]
            owned = await require_field_agent_team_job(
                db,
                job_id=job_a.id,
                current_user=agent_a,
            )

            foreign_code = None
            try:
                await require_field_agent_team_job(
                    db,
                    job_id=job_b.id,
                    current_user=agent_a,
                )
            except TechnicianJobMutationError as exc:
                foreign_code = exc.code

            # Simulate central-office reassignment of A to technician/team B.
            assignment_a.ended_at = datetime.now(timezone.utc)
            db.add(Assignment(job_id=job_a.id, technician_id=tech_b.id))
            await db.commit()

            post_reassign_code = None
            try:
                await require_field_agent_team_job(
                    db,
                    job_id=job_a.id,
                    current_user=agent_a,
                )
            except TechnicianJobMutationError as exc:
                post_reassign_code = exc.code

            return {
                "job_a": job_a.id,
                "initial_ids": initial_ids,
                "owned_technician": owned.technician.id,
                "tech_a": tech_a.id,
                "foreign_code": foreign_code,
                "post_reassign_code": post_reassign_code,
            }
    finally:
        await engine.dispose()


def test_field_agent_team_scope_uses_canonical_team_and_tracks_reassignment():
    admin_url = _admin_url()
    database_name = f"bluevector_field_agent_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        result = asyncio.run(_exercise(database_url))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["initial_ids"] == [result["job_a"]]
    assert result["owned_technician"] == result["tech_a"]
    assert result["foreign_code"] == "field_agent_team_forbidden"
    assert result["post_reassign_code"] == "field_agent_team_forbidden"
