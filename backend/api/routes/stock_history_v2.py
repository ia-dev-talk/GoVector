"""Public-V2 stock traceability read model.

The stock journal is already authoritative in ``stock_movements``.  This module
only exposes a richer, navigation-ready projection so the frontend can answer
"what moved, from where, for whom and for which intervention?" without
rebuilding joins in the browser.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_internal_user
from backend.database.connection import get_db
from backend.database.models import (
    Job,
    StockItem,
    StockMovement,
    StockMovementType,
    Technician,
    User,
    Warehouse,
)
from backend.api.routes.stock_ftth import router


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


@router.get("/history-v2")
async def stock_history_v2(
    search: Optional[str] = Query(None),
    item_id: Optional[int] = Query(None, gt=0),
    warehouse_id: Optional[int] = Query(None, gt=0),
    technician_id: Optional[int] = Query(None, gt=0),
    job_id: Optional[int] = Query(None, gt=0),
    movement_type: Optional[str] = Query(None),
    limit: int = Query(250, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    """Return enriched immutable stock movements, newest first."""

    statement = (
        select(
            StockMovement,
            StockItem.reference.label("item_reference"),
            StockItem.label.label("item_label"),
            Warehouse.name.label("warehouse_name"),
            Warehouse.code.label("warehouse_code"),
            Warehouse.type.label("warehouse_type"),
            Technician.name.label("technician_name"),
            Technician.employee_id.label("technician_employee_id"),
            Job.job_number.label("job_number"),
            Job.customer_name.label("customer_name"),
            Job.service_address.label("service_address"),
        )
        .join(StockItem, StockItem.id == StockMovement.item_id)
        .join(Warehouse, Warehouse.id == StockMovement.warehouse_id)
        .outerjoin(Technician, Technician.id == StockMovement.technician_id)
        .outerjoin(Job, Job.id == StockMovement.job_id)
    )

    if item_id is not None:
        statement = statement.where(StockMovement.item_id == item_id)
    if warehouse_id is not None:
        statement = statement.where(StockMovement.warehouse_id == warehouse_id)
    if technician_id is not None:
        statement = statement.where(StockMovement.technician_id == technician_id)
    if job_id is not None:
        statement = statement.where(StockMovement.job_id == job_id)
    if movement_type:
        normalized = movement_type.strip().upper()
        try:
            enum_value = StockMovementType(normalized)
        except ValueError:
            enum_value = None
        if enum_value is not None:
            statement = statement.where(StockMovement.movement_type == enum_value)

    normalized_search = (search or "").strip()
    if normalized_search:
        like = f"%{normalized_search}%"
        statement = statement.where(
            or_(
                StockItem.reference.ilike(like),
                StockItem.label.ilike(like),
                Warehouse.name.ilike(like),
                Warehouse.code.ilike(like),
                Technician.name.ilike(like),
                Technician.employee_id.ilike(like),
                Job.job_number.ilike(like),
                Job.customer_name.ilike(like),
                Job.service_address.ilike(like),
                StockMovement.notes.ilike(like),
            )
        )

    rows = (
        await db.execute(
            statement.order_by(StockMovement.created_at.desc()).limit(limit)
        )
    ).all()

    return [
        {
            "id": movement.id,
            "created_at": movement.created_at,
            "movement_type": _enum_value(movement.movement_type),
            "quantity": movement.quantity,
            "quantity_before": movement.quantity_before,
            "quantity_after": movement.quantity_after,
            "item_id": movement.item_id,
            "item_reference": item_reference,
            "item_label": item_label,
            "warehouse_id": movement.warehouse_id,
            "warehouse_name": warehouse_name,
            "warehouse_code": warehouse_code,
            "warehouse_type": warehouse_type,
            "technician_id": movement.technician_id,
            "technician_name": technician_name,
            "technician_employee_id": technician_employee_id,
            "job_id": movement.job_id,
            "job_number": job_number,
            "customer_name": customer_name,
            "service_address": service_address,
            "operator": movement.operator,
            "reference_type": movement.reference_type,
            "reference_id": movement.reference_id,
            "notes": movement.notes,
            "created_by": movement.created_by,
        }
        for (
            movement,
            item_reference,
            item_label,
            warehouse_name,
            warehouse_code,
            warehouse_type,
            technician_name,
            technician_employee_id,
            job_number,
            customer_name,
            service_address,
        ) in rows
    ]
