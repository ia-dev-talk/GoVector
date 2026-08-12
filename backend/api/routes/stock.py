"""Serialized equipment inventory management API routes."""

import logging
from datetime import datetime
from io import BytesIO
from typing import List, Optional

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import (
    require_internal_user,
    require_orienteur_or_above,
)
from backend.database.connection import get_db
from backend.database.models import EquipmentInventory, Job, User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Stock Management"])


def _required_text(value: str, field: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field} est obligatoire")
    return normalized


def _optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


class EquipmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    serial_number: str = Field(max_length=100)
    mac_address: Optional[str] = Field(default=None, max_length=100)
    operator: str = Field(max_length=20)
    equipment_type: str = Field(max_length=50)
    model: Optional[str] = Field(default=None, max_length=100)
    status: str = Field(default="STOCK", max_length=30)
    warehouse: Optional[str] = Field(default=None, max_length=100)
    vehicle: Optional[str] = Field(default=None, max_length=100)
    assigned_job_id: Optional[int] = Field(default=None, gt=0)
    min_stock_threshold: int = Field(default=5, ge=0)
    alert_enabled: bool = True

    @field_validator("serial_number", "operator", "equipment_type", "status")
    @classmethod
    def validate_required_text(cls, value: str, info):
        return _required_text(value, info.field_name)

    @field_validator("mac_address", "model", "warehouse", "vehicle")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]):
        return _optional_text(value)


class EquipmentUpdate(BaseModel):
    """Patch-like PUT payload used by the V2 serialized registry."""

    model_config = ConfigDict(extra="forbid")

    serial_number: Optional[str] = Field(default=None, max_length=100)
    mac_address: Optional[str] = Field(default=None, max_length=100)
    operator: Optional[str] = Field(default=None, max_length=20)
    equipment_type: Optional[str] = Field(default=None, max_length=50)
    model: Optional[str] = Field(default=None, max_length=100)
    status: Optional[str] = Field(default=None, max_length=30)
    warehouse: Optional[str] = Field(default=None, max_length=100)
    vehicle: Optional[str] = Field(default=None, max_length=100)
    assigned_job_id: Optional[int] = Field(default=None, gt=0)
    min_stock_threshold: Optional[int] = Field(default=None, ge=0)
    alert_enabled: Optional[bool] = None

    @field_validator("serial_number", "operator", "equipment_type", "status")
    @classmethod
    def validate_required_if_provided(cls, value: Optional[str], info):
        if value is None:
            return None
        return _required_text(value, info.field_name)

    @field_validator("mac_address", "model", "warehouse", "vehicle")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]):
        return _optional_text(value)


def _equipment_dict(item: EquipmentInventory) -> dict:
    return {
        "id": item.id,
        "serial_number": item.serial_number,
        "mac_address": item.mac_address,
        "operator": item.operator,
        "equipment_type": item.equipment_type,
        "model": item.model,
        "status": item.status,
        "warehouse": item.warehouse,
        "vehicle": item.vehicle,
        "assigned_job_id": item.assigned_job_id,
        "min_stock_threshold": item.min_stock_threshold,
        "alert_enabled": item.alert_enabled,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


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
    return [_equipment_dict(item) for item in result.scalars().all()]


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
        .where(EquipmentInventory.alert_enabled.is_(True))
        .where(EquipmentInventory.status.in_(["STOCK", "IN_USE"]))
        .group_by(
            EquipmentInventory.equipment_type,
            EquipmentInventory.operator,
            EquipmentInventory.min_stock_threshold,
        )
        .having(
            func.count(EquipmentInventory.id)
            < EquipmentInventory.min_stock_threshold
        )
    )
    return [dict(row) for row in result.mappings().all()]


async def _validate_assigned_job(db: AsyncSession, job_id: Optional[int]) -> None:
    if job_id is None:
        return
    if await db.get(Job, job_id) is None:
        raise HTTPException(
            status_code=422,
            detail=f"Intervention #{job_id} introuvable",
        )


@router.post("/stock", status_code=201)
async def create_equipment(
    data: EquipmentCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
):
    await _validate_assigned_job(db, data.assigned_job_id)
    equipment = EquipmentInventory(**data.model_dump())
    if data.assigned_job_id and data.status == "STOCK":
        equipment.status = "ASSIGNED"
    db.add(equipment)
    try:
        await db.commit()
        await db.refresh(equipment)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ce numéro de série existe déjà dans le registre.",
        ) from exc
    except Exception as exc:
        logger.exception("Error creating serialized equipment: %s", exc)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Impossible de créer l'équipement sérialisé",
        ) from exc
    return _equipment_dict(equipment)


