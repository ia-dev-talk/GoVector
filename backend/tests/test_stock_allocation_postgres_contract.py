"""Real PostgreSQL contract for public-V2 technician stock allocation."""

import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

import asyncpg
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes.stock_v2_patch import validate_issue_to_technician_custody
from backend.database.models import (
    Base,
    Stock,
    StockIssue,
    StockIssueItem,
    StockIssueStatus,
    StockItem,
    StockMovement,
    Technician,
    User,
    UserRole,
    Warehouse,
)


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


async def _exercise(database_url: str) -> dict:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with session_factory() as db:
            technician = Technician(
                name="Karim Test",
                employee_id="ALLOC-TECH-1",
                email="karim.test@example.invalid",
                home_latitude=33.58,
                home_longitude=-7.62,
                skills=["install"],
                assigned_routes=["CAS-TEST"],
                skill_bonuses={},
            )
            source = Warehouse(
                name="Dépôt Test Allocation",
                code="DEP-ALLOC",
                type="ENTREPOT",
                city="Casablanca",
                is_active=True,
            )
            item = StockItem(
                reference="ALLOC-ITEM-1",
                label="ONT allocation test",
                equipment_type="ONT",
                operator="TEST",
                unit="unité",
                is_active=True,
            )
            db.add_all([technician, source, item])
            await db.flush()

            user = User(
                username="allocation-admin",
                email="allocation-admin@example.invalid",
                password_hash="not-used-by-this-contract-test",
                role=UserRole.ADMIN,
                is_active=True,
            )
            batch_a_expiry = datetime(2026, 9, 1, tzinfo=timezone.utc)
            batch_b_expiry = datetime(2026, 10, 1, tzinfo=timezone.utc)
            batch_a = Stock(
                item_id=item.id,
                warehouse_id=source.id,
                quantity=1,
                reserved_quantity=0,
                available_quantity=1,
                batch_number="LOT-A",
                expiration_date=batch_a_expiry,
            )
            batch_b = Stock(
                item_id=item.id,
                warehouse_id=source.id,
                quantity=3,
                reserved_quantity=0,
                available_quantity=3,
                batch_number="LOT-B",
                expiration_date=batch_b_expiry,
            )
            issue = StockIssue(
                issue_number="ISSUE-ALLOC-1",
                warehouse_id=source.id,
                technician_id=technician.id,
                status=StockIssueStatus.BROUILLON,
                notes="Dotation terrain test",
            )
            db.add_all([user, batch_a, batch_b, issue])
            await db.flush()
            db.add(
                StockIssueItem(
                    issue_id=issue.id,
                    item_id=item.id,
                    quantity=2,
                    quantity_delivered=0,
                )
            )
            await db.commit()

            payload = await validate_issue_to_technician_custody(
                issue.id,
                db=db,
                current_user=user,
            )

            destination = await db.scalar(
                select(Warehouse).where(Warehouse.code == f"TECH-{technician.id}")
            )
            assert destination is not None
            source_lines = (
                await db.execute(
                    select(Stock)
                    .where(
                        Stock.item_id == item.id,
                        Stock.warehouse_id == source.id,
                    )
                    .order_by(Stock.batch_number.asc())
                )
            ).scalars().all()
            destination_lines = (
                await db.execute(
                    select(Stock)
                    .where(
                        Stock.item_id == item.id,
                        Stock.warehouse_id == destination.id,
                    )
                    .order_by(Stock.batch_number.asc())
                )
            ).scalars().all()
            movements = (
                await db.execute(
                    select(StockMovement)
                    .where(StockMovement.reference_id == issue.id)
                    .order_by(StockMovement.id.asc())
                )
            ).scalars().all()
            refreshed_issue = await db.get(StockIssue, issue.id)
            issue_item = await db.scalar(
                select(StockIssueItem).where(StockIssueItem.issue_id == issue.id)
            )

            return {
                "payload_status": payload["status"],
                "payload_warehouse": payload["technician_warehouse_id"],
                "destination_id": destination.id,
                "source": [
                    (line.batch_number, line.quantity, line.available_quantity)
                    for line in source_lines
                ],
                "destination": [
                    (
                        line.batch_number,
                        line.quantity,
                        line.available_quantity,
                        line.expiration_date,
                    )
                    for line in destination_lines
                ],
                "movement_quantities": [movement.quantity for movement in movements],
                "movement_notes": [movement.notes for movement in movements],
                "movement_technicians": [movement.technician_id for movement in movements],
                "issue_status": refreshed_issue.status.value,
                "delivered": issue_item.quantity_delivered,
            }
    finally:
        await engine.dispose()


def test_technician_allocation_preserves_batches_and_audit_trail():
    admin_url = _admin_url()
    database_name = f"bluevector_stock_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    database_url = _database_url(admin_url, database_name)
    try:
        result = asyncio.run(_exercise(database_url))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["payload_status"] == "VALIDE"
    assert result["payload_warehouse"] == result["destination_id"]
    assert result["source"] == [("LOT-A", 0, 0), ("LOT-B", 2, 2)]
    assert [(batch, quantity, available) for batch, quantity, available, _ in result["destination"]] == [
        ("LOT-A", 1, 1),
        ("LOT-B", 1, 1),
    ]
    assert result["destination"][0][3].date().isoformat() == "2026-09-01"
    assert result["destination"][1][3].date().isoformat() == "2026-10-01"
    assert result["movement_quantities"] == [-1, 1, -1, 1]
    assert any("lot=LOT-A" in note for note in result["movement_notes"])
    assert any("lot=LOT-B" in note for note in result["movement_notes"])
    assert len(set(result["movement_technicians"])) == 1
    assert result["movement_technicians"][0] is not None
    assert result["issue_status"] == "VALIDE"
    assert result["delivered"] == 2
