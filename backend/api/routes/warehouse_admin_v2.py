"""Public-V2 warehouse administration extensions."""

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes.stock_ftth import _warehouse_payload, router
from backend.api.schemas.stock import WarehouseUpdate
from backend.auth.dependencies import require_chef_orienteur
from backend.database.connection import get_db
from backend.database.models import Stock, User, Warehouse


@router.put("/warehouses/{warehouse_id}")
async def update_warehouse_v2(
    data: WarehouseUpdate,
    warehouse_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise HTTPException(status_code=404, detail="Dépôt introuvable")

    updates = data.model_dump(exclude_unset=True)
    if "type_" in updates:
        updates["type"] = updates.pop("type_")

    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(warehouse, field, value)

    try:
        await db.commit()
        await db.refresh(warehouse)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un dépôt utilise déjà ce nom ou ce code.",
        ) from exc

    return _warehouse_payload(warehouse)


@router.delete("/warehouses/{warehouse_id}")
async def retire_warehouse_v2(
    warehouse_id: int = Path(..., gt=0),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    warehouse = await db.get(Warehouse, warehouse_id)
    if warehouse is None:
        raise HTTPException(status_code=404, detail="Dépôt introuvable")

    quantity = await db.scalar(
        select(func.coalesce(func.sum(Stock.quantity), 0)).where(
            Stock.warehouse_id == warehouse_id,
        )
    )
    if int(quantity or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Le dépôt contient encore du stock. Transférez ou sortez le stock avant de le désactiver.",
        )

    warehouse.is_active = False
    await db.commit()
    await db.refresh(warehouse)
    return _warehouse_payload(warehouse)
