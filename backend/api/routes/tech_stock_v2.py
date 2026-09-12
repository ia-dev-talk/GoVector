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
from backend.database.models import CableDrum, Job, StockItem, StockMovement, User
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
    """Return only physical CODE drums assigned to this technician."""
    technician_id = current_user.technician_id
    if technician_id is None:
        raise HTTPException(status_code=400, detail="Profil technicien manquant")

    drums = (
        await db.execute(
            select(CableDrum)
            .where(
                CableDrum.assigned_technician_id == technician_id,
                CableDrum.status == "ACTIVE",
            )
            .order_by(CableDrum.code.asc())
        )
    ).scalars().all()
    return [
        {
            "drum_id": drum.id,
            "item_id": None,
            "reference": drum.code,
            "code": drum.code,
            "label": f"{drum.code} · {drum.cable_type}",
            "cable_type": drum.cable_type,
            "equipment_type": "CABLE_FO",
            "unit": "m",
            "quantity": drum.current_mark_m,
            "available_quantity": drum.current_mark_m,
            "current_mark_m": drum.current_mark_m,
            "stock_registered": True,
            "stock_known": True,
            "stock_reconciliation_required": False,
        }
        for drum in drums
    ]


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
