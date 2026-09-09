"""PostgreSQL contract for GoVector cable preview + final zero-stock ledger."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes.tech_stock_v2 import get_technician_stock_history_v2
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
from backend.logic.final_cable_stock import commit_final_cable_stock
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
            _, exit1 = await send(
                event_id=uuid4(), event_type="cable_exit", meter=1400,
                segment="SEG-1", minute=5,
            )
            # Same logical segment corrected before Agent validation: 100 -> 92 m.
            _, corrected_exit1 = await send(
                event_id=uuid4(), event_type="cable_exit", meter=1408,
                segment="SEG-1", minute=6,
            )
            _, entry2 = await send(
                event_id=uuid4(), event_type="cable_entry", meter=300,
                segment="SEG-2", minute=10,
            )
            exit2_event, exit2 = await send(
                event_id=uuid4(), event_type="cable_exit", meter=250,
                segment="SEG-2", minute=15,
            )

            # Replay must not alter preview state or create stock movements.
            replay = await process_technician_sync_event(
                db,
                event=exit2_event,
                current_user=user,
            )
            await db.commit()

            pre_warehouse = await db.scalar(
                select(Warehouse).where(
                    Warehouse.code == technician_warehouse_code(technician.id)
                )
            )
            pre_movement_count = await db.scalar(
                select(func.count(StockMovement.id)).where(
                    StockMovement.job_id == job.id,
                    StockMovement.technician_id == technician.id,
                )
            )
            pre_consumption_count = await db.scalar(
                select(func.count(StockConsumption.id)).where(
                    StockConsumption.job_id == job.id,
                    StockConsumption.technician_id == technician.id,
                )
            )

            refreshed_job = await db.get(Job, job.id)
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

            final_summary = await commit_final_cable_stock(
                db,
                job_id=job.id,
                technician_id=technician.id,
                actor_user_id=user.id,
                occurred_at=started + timedelta(minutes=20),
            )
            await db.commit()
            # A retry of the finalizer itself must be harmless.
            replay_summary = await commit_final_cable_stock(
                db,
                job_id=job.id,
                technician_id=technician.id,
                actor_user_id=user.id,
                occurred_at=started + timedelta(minutes=21),
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
            consumption_count = await db.scalar(
                select(func.count(StockConsumption.id)).where(
                    StockConsumption.job_id == job.id,
                    StockConsumption.technician_id == technician.id,
                )
            )
            tablet_history = await get_technician_stock_history_v2(
                limit=100,
                db=db,
                current_user=user,
            )

            return {
                "statuses": [
                    entry1.status,
                    exit1.status,
                    corrected_exit1.status,
                    entry2.status,
                    exit2.status,
                ],
                "replay": replay.status,
                "pre_warehouse_exists": pre_warehouse is not None,
                "pre_movement_count": pre_movement_count,
                "pre_consumption_count": pre_consumption_count,
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
                "final_summary": final_summary,
                "replay_summary": replay_summary,
                "tablet_history_quantities": [row["quantity"] for row in tablet_history],
                "tablet_history_refs": [row["item_reference"] for row in tablet_history],
                "tablet_history_jobs": [row["job_number"] for row in tablet_history],
            }
    finally:
        await engine.dispose()


def test_zero_stock_cable_preview_correction_is_committed_only_once_at_finalization():
    admin_url = _admin_url()
    database_name = f"govector_cable_zero_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    try:
        result = asyncio.run(_exercise(_database_url(admin_url, database_name)))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["statuses"] == ["acknowledged"] * 5
    assert result["replay"] == "acknowledged"

    # Field work is preview-only: no stock context/ledger before final review.
    assert result["pre_warehouse_exists"] is False
    assert result["pre_movement_count"] == 0
    assert result["pre_consumption_count"] == 0

    # SEG-1 correction replaces 100 m with 92 m; SEG-2 contributes 50 m.
    assert result["job_total"] == 142
    assert result["computed_lengths"] == pytest.approx([100.0, 92.0, 50.0])
    assert result["last_payload_total"] == pytest.approx(142.0)
    assert result["last_by_type"]["FO64-TEST"] == pytest.approx(142.0)
    assert result["last_by_pose"]["CONDUITE_PEHD"] == pytest.approx(142.0)

    # Finalization creates the zero/unknown stock context and exactly two final
    # movements. Re-running the finalizer is idempotent and adds nothing.
    assert result["final_summary"] == {"segments": 2, "meters": 142}
    assert result["replay_summary"] == {"segments": 2, "meters": 142}
    assert result["warehouse_exists"] is True
    assert result["stock_quantity"] == 0
    assert result["stock_available"] == 0
    assert result["movement_quantities"] == [-92, -50]
    assert result["movement_refs"] == ["observed_unregistered", "observed_unregistered"]
    assert result["movement_after"] == [0, 0]
    assert result["consumption_count"] == 2

    # Tablet history is newest-first and strictly scoped to this technician.
    assert result["tablet_history_quantities"] == [-50, -92]
    assert result["tablet_history_refs"] == ["FO64-TEST", "FO64-TEST"]
    assert result["tablet_history_jobs"] == ["CAB-ZERO-JOB", "CAB-ZERO-JOB"]
