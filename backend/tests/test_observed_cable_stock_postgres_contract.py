"""Real PostgreSQL contract for the physical GoVector cable CODE workflow."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    Assignment,
    Base,
    CableDrum,
    CableDrumAssignment,
    CableDrumConsumption,
    Job,
    JobStatus,
    JobType,
    Technician,
    User,
    UserRole,
)
from backend.logic.cable_drums import assign_drum, get_assigned_drum, record_consumption
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
            technicians = [
                Technician(
                    name="Amine Benali",
                    employee_id="CABLE-TECH-1",
                    home_latitude=33.58,
                    home_longitude=-7.62,
                    skills=[],
                    assigned_routes=[],
                    skill_bonuses={},
                ),
                Technician(
                    name="Nabil Lkhair",
                    employee_id="CABLE-TECH-2",
                    home_latitude=33.58,
                    home_longitude=-7.62,
                    skills=[],
                    assigned_routes=[],
                    skill_bonuses={},
                ),
            ]
            db.add_all(technicians)
            await db.flush()
            office = User(
                username="cable-office",
                email="cable-office@example.invalid",
                password_hash="not-used",
                role=UserRole.ORIENTEUR,
                is_active=True,
            )
            jobs = [
                Job(
                    job_number="CM-4475-A",
                    job_type=JobType.INSTALLATION,
                    status=JobStatus.IN_PROGRESS,
                    customer_name="Client A",
                    required_skills=[],
                ),
                Job(
                    job_number="CM-4475-B",
                    job_type=JobType.INSTALLATION,
                    status=JobStatus.IN_PROGRESS,
                    customer_name="Client B",
                    required_skills=[],
                ),
                Job(
                    job_number="CM-9281",
                    job_type=JobType.INSTALLATION,
                    status=JobStatus.IN_PROGRESS,
                    customer_name="Client C",
                    required_skills=[],
                ),
            ]
            db.add_all([office, *jobs])
            await db.flush()
            db.add_all(
                [
                    Assignment(job_id=jobs[0].id, technician_id=technicians[0].id),
                    Assignment(job_id=jobs[1].id, technician_id=technicians[0].id),
                    Assignment(job_id=jobs[2].id, technician_id=technicians[1].id),
                ]
            )
            drums = [
                CableDrum(
                    code="4475",
                    cable_type="FO16",
                    current_mark_m=2003,
                    status="ACTIVE",
                    assigned_technician_id=technicians[0].id,
                    created_by_user_id=office.id,
                ),
                CableDrum(
                    code="9281",
                    cable_type="FO64",
                    current_mark_m=1320,
                    status="ACTIVE",
                    assigned_technician_id=technicians[1].id,
                    created_by_user_id=office.id,
                ),
            ]
            db.add_all(drums)
            await db.flush()
            db.add_all(
                [
                    CableDrumAssignment(
                        drum_id=drums[0].id,
                        technician_id=technicians[0].id,
                        assigned_by_user_id=office.id,
                    ),
                    CableDrumAssignment(
                        drum_id=drums[1].id,
                        technician_id=technicians[1].id,
                        assigned_by_user_id=office.id,
                    ),
                ]
            )
            await db.commit()

            now = datetime.now(timezone.utc)
            first = await record_consumption(
                db,
                event_id="4475-first",
                job_id=jobs[0].id,
                technician_id=technicians[0].id,
                payload={
                    "cable_code": "4475",
                    "cable_type_code": "FO16",
                    "cable_entry_meter_m": 2003,
                    "cable_exit_meter_m": 1921,
                    "installation_mode_code": "SP",
                },
                occurred_at=now,
            )
            second = await record_consumption(
                db,
                event_id="4475-second",
                job_id=jobs[1].id,
                technician_id=technicians[0].id,
                payload={
                    "cable_code": "4475",
                    "cable_type_code": "FO16",
                    "cable_entry_meter_m": 1921,
                    "cable_exit_meter_m": 1771,
                    "installation_mode_code": "TR",
                },
                occurred_at=now,
            )
            replay = await record_consumption(
                db,
                event_id="4475-second",
                job_id=jobs[1].id,
                technician_id=technicians[0].id,
                payload={
                    "cable_code": "4475",
                    "cable_type_code": "FO16",
                    "cable_entry_meter_m": 1921,
                    "cable_exit_meter_m": 1771,
                    "installation_mode_code": "TR",
                },
                occurred_at=now,
            )
            third = await record_consumption(
                db,
                event_id="9281-first",
                job_id=jobs[2].id,
                technician_id=technicians[1].id,
                payload={
                    "cable_code": "9281",
                    "cable_type_code": "FO64",
                    "cable_entry_meter_m": 1320,
                    "cable_exit_meter_m": 1264,
                    "installation_mode_code": "FSD",
                },
                occurred_at=now,
            )
            await db.commit()

            concurrency_code = None
            try:
                await get_assigned_drum(
                    db,
                    code="4475",
                    technician_id=technicians[1].id,
                )
            except TechnicianJobMutationError as exc:
                concurrency_code = exc.code

            continuity_code = None
            try:
                await record_consumption(
                    db,
                    event_id="4475-gap",
                    job_id=jobs[1].id,
                    technician_id=technicians[0].id,
                    payload={
                        "cable_code": "4475",
                        "cable_type_code": "FO16",
                        "cable_entry_meter_m": 1700,
                        "cable_exit_meter_m": 1650,
                        "installation_mode_code": "SP",
                    },
                    occurred_at=now,
                )
            except TechnicianJobMutationError as exc:
                continuity_code = exc.code

            drum_4475 = await db.scalar(select(CableDrum).where(CableDrum.code == "4475"))
            drum_9281 = await db.scalar(select(CableDrum).where(CableDrum.code == "9281"))
            history_4475 = (
                await db.execute(
                    select(CableDrumConsumption)
                    .where(CableDrumConsumption.cable_code == "4475")
                    .order_by(CableDrumConsumption.id)
                )
            ).scalars().all()
            count_4475 = await db.scalar(
                select(func.count(CableDrumConsumption.id)).where(
                    CableDrumConsumption.cable_code == "4475"
                )
            )

            replacement = CableDrum(
                code="4475-B",
                cable_type="FO16",
                current_mark_m=1000,
                status="ACTIVE",
                created_by_user_id=office.id,
            )
            db.add(replacement)
            await db.flush()
            await assign_drum(
                db,
                drum=replacement,
                technician_id=technicians[0].id,
                actor_user_id=office.id,
                reason="Nouvelle bobine après clôture de la précédente",
            )
            await db.commit()

            return {
                "first": first.quantity_m,
                "second": second.quantity_m,
                "replay_same_id": replay.id == second.id,
                "third": third.quantity_m,
                "mark_4475": drum_4475.current_mark_m,
                "mark_9281": drum_9281.current_mark_m,
                "history_quantities": [item.quantity_m for item in history_4475],
                "history_modes": [item.installation_mode for item in history_4475],
                "history_count": count_4475,
                "concurrency_code": concurrency_code,
                "continuity_code": continuity_code,
                "replacement_technician_id": replacement.assigned_technician_id,
            }
    finally:
        await engine.dispose()


def test_physical_code_remainder_history_idempotency_and_concurrency():
    admin_url = _admin_url()
    database_name = f"govector_cable_code_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    try:
        result = asyncio.run(_exercise(_database_url(admin_url, database_name)))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["first"] == 82
    assert result["second"] == 150
    assert result["replay_same_id"] is True
    assert result["mark_4475"] == 1771
    assert result["history_quantities"] == [82, 150]
    assert result["history_modes"] == ["SP", "TR"]
    assert result["history_count"] == 2
    assert result["third"] == 56
    assert result["mark_9281"] == 1264
    assert result["concurrency_code"] == "cable_not_assigned"
    assert result["continuity_code"] == "cable_continuity_mismatch"
    assert result["replacement_technician_id"] is not None
