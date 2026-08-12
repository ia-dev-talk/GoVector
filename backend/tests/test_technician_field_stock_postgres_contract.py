"""Real PostgreSQL contracts for connected technician field workflows."""

import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.schemas.tech_sync import TechnicianSyncEventRequest
from backend.database.models import (
    Assignment,
    Base,
    EquipmentInventory,
    Job,
    JobStatus,
    JobType,
    Stock,
    StockConsumption,
    StockItem,
    StockMovement,
    Technician,
    TechnicianFieldAction,
    TechnicianSyncEvent,
    User,
    UserRole,
    Warehouse,
)
from backend.logic.technician_sync import process_technician_sync_event


ADMIN_URL_ENV = "BLUEVECTOR_POSTGRES_CONTRACT_ADMIN_URL"


def _admin_url() -> str:
    value = os.getenv(ADMIN_URL_ENV)
    if not value:
        pytest.skip(f"{ADMIN_URL_ENV} is not configured")
    return value.replace("postgresql+asyncpg://", "postgresql://", 1)


def _database_url(admin_url: str, database_name: str) -> str:
    return f"{admin_url.rsplit('/', 1)[0]}/{database_name}"


def _sqlalchemy_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


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


async def _seed(db):
    technician = Technician(
        name="Technicien Field Test",
        employee_id="FIELD-TECH-1",
        email="field-tech@example.invalid",
        home_latitude=33.58,
        home_longitude=-7.62,
        skills=["INSTALLATION"],
        assigned_routes=["CAS-TEST"],
        skill_bonuses={},
    )
    job = Job(
        job_number="FIELD-JOB-1",
        job_type=JobType.INSTALLATION,
        status=JobStatus.ASSIGNED,
        customer_name="Client Field Test",
        route_criteria="CAS-TEST",
        operator="ORANGE",
        required_skills=[],
    )
    db.add_all([technician, job])
    await db.flush()

    user = User(
        username="field-tech-user",
        email="field-tech-user@example.invalid",
        password_hash="not-used",
        role=UserRole.TECHNICIAN,
        is_active=True,
        technician_id=technician.id,
    )
    assignment = Assignment(
        job_id=job.id,
        technician_id=technician.id,
    )
    warehouse = Warehouse(
        name=f"Garde technicien {technician.id}",
        code=f"TECH-{technician.id}",
        type="TECHNICIEN",
        is_active=True,
    )
    item = StockItem(
        reference="ROUTER-ORANGE-HG8245",
        label="Routeur Orange HG8245",
        equipment_type="ROUTEUR",
        operator="ORANGE",
        manufacturer="Huawei",
        model="HG8245",
        unit="unité",
        is_active=True,
    )
    serialized = EquipmentInventory(
        serial_number="ROUTER-SN-0001",
        mac_address="AA:BB:CC:DD:EE:01",
        operator="ORANGE",
        equipment_type="ROUTEUR",
        model="HG8245",
        status="STOCK",
        warehouse=f"TECH-{technician.id}",
    )
    mismatch = EquipmentInventory(
        serial_number="IAM-SN-0001",
        operator="IAM",
        equipment_type="ROUTEUR",
        model="TEST-IAM",
        status="STOCK",
        warehouse=f"TECH-{technician.id}",
    )
    db.add_all([user, assignment, warehouse, item, serialized, mismatch])
    await db.flush()
    db.add(
        Stock(
            item_id=item.id,
            warehouse_id=warehouse.id,
            quantity=5,
            reserved_quantity=0,
            available_quantity=5,
        )
    )
    await db.commit()
    return technician, user, job, warehouse, item, serialized, mismatch


