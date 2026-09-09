"""Observed cable consumption for the GoVector field pilot.

A technician may physically use a governed cable reference even when their
system custody is empty or was never initialized.  That real field fact must
not be rejected.  We debit any known quantity, keep canonical stock non-negative,
and record any uncovered quantity as an explicit observed/unregistered movement
linked to the intervention.

This path is intentionally cable-specific. Serialized equipment and ordinary
material consumption keep their stricter custody rules.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Stock,
    StockConsumption,
    StockConsumptionItem,
    StockConsumptionStatus,
    StockItem,
    StockMovement,
    StockMovementType,
    User,
    Warehouse,
)
from backend.logic.cable_classification import is_cable_catalog_item
from backend.logic.job_visits import resolve_visit_for_technician
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)
from backend.logic.technician_stock import technician_warehouse_code


async def ensure_technician_stock_context(
    db: AsyncSession,
    *,
    technician_id: int,
) -> Warehouse:
    """Return the technician warehouse, creating an empty one when needed."""

    code = technician_warehouse_code(technician_id)
    warehouse = await db.scalar(
        select(Warehouse).where(Warehouse.code == code).with_for_update()
    )
    if warehouse is not None:
        if not warehouse.is_active:
            warehouse.is_active = True
        return warehouse

    warehouse = Warehouse(
        name=f"Garde technicien {technician_id}",
        code=code,
        type="TECHNICIEN",
        is_active=True,
        description="Stock technicien GoVector initialisé automatiquement depuis le terrain",
    )
    db.add(warehouse)
    await db.flush()
    return warehouse


async def record_observed_cable_consumption(
    db: AsyncSession,
    *,
    job_id: int,
    item_id: int,
    quantity_m: int,
    current_user: User,
    event_id: str | None,
    occurred_at: datetime | None,
    cable_reference: str | None = None,
) -> StockConsumption | None:
    """Record measured cable use without rejecting unknown/zero technician stock."""

    if quantity_m <= 0:
        return None

    technician_id = current_user.technician_id
    if technician_id is None:
        raise TechnicianJobMutationError(
            "rejected", "technician_profile_missing", "Profil technicien manquant"
        )

    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
        lock=True,
    )
    item = await db.get(StockItem, item_id)
    if item is None or not item.is_active:
        raise TechnicianJobMutationError(
            "rejected", "cable_type_unavailable", "Le type de câble est indisponible"
        )
    if not is_cable_catalog_item(item):
        raise TechnicianJobMutationError(
            "conflict", "stock_item_not_cable", "L'article sélectionné n'est pas un câble"
        )
    if job.operator and item.operator and item.operator != job.operator:
        raise TechnicianJobMutationError(
            "conflict",
            "operator_mismatch",
            f"{item.label} appartient à {item.operator}, pas à {job.operator}",
        )

    warehouse = await ensure_technician_stock_context(
        db,
        technician_id=technician_id,
    )
    visit = await resolve_visit_for_technician(
        db,
        job_id=job_id,
        technician_id=technician_id,
    )
    now = occurred_at or datetime.now(timezone.utc)
    suffix = re.sub(r"[^A-Za-z0-9]", "", event_id or "")[-16:] or uuid4().hex[:16]
    note = (
        f"Consommation câble constatée automatiquement: {quantity_m} m"
        + (f" — {cable_reference}" if cable_reference else "")
    )
    consumption = StockConsumption(
        consumption_number=f"CAB-{technician_id}-{suffix}",
        job_id=job_id,
        visit_id=visit.id if visit is not None else None,
        technician_id=technician_id,
        operator=item.operator or job.operator,
        status=StockConsumptionStatus.VALIDE,
        notes=note,
        created_by=current_user.id,
        validated_by=current_user.id,
        validated_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(consumption)
    await db.flush()
    db.add(
        StockConsumptionItem(
            consumption_id=consumption.id,
            item_id=item.id,
            quantity=quantity_m,
        )
    )

    stock_lines = (
        await db.execute(
            select(Stock)
            .where(
                Stock.warehouse_id == warehouse.id,
                Stock.item_id == item.id,
            )
            .order_by(
                Stock.expiration_date.asc().nullslast(),
                Stock.id.asc(),
            )
            .with_for_update()
        )
    ).scalars().all()

    # Make the reference visible in the technician stock even if no allocation
    # was known before this intervention.
    if not stock_lines:
        zero_line = Stock(
            item_id=item.id,
            warehouse_id=warehouse.id,
            quantity=0,
            reserved_quantity=0,
            available_quantity=0,
        )
        db.add(zero_line)
        await db.flush()
        stock_lines = [zero_line]

    remaining = quantity_m
    for line in stock_lines:
        if remaining <= 0:
            break
        available = max(int(line.available_quantity or 0), 0)
        if available <= 0:
            continue
        used = min(available, remaining)
        before = max(int(line.quantity or 0), 0)
        line.quantity = max(before - used, 0)
        line.available_quantity = max(int(line.available_quantity or 0) - used, 0)
        db.add(
            StockMovement(
                item_id=item.id,
                warehouse_id=warehouse.id,
                movement_type=StockMovementType.CONSOMMATION,
                quantity=-used,
                quantity_before=before,
                quantity_after=line.quantity,
                reference_type="cable_consumption",
                reference_id=consumption.id,
                operator=item.operator or job.operator,
                job_id=job_id,
                visit_id=visit.id if visit is not None else None,
                technician_id=technician_id,
                notes=note,
                created_by=current_user.id,
                created_at=now,
            )
        )
        remaining -= used

    if remaining > 0:
        # This movement is deliberately a discrepancy record: canonical stock
        # stays at zero while history preserves the real field consumption.
        db.add(
            StockMovement(
                item_id=item.id,
                warehouse_id=warehouse.id,
                movement_type=StockMovementType.CONSOMMATION,
                quantity=-remaining,
                quantity_before=0,
                quantity_after=0,
                reference_type="observed_unregistered",
                reference_id=consumption.id,
                operator=item.operator or job.operator,
                job_id=job_id,
                visit_id=visit.id if visit is not None else None,
                technician_id=technician_id,
                notes=(
                    f"{note}. Stock préalable non renseigné ou insuffisant: "
                    f"{remaining} m constatés hors stock connu."
                ),
                created_by=current_user.id,
                created_at=now,
            )
        )

    await db.flush()
    return consumption