@router.put("/stock/{equipment_id}")
async def update_equipment(
    equipment_id: int,
    data: EquipmentUpdate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
):
    equipment = await db.get(EquipmentInventory, equipment_id)
    if equipment is None:
        raise HTTPException(status_code=404, detail="Équipement introuvable")

    changes = data.model_dump(exclude_unset=True)
    if "assigned_job_id" in changes:
        await _validate_assigned_job(db, changes["assigned_job_id"])

    for field, value in changes.items():
        setattr(equipment, field, value)

    if "assigned_job_id" in changes:
        if changes["assigned_job_id"] is not None and "status" not in changes:
            equipment.status = "ASSIGNED"
        elif changes["assigned_job_id"] is None and equipment.status == "ASSIGNED":
            equipment.status = "STOCK"

    try:
        await db.commit()
        await db.refresh(equipment)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ce numéro de série existe déjà dans le registre.",
        ) from exc
    except Exception as exc:
        logger.exception("Error updating serialized equipment: %s", exc)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Impossible de modifier l'équipement sérialisé",
        ) from exc
    return _equipment_dict(equipment)


@router.delete("/stock/{equipment_id}")
async def delete_equipment(
    equipment_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
):
    equipment = await db.get(EquipmentInventory, equipment_id)
    if equipment is None:
        raise HTTPException(status_code=404, detail="Équipement introuvable")
    if equipment.assigned_job_id is not None or equipment.status in {"ASSIGNED", "IN_USE"}:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cet équipement est lié à une intervention. Libérez-le ou changez "
                "son statut avant suppression."
            ),
        )
    await db.delete(equipment)
    try:
        await db.commit()
    except Exception as exc:
        logger.exception("Error deleting serialized equipment: %s", exc)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Impossible de supprimer l'équipement sérialisé",
        ) from exc
    return {"message": "Équipement supprimé"}


@router.get("/stock/summary")
async def get_stock_summary(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    total = await db.execute(select(func.count(EquipmentInventory.id)))
    by_status = {}
    for state in ["STOCK", "ASSIGNED", "IN_USE", "RETURNED", "FAULTY"]:
        result = await db.execute(
            select(func.count(EquipmentInventory.id)).where(
                EquipmentInventory.status == state
            )
        )
        by_status[state] = result.scalar()

    by_type = {}
    types = await db.execute(select(EquipmentInventory.equipment_type).distinct())
    for equipment_type in types.scalars().all():
        count = await db.execute(
            select(func.count(EquipmentInventory.id)).where(
                EquipmentInventory.equipment_type == equipment_type
            )
        )
        by_type[equipment_type] = count.scalar()

    by_operator = {}
    operators = await db.execute(select(EquipmentInventory.operator).distinct())
    for operator in operators.scalars().all():
        count = await db.execute(
            select(func.count(EquipmentInventory.id)).where(
                EquipmentInventory.operator == operator
            )
        )
        by_operator[operator] = count.scalar()
    return {
        "total": total.scalar(),
        "by_status": by_status,
        "by_type": by_type,
        "by_operator": by_operator,
    }


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
    result = await db.execute(
        query.order_by(EquipmentInventory.created_at.desc())
    )
    items = result.scalars().all()

    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    worksheet.title = "Équipements sérialisés"
    headers = [
        "ID",
        "N° Série",
        "Opérateur",
        "Type",
        "Modèle",
        "Statut",
        "Entrepôt",
        "Véhicule",
        "Assigné à",
        "MAC Address",
        "Seuil alerte",
        "Créé le",
    ]
    worksheet.append(headers)
    for item in items:
        worksheet.append(
            [
                item.id,
                item.serial_number,
                item.operator,
                item.equipment_type,
                item.model,
                item.status,
                item.warehouse,
                item.vehicle,
                item.assigned_job_id,
                item.mac_address,
                item.min_stock_threshold,
                item.created_at.strftime("%d/%m/%Y %H:%M")
                if item.created_at
                else "",
            ]
        )
    for column in worksheet.columns:
        max_length = max((len(str(cell.value or "")) for cell in column), default=0)
        worksheet.column_dimensions[column[0].column_letter].width = min(
            max_length + 2,
            40,
        )

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    filename = f"serialized_stock_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
