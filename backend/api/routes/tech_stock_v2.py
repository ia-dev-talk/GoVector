"""Public V2 technician stock + equipment scan endpoints.

These routes extend the existing `/tech/jobs` router so the mobile application
uses the same authenticated technician context as the intervention workflow.
"""

from typing import Any

from fastapi import Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import tech_jobs
from backend.auth.dependencies import require_technician
from backend.database.connection import get_db
from backend.database.models import Job, StockItem, StockMovement, User
from backend.logic.cable_classification import is_cable_catalog_item
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.technician_stock import (
    resolve_equipment_scan,
    technician_stock_payload,
)


class EquipmentScanRequest(BaseModel):
    job_id: int = Field(gt=0)
    code: str = Field(min_length=1, max_length=512)


def _mutation_http_exception(exc: TechnicianJobMutationError) -> HTTPException:
    code = status.HTTP_409_CONFLICT if exc.status == "conflict" else status.HTTP_422_UNPROCESSABLE_ENTITY
    return HTTPException(
        status_code=code,
        detail={"code": exc.code, "message": exc.message},
    )


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


@tech_jobs.router.get("/stock-v2")
async def get_technician_custody_v2(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> list[dict[str, Any]]:
    """Return aggregated AVAILABLE custody for the authenticated technician."""
    if current_user.technician_id is None:
        raise HTTPException(status_code=400, detail="Profil technicien manquant")
    return await technician_stock_payload(
        db,
        technician_id=current_user.technician_id,
    )


@tech_jobs.router.get("/stock-v2/cables")
async def get_technician_cable_catalogue_v2(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> list[dict[str, Any]]:
    """Return governed cable references, including zero/unknown technician stock.

    Real field consumption must remain recordable even when the system never
    received a prior allocation for that reel/reference.  The mobile therefore
    sees the governed catalogue and an informational custody quantity side by
    side instead of hiding references whose technician stock is zero.
    """
    if current_user.technician_id is None:
        raise HTTPException(status_code=400, detail="Profil technicien manquant")

    custody = await technician_stock_payload(
        db,
        technician_id=current_user.technician_id,
    )
    by_item_id = {int(row["item_id"]): row for row in custody}
    items = (
        await db.execute(
            select(StockItem)
            .where(StockItem.is_active.is_(True))
            .order_by(
                StockItem.equipment_type.asc(),
                StockItem.label.asc(),
                StockItem.reference.asc(),
                StockItem.id.asc(),
            )
        )
    ).scalars().all()

    result: list[dict[str, Any]] = []
    for item in items:
        if not is_cable_catalog_item(item):
            continue
        known = by_item_id.get(item.id)
        result.append(
            {
                "item_id": item.id,
                "reference": item.reference,
                "label": item.label,
                "equipment_type": item.equipment_type,
                "operator": item.operator,
                "manufacturer": item.manufacturer,
                "model": item.model,
                "unit": item.unit,
                "warehouse_id": known.get("warehouse_id") if known else None,
                "warehouse_name": known.get("warehouse_name") if known else None,
                "quantity": int(known.get("quantity", 0)) if known else 0,
                "reserved_quantity": int(known.get("reserved_quantity", 0)) if known else 0,
                "available_quantity": int(known.get("available_quantity", 0)) if known else 0,
                "stock_registered": known is not None,
                "stock_known": bool(known and int(known.get("available_quantity", 0)) > 0),
            }
        )
    return result


@tech_jobs.router.get("/stock-v2/history")
async def get_technician_stock_history_v2(
    limit: int = Query(100, ge=1, le=250),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> list[dict[str, Any]]:
    """Return immutable stock movements for the authenticated technician only."""
    technician_id = current_user.technician_id
    if technician_id is None:
        raise HTTPException(status_code=400, detail="Profil technicien manquant")

    rows = (
        await db.execute(
            select(
                StockMovement,
                StockItem.reference.label("item_reference"),
                StockItem.label.label("item_label"),
                StockItem.unit.label("item_unit"),
                Job.job_number.label("job_number"),
            )
            .join(StockItem, StockItem.id == StockMovement.item_id)
            .outerjoin(Job, Job.id == StockMovement.job_id)
            .where(StockMovement.technician_id == technician_id)
            .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
            .limit(limit)
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
            "item_unit": item_unit,
            "job_id": movement.job_id,
            "job_number": job_number,
            "operator": movement.operator,
            "reference_type": movement.reference_type,
            "reference_id": movement.reference_id,
            "notes": movement.notes,
        }
        for movement, item_reference, item_label, item_unit, job_number in rows
    ]


@tech_jobs.router.post("/scan/resolve")
async def resolve_technician_equipment_scan(
    payload: EquipmentScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> dict[str, Any]:
    """Resolve a raw QR/barcode against inventory, catalogue and technician custody."""
    try:
        return await resolve_equipment_scan(
            db,
            raw_code=payload.code,
            job_id=payload.job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _mutation_http_exception(exc) from exc
