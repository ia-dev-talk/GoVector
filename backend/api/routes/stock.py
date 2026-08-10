"""
Inventory and stock management API routes.
"""
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import openpyxl
from io import BytesIO

from backend.database.connection import get_db
from backend.database.models import EquipmentInventory, Job, User
from backend.auth.dependencies import (
    require_internal_user,
    require_orienteur_or_above,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Stock Management"])


class EquipmentCreate(BaseModel):
    serial_number: str
    mac_address: Optional[str] = None
    operator: str
    equipment_type: str
    model: Optional[str] = None
    warehouse: Optional[str] = None


class EquipmentUpdate(BaseModel):
    status: Optional[str] = None
    warehouse: Optional[str] = None
    vehicle: Optional[str] = None
    assigned_job_id: Optional[int] = None
    min_stock_threshold: Optional[int] = None


@router.get("/stock")
async def get_stock(
    status: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    query = select(EquipmentInventory)
    if status:
        query = query.where(EquipmentInventory.status == status)
    if equipment_type:
        query = query.where(EquipmentInventory.equipment_type == equipment_type)
    if operator:
        query = query.where(EquipmentInventory.operator == operator)
    if warehouse:
        query = query.where(EquipmentInventory.warehouse == warehouse)
    result = await db.execute(query.order_by(EquipmentInventory.created_at.desc()))
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "serial_number": i.serial_number,
            "mac_address": i.mac_address,
            "operator": i.operator,
            "equipment_type": i.equipment_type,
            "model": i.model,
            "status": i.status,
            "warehouse": i.warehouse,
            "vehicle": i.vehicle,
            "assigned_job_id": i.assigned_job_id,
            "min_stock_threshold": i.min_stock_threshold,
            "alert_enabled": i.alert_enabled,
            "created_at": i.created_at,
        }
        for i in items
    ]


@router.get("/stock/alerts", response_model=List[dict])
async def get_stock_alerts(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    result = await db.execute(
        select(
            EquipmentInventory.equipment_type,
            EquipmentInventory.operator,
            EquipmentInventory.min_stock_threshold,
            func.count(EquipmentInventory.id).label("current_stock"),
        )
        .where(EquipmentInventory.alert_enabled == True)
        .where(EquipmentInventory.status.in_(["STOCK", "IN_USE"]))
        .group_by(EquipmentInventory.equipment_type, EquipmentInventory.operator, EquipmentInventory.min_stock_threshold)
        .having(func.count(EquipmentInventory.id) < EquipmentInventory.min_stock_threshold)
    )
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.post("/stock")
async def create_equipment(
    data: EquipmentCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
):
    try:
        equipment = EquipmentInventory(
            serial_number=data.serial_number,
            mac_address=data.mac_address,
            operator=data.operator,
            equipment_type=data.equipment_type,
            model=data.model,
            warehouse=data.warehouse,
            status="STOCK",
        )
        db.add(equipment)
        await db.commit()
        await db.refresh(equipment)
        return {"id": equipment.id, "message": "Equipment added to inventory"}
    except Exception as e:
        logger.exception(f"Error creating equipment: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create equipment")


@router.put("/stock/{equipment_id}")
async def update_equipment(
    equipment_id: int,
    data: EquipmentUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
):
    equipment = await db.get(EquipmentInventory, equipment_id)
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    try:
        if data.status:
            equipment.status = data.status
        if data.warehouse:
            equipment.warehouse = data.warehouse
        if data.vehicle:
            equipment.vehicle = data.vehicle
        if data.assigned_job_id:
            equipment.assigned_job_id = data.assigned_job_id
            equipment.status = "ASSIGNED"
        if data.min_stock_threshold is not None:
            equipment.min_stock_threshold = data.min_stock_threshold
        await db.commit()
        await db.refresh(equipment)
        return {"id": equipment.id, "message": "Equipment updated"}
    except Exception as e:
        logger.exception(f"Error updating equipment: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update equipment")


@router.delete("/stock/{equipment_id}")
async def delete_equipment(
    equipment_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
):
    equipment = await db.get(EquipmentInventory, equipment_id)
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    try:
        await db.delete(equipment)
        await db.commit()
        return {"message": "Equipment deleted"}
    except Exception as e:
        logger.exception(f"Error deleting equipment: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete equipment")


@router.get("/stock/summary")
async def get_stock_summary(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    total = await db.execute(select(func.count(EquipmentInventory.id)))
    total_count = total.scalar()
    by_status = {}
    for status in ["STOCK", "ASSIGNED", "IN_USE", "RETURNED", "FAULTY"]:
        result = await db.execute(
            select(func.count(EquipmentInventory.id)).where(EquipmentInventory.status == status)
        )
        by_status[status] = result.scalar()
    by_type = {}
    types = await db.execute(select(EquipmentInventory.equipment_type).distinct())
    for t in types.scalars().all():
        count = await db.execute(
            select(func.count(EquipmentInventory.id)).where(EquipmentInventory.equipment_type == t)
        )
        by_type[t] = count.scalar()
    by_operator = {}
    operators = await db.execute(select(EquipmentInventory.operator).distinct())
    for op in operators.scalars().all():
        count = await db.execute(
            select(func.count(EquipmentInventory.id)).where(EquipmentInventory.operator == op)
        )
        by_operator[op] = count.scalar()
    return {"total": total_count, "by_status": by_status, "by_type": by_type, "by_operator": by_operator}


@router.get("/stock/export")
async def export_stock_excel(
    status: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    query = select(EquipmentInventory)
    if status:
        query = query.where(EquipmentInventory.status == status)
    if equipment_type:
        query = query.where(EquipmentInventory.equipment_type == equipment_type)
    if operator:
        query = query.where(EquipmentInventory.operator == operator)
    if warehouse:
        query = query.where(EquipmentInventory.warehouse == warehouse)
    result = await db.execute(query.order_by(EquipmentInventory.created_at.desc()))
    items = result.scalars().all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Stock"
    headers = ["ID", "N° Série", "Opérateur", "Type", "Modèle", "Statut", "Entrepôt", "Véhicule", "Assigné à", "MAC Address", "Seuil alerte", "Créé le"]
    ws.append(headers)
    for item in items:
        ws.append([item.id, item.serial_number, item.operator, item.equipment_type, item.model, item.status, item.warehouse, item.vehicle, item.assigned_job_id, item.mac_address, item.min_stock_threshold, item.created_at.strftime("%d/%m/%Y %H:%M") if item.created_at else ""])
    for column in ws.columns:
        max_length = 0
        column_letter = column[0].column_letter
        for cell in column:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except Exception:
                pass
        ws.column_dimensions[column_letter].width = min(max_length + 2, 40)
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    filename = f"stock_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