async def _exercise(database_url: str) -> dict:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with session_factory() as db:
            technician, user, job, warehouse, item, serialized, mismatch = await _seed(db)

            material_event_id = uuid4()
            material_event = TechnicianSyncEventRequest(
                event_id=material_event_id,
                schema_version=1,
                job_id=job.id,
                type="material_used",
                occurred_at=datetime.now(timezone.utc),
                payload={
                    "items": [
                        {
                            "item_id": item.id,
                            "quantity": 2,
                            "reference": item.reference,
                            "label": item.label,
                            "operator": item.operator,
                        }
                    ],
                    "value": "2× Routeur Orange HG8245",
                },
            )
            first = await process_technician_sync_event(
                db,
                event=material_event,
                current_user=user,
            )
            await db.commit()
            replay = await process_technician_sync_event(
                db,
                event=material_event,
                current_user=user,
            )
            await db.commit()

            stock = await db.scalar(
                select(Stock).where(
                    Stock.item_id == item.id,
                    Stock.warehouse_id == warehouse.id,
                )
            )
            consumption_count = await db.scalar(select(func.count(StockConsumption.id)))
            movement_count = await db.scalar(
                select(func.count(StockMovement.id)).where(
                    StockMovement.job_id == job.id,
                    StockMovement.technician_id == technician.id,
                )
            )
            material_action_count = await db.scalar(
                select(func.count(TechnicianFieldAction.id)).where(
                    TechnicianFieldAction.event_id == str(material_event_id)
                )
            )
            receipt_count = await db.scalar(
                select(func.count(TechnicianSyncEvent.id)).where(
                    TechnicianSyncEvent.event_id == str(material_event_id)
                )
            )

            scan_event = TechnicianSyncEventRequest(
                event_id=uuid4(),
                schema_version=1,
                job_id=job.id,
                type="equipment_scan",
                occurred_at=datetime.now(timezone.utc),
                payload={"code": "SN=ROUTER-SN-0001"},
            )
            scan = await process_technician_sync_event(
                db,
                event=scan_event,
                current_user=user,
            )
            await db.commit()
            refreshed_job = await db.get(Job, job.id)
            refreshed_serialized = await db.get(EquipmentInventory, serialized.id)
            scan_action = await db.scalar(
                select(TechnicianFieldAction).where(
                    TechnicianFieldAction.event_id == str(scan_event.event_id)
                )
            )

            mismatch_event = TechnicianSyncEventRequest(
                event_id=uuid4(),
                schema_version=1,
                job_id=job.id,
                type="equipment_scan",
                occurred_at=datetime.now(timezone.utc),
                payload={"code": "SN=IAM-SN-0001"},
            )
            mismatch_result = await process_technician_sync_event(
                db,
                event=mismatch_event,
                current_user=user,
            )
            await db.commit()
            refreshed_mismatch = await db.get(EquipmentInventory, mismatch.id)

            unknown_event = TechnicianSyncEventRequest(
                event_id=uuid4(),
                schema_version=1,
                job_id=job.id,
                type="equipment_scan",
                occurred_at=datetime.now(timezone.utc),
                payload={"code": "UNKNOWN-RAW-CODE-123"},
            )
            unknown_result = await process_technician_sync_event(
                db,
                event=unknown_event,
                current_user=user,
            )
            await db.commit()
            unknown_action = await db.scalar(
                select(TechnicianFieldAction).where(
                    TechnicianFieldAction.event_id == str(unknown_event.event_id)
                )
            )

            optical_event = TechnicianSyncEventRequest(
                event_id=uuid4(),
                schema_version=1,
                job_id=job.id,
                type="field_measurement",
                occurred_at=datetime.now(timezone.utc),
                payload={
                    "measurement_type": "optical_power",
                    "value": "-18.75",
                },
            )
            optical_result = await process_technician_sync_event(
                db,
                event=optical_event,
                current_user=user,
            )
            await db.commit()

            cable_event = TechnicianSyncEventRequest(
                event_id=uuid4(),
                schema_version=1,
                job_id=job.id,
                type="field_measurement",
                occurred_at=datetime.now(timezone.utc),
                payload={
                    "measurement_type": "cable_length",
                    "value": "42.4",
                },
            )
            cable_result = await process_technician_sync_event(
                db,
                event=cable_event,
                current_user=user,
            )
            await db.commit()
            measured_job = await db.get(Job, job.id)
            optical_action = await db.scalar(
                select(TechnicianFieldAction).where(
                    TechnicianFieldAction.event_id == str(optical_event.event_id)
                )
            )
            cable_action = await db.scalar(
                select(TechnicianFieldAction).where(
                    TechnicianFieldAction.event_id == str(cable_event.event_id)
                )
            )

            return {
                "material_first": first.status,
                "material_replay": replay.status,
                "quantity": stock.quantity,
                "available": stock.available_quantity,
                "consumption_count": consumption_count,
                "movement_count": movement_count,
                "material_action_count": material_action_count,
                "receipt_count": receipt_count,
                "scan_status": scan.status,
                "router_serial": refreshed_job.router_serial,
                "serialized_job": refreshed_serialized.assigned_job_id,
                "serialized_status": refreshed_serialized.status,
                "scan_operator": (scan_action.payload or {}).get("operator"),
                "scan_confidence": (scan_action.payload or {}).get("confidence"),
                "mismatch_status": mismatch_result.status,
                "mismatch_code": mismatch_result.code,
                "mismatch_job": refreshed_mismatch.assigned_job_id,
                "unknown_status": unknown_result.status,
                "unknown_confidence": (unknown_action.payload or {}).get("confidence"),
                "optical_status": optical_result.status,
                "cable_status": cable_result.status,
                "optical_power_dbm": measured_job.optical_power_dbm,
                "cable_length_m": measured_job.cable_length_m,
                "optical_unit": (optical_action.payload or {}).get("unit"),
                "cable_unit": (cable_action.payload or {}).get("unit"),
            }
    finally:
        await engine.dispose()


def test_mobile_field_workflows_are_atomic_connected_and_idempotent():
    admin_url = _admin_url()
    database_name = f"bluevector_field_stock_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        result = asyncio.run(_exercise(database_url))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["material_first"] == "acknowledged"
    assert result["material_replay"] == "acknowledged"
    assert result["quantity"] == 3
    assert result["available"] == 3
    assert result["consumption_count"] == 1
    assert result["movement_count"] == 1
    assert result["material_action_count"] == 1
    assert result["receipt_count"] == 1

    assert result["scan_status"] == "acknowledged"
    assert result["router_serial"] == "ROUTER-SN-0001"
    assert result["serialized_job"] is not None
    assert result["serialized_status"] == "IN_USE"
    assert result["scan_operator"] == "ORANGE"
    assert result["scan_confidence"] == "verified"

    assert result["mismatch_status"] == "conflict"
    assert result["mismatch_code"] == "operator_mismatch"
    assert result["mismatch_job"] is None

    assert result["unknown_status"] == "acknowledged"
    assert result["unknown_confidence"] == "unverified"

    assert result["optical_status"] == "acknowledged"
    assert result["cable_status"] == "acknowledged"
    assert result["optical_power_dbm"] == pytest.approx(-18.75)
    assert result["cable_length_m"] == 42
    assert result["optical_unit"] == "dBm"
    assert result["cable_unit"] == "m"
