"""PostgreSQL contract for GoVector automatic cable metrics + zero-stock history."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.schemas.tech_sync import TechnicianSyncEventRequest
from backend.database.models import (
    Assignment,
    Base,
    Job,
    JobStatus,
    JobType,
    Stock,
    StockConsumption,
    StockItem,
    StockMovement,
    Technician,
    TechnicianFieldAction,
    User,
    UserRole,
    Warehouse,
)
from backend.logic.technician_stock import technician_warehouse_code
from backend.logic.technician_sync import process_technician_sync_event
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
            technician = Technician(
                name="Technicien câble sans dotation",
                employee_id="CAB-ZERO-1",
                email="cab-zero@example.invalid",
                home_latitude=33.58,
                home_longitude=-7.62,
                skills=["FIBER"],
                assigned_routes=["CAS-CABLE"],
                skill_bonuses={},
            )
            job = Job(
                job_number="CAB-ZERO-JOB",
                job_type=JobType.INSTALLATION,
                status=JobStatus.ASSIGNED,
                customer_name="Client câble",
                operator="ORANGE",
                required_skills=[],
            )
            cable = StockItem(
                reference="FO64-TEST",
                label="Câble FO64 test",
                equipment_type="CABLE_FTTH",
                operator="ORANGE",
                unit="m",
                is_active=True,
            )
            db.add_all([technician, job, cable])
            await db.flush()
            user = User(
                username="cab-zero-user",
                email="cab-zero-user@example.invalid",
                password_hash="not-used",
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=technician.id,
            )
            db.add_all(
                [
                    user,
                    Assignment(job_id=job.id, technician_id=technician.id),
                ]
            )
            await db.commit()

            assert await db.scalar(
                select(Warehouse).where(
                    Warehouse.code == technician_warehouse_code(technician.id)
                )
            ) is None

            started = datetime(2030, 1, 15, 12, 0, tzinfo=timezone.utc)

            async def send(*, event_id, event_type, meter, segment, minute):
                event = TechnicianSyncEventRequest(
                    event_id=event_id,
                    schema_version=1,
                    job_id=job.id,
                    type=event_type,
                    occurred_at=started + timedelta(minutes=minute),
                    payload={
                        "cable_item_id": cable.id,
                        "cable_segment_id": segment,
                        "installation_mode_code": "CONDUITE_PEHD",
                        "meter_mark_m": meter,
                        "latitude": 33.5800 + minute / 10000,
                        "longitude": -7.6200 - minute / 10000,
                        "accuracy": 5.0,
                    },
                )
                result = await process_technician_sync_event(
                    db,
                    event=event,
                    current_user=user,
                )
                await db.commit()
                return event, result

            _, entry1 = await send(
                event_id=uuid4(), event_type="cable_entry", meter=1500,
                segment="SEG-1", minute=0,
            )
            exit1_event, exit1 = await send(
                event_id=uuid4(), event_type="cable_exit", meter=1400,
                segment="SEG-1", minute=5,
            )
            _, entry2 = await send(
                event_id=uuid4(), event_type="cable_entry", meter=300,
                segment="SEG-2", minute=10,
            )
            exit2_event, exit2 = await send(
                event_id=uuid4(), event_type="cable_exit", meter=250,
                segment="SEG-2", minute=15,
            )

            # Replay must not consume a second time.
            replay = await process_technician_sync_event(
                db,
                event=exit2_event,
                current_user=user,
            )
            await db.commit()

            warehouse = await db.scalar(
                select(Warehouse).where(
                    Warehouse.code == technician_warehouse_code(technician.id)
                )
            )
            stock = await db.scalar(
                select(Stock).where(
                    Stock.warehouse_id == warehouse.id,
                    Stock.item_id == cable.id,
                )
            )
            refreshed_job = await db.get(Job, job.id)
            movements = (
                await db.execute(
                    select(StockMovement)
                    .where(
                        StockMovement.job_id == job.id,
                        StockMovement.technician_id == technician.id,
                        StockMovement.item_id == cable.id,
                    )
                    .order_by(StockMovement.id.asc())
                )
            ).scalars().all()
            actions = (
                await db.execute(
                    select(TechnicianFieldAction)
                    .where(
                        TechnicianFieldAction.job_id == job.id,
                        TechnicianFieldAction.action_type.in_(("cable_entry", "cable_exit")),
                    )
                    .order_by(TechnicianFieldAction.occurred_at.asc())
                )
            ).scalars().all()
            computed = [
                action.payload
                for action in actions
                if isinstance(action.payload, dict)
                and action.payload.get("computed_length_m") is not None
            ]
            consumption_count = await db.scalar(
                select(func.count(StockConsumption.id)).where(
                    StockConsumption.job_id == job.id,
                    StockConsumption.technician_id == technician.id,
                )
            )

            return {
                "statuses": [entry1.status, exit1.status, entry2.status, exit2.status],
                "replay": replay.status,
                "warehouse_exists": warehouse is not None,
                "stock_quantity": stock.quantity,
                "stock_available": stock.available_quantity,
                "movement_quantities": [row.quantity for row in movements],
                "movement_refs": [row.reference_type for row in movements],
                "movement_after": [row.quantity_after for row in movements],
                "consumption_count": consumption_count,
                "job_total": refreshed_job.cable_length_m,
                "computed_lengths": [row["computed_length_m"] for row in computed],
                "last_payload_total": computed[-1]["job_cable_total_m"],
                "last_by_type": computed[-1]["job_cable_totals_by_type"],
                "last_by_pose": computed[-1]["job_cable_totals_by_pose"],
                "exit1_event": str(exit1_event.event_id),
            }
    finally:
        await engine.dispose()


def test_zero_stock_cable_use_is_calculated_aggregated_and_traced():
    admin_url = _admin_url()
    database_name = f"govector_cable_zero_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    try:
        result = asyncio.run(_exercise(_database_url(admin_url, database_name)))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["statuses"] == ["acknowledged"] * 4
    assert result["replay"] == "acknowledged"
    assert result["warehouse_exists"] is True
    assert result["stock_quantity"] == 0
    assert result["stock_available"] == 0
    assert result["movement_quantities"] == [-100, -50]
    assert result["movement_refs"] == ["observed_unregistered", "observed_unregistered"]
    assert result["movement_after"] == [0, 0]
    assert result["consumption_count"] == 2
    assert result["job_total"] == 150
    assert result["computed_lengths"] == pytest.approx([100.0, 50.0])
    assert result["last_payload_total"] == pytest.approx(150.0)
    assert result["last_by_type"]["FO64-TEST"] == pytest.approx(150.0)
    assert result["last_by_pose"]["CONDUITE_PEHD"] == pytest.approx(150.0)
