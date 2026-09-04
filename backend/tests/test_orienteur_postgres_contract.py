"""Persisted settings, exact material totals and SQL-enforced read-only analysis."""

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes.settings import update_operational_settings
from backend.api.schemas.settings import OperationalSettingsUpdate, OperationalSettingsValues, OrienteurObservationPolicy, CompletionPolicyValues, CompletionRequirementsValues
from backend.database.models import Base, OperationalAuditEvent, StockMovement, StockMovementType, UserRole
from backend.services.orienteur_assessment import assess_job
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url, _create_database, _database_url, _drop_database, _seed, _sqlalchemy_url,
)


async def exercise(url):
    engine = create_async_engine(_sqlalchemy_url(url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            tech, user, job, visit, warehouse, item, *_ = await _seed(db)
            job_id = job.id
            admin = SimpleNamespace(id=user.id, username=user.username, role=UserRole.ADMIN)
            for linked_visit in [visit.id, None]:
                db.add(StockMovement(item_id=item.id, warehouse_id=warehouse.id,
                    movement_type=StockMovementType.CONSOMMATION, quantity=1,
                    quantity_before=5, quantity_after=4, job_id=job.id,
                    visit_id=linked_visit, technician_id=tech.id))
            await db.commit()
            saved = await update_operational_settings(OperationalSettingsUpdate(
                expected_revision=0,
                values=OperationalSettingsValues(
                    orienteur_observation=OrienteurObservationPolicy(appointment_grace_minutes=75, flag_missing_sector=False),
                    completion_policy=CompletionPolicyValues(
                        default=CompletionRequirementsValues(minimum_photos=1),
                        by_job_type={"INSTALLATION": CompletionRequirementsValues(minimum_photos=2)},
                        by_operator={"orange": CompletionRequirementsValues(minimum_photos=5)},
                    )),
            ), db, admin)
            assert saved.revision == 1
            with pytest.raises(HTTPException) as conflict:
                await update_operational_settings(OperationalSettingsUpdate(
                    expected_revision=0, values=OperationalSettingsValues()), db, admin)
            assert conflict.value.status_code == 409
            await db.rollback()
        async with factory() as db:
            # Any unexpected INSERT/UPDATE/DELETE by the analysis fails in PostgreSQL.
            await db.execute(text('SET TRANSACTION READ ONLY'))
            result = await assess_job(db, job_id=job_id, current_user=admin)
            assert result['policy_revision'] == 1
            assert result['policy']['appointment_grace_minutes'] == 75
            assert result['material']['movement_count'] == 2
            assert result['material']['unlinked_visit_count'] == 1
            assert result['current_visit']['attempt_number'] == 1
            assert result['assessment_status'] == 'REVIEW'
            assert result['completion']['blocking_requirements'] == ['5 photo(s) terrain requise(s)']
            assert 'missing_sector' not in {item['code'] for item in result['findings']}
            assert await db.scalar(select(func.count()).select_from(OperationalAuditEvent)) == 1
    finally:
        await engine.dispose()


def test_assessment_uses_persisted_policy_and_never_writes():
    admin_url = _admin_url()
    name = f'bluevector_orienteur_{uuid4().hex}'
    asyncio.run(_create_database(admin_url, name))
    try:
        asyncio.run(exercise(_database_url(admin_url, name)))
    finally:
        asyncio.run(_drop_database(admin_url, name))
