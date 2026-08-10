"""
Stock FTTH routes.
"""
import json
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Path,
    Query,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc
from sqlalchemy.exc import IntegrityError

from backend.database.connection import get_db
from backend.database.models import (
    StockItem,
    Warehouse,
    Stock,
    StockMovement,
    StockIssue,
    StockReturn,
    StockConsumption,
    InventoryCount,
    StockMovementType,
    User,
)
from backend.auth.dependencies import (
    require_chef_orienteur,
    require_internal_user,
    require_orienteur_or_above,
)
from backend.services.stock_service import StockService
from backend.api.schemas.stock import (
    StockItemCreate,
    StockItemResponse,
    StockItemUpdate,
    WarehouseCreate,
    WarehouseUpdate,
    StockIssueCreate,
    StockReturnCreate,
    StockConsumptionCreate,
    InventoryCountCreate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/stock-ftth", tags=["Stock FTTH"])
simple_router = APIRouter(prefix="/api/v1/stock", tags=["Stock"])


def _svc(db: AsyncSession) -> StockService:
    return StockService(db)


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _parse_stock_items(raw_items: str) -> list[dict]:
    """Parse compatibility payloads without turning bad input into a 500."""
    try:
        parsed = json.loads(raw_items)
    except (TypeError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="items must be a valid JSON array",
        ) from error
    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="items must be a non-empty JSON array",
        )
    if not all(isinstance(item, dict) for item in parsed):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="each stock item must be a JSON object",
        )
    return parsed


def _stock_item_payload(item: StockItem) -> dict:
    return {
        "id": item.id,
        "reference": item.reference,
        "label": item.label,
        "equipment_type": item.equipment_type,
        "operator": item.operator,
        "manufacturer": item.manufacturer,
        "model": item.model,
        "unit": item.unit,
        "unit_price": item.unit_price,
        "category": item.category,
        "is_active": item.is_active,
        "min_stock_threshold": item.min_stock_threshold,
        "alert_enabled": item.alert_enabled,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _warehouse_payload(warehouse: Warehouse) -> dict:
    return {
        "id": warehouse.id,
        "name": warehouse.name,
        "code": warehouse.code,
        "type": warehouse.type,
        "address": warehouse.address,
        "city": warehouse.city,
        "is_active": warehouse.is_active,
        "description": warehouse.description,
        "created_at": warehouse.created_at,
        "updated_at": warehouse.updated_at,
    }


def _stock_line_payload(line: Stock) -> dict:
    return {
        "id": line.id,
        "item_id": line.item_id,
        "warehouse_id": line.warehouse_id,
        "quantity": line.quantity,
        "reserved_quantity": line.reserved_quantity,
        "available_quantity": line.available_quantity,
        "batch_number": line.batch_number,
        "expiration_date": line.expiration_date,
        "created_at": line.created_at,
        "updated_at": line.updated_at,
    }


def _movement_payload(movement: StockMovement) -> dict:
    return {
        "id": movement.id,
        "item_id": movement.item_id,
        "warehouse_id": movement.warehouse_id,
        "movement_type": _enum_value(
            movement.movement_type
        ),
        "quantity": movement.quantity,
        "quantity_before": movement.quantity_before,
        "quantity_after": movement.quantity_after,
        "reference_type": movement.reference_type,
        "reference_id": movement.reference_id,
        "operator": movement.operator,
        "job_id": movement.job_id,
        "technician_id": movement.technician_id,
        "notes": movement.notes,
        "created_by": movement.created_by,
        "created_at": movement.created_at,
    }


# ── Items ───────────────────────────────────────────────────────────────────
@router.post(
    "/items",
    response_model=StockItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_stock_item(
    data: StockItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_chef_orienteur
    ),
):
    try:
        item = await _svc(
            db
        ).get_or_create_item(
            **data.model_dump()
        )
        await db.commit()
        await db.refresh(item)
        return item
    except ValueError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error


@router.put(
    "/items/{item_id}",
    response_model=StockItemResponse,
)
async def update_stock_item(
    data: StockItemUpdate,
    item_id: int = Path(
        ...,
        gt=0,
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_chef_orienteur
    ),
):
    result = await db.execute(select(StockItem).where(StockItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "StockItem not found")
    updates = data.model_dump(
        exclude_unset=True
    )
    try:
        for field_name, value in updates.items():
            setattr(
                item,
                field_name,
                value,
            )
        await db.commit()
        await db.refresh(item)
        return item
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Stock item update conflicts with "
                "an existing reference"
            ),
        ) from error


@router.get("/items")
async def list_stock_items(
    equipment_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(
        require_internal_user
    ),
):
    q = select(StockItem).order_by(
        StockItem.created_at.desc()
    )
    if equipment_type:
        q = q.where(
            StockItem.equipment_type ==
            equipment_type
        )
    if operator:
        q = q.where(
            StockItem.operator == operator
        )
    result = await db.execute(q)
    return [
        _stock_item_payload(item)
        for item in result.scalars().all()
    ]


@router.get("/items/{item_id}")
async def get_stock_item(
    item_id: int = Path(
        ...,
        gt=0,
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(
        require_internal_user
    ),
):
    result = await db.execute(select(StockItem).where(StockItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "StockItem not found")
    return item


@router.get("/items/{item_id}/stock")
async def get_item_stock(
    item_id: int = Path(
        ...,
        gt=0,
    ),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(
        require_internal_user
    ),
):
    result = await db.execute(select(Stock).where(Stock.item_id == item_id))
    return result.scalars().all()


# ── Warehouses ──────────────────────────────────────────────────────────────
@router.post("/warehouses")
async def create_warehouse(
    data: WarehouseCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    try:
        wh = await _svc(
            db
        ).get_or_create_warehouse(
            **data.model_dump()
        )
        await db.commit()
        await db.refresh(wh)
        return wh
    except ValueError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        ) from error
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Warehouse name or code already exists"
            ),
        ) from error


@router.get("/warehouses")
async def list_warehouses(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    result = await db.execute(
        select(Warehouse).order_by(
            Warehouse.name
        )
    )
    return [
        _warehouse_payload(warehouse)
        for warehouse in result.scalars().all()
    ]


@router.get("/warehouses/{warehouse_id}/stock")
async def get_warehouse_stock(
    warehouse_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    result = await db.execute(select(Stock).where(Stock.warehouse_id == warehouse_id))
    return result.scalars().all()


# ── Stock lines ─────────────────────────────────────────────────────────────
@router.get("/lines")
async def list_stock_lines(
    item_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    q = select(Stock)
    if item_id is not None:
        q = q.where(
            Stock.item_id == item_id
        )
    if warehouse_id is not None:
        q = q.where(
            Stock.warehouse_id ==
            warehouse_id
        )
    result = await db.execute(q)
    return [
        _stock_line_payload(line)
        for line in result.scalars().all()
    ]


# ── Receptions ──────────────────────────────────────────────────────────────
@router.post("/receptions")
async def add_reception(
    item_id: int = Query(
        ...,
        gt=0,
    ),
    warehouse_id: int = Query(
        ...,
        gt=0,
    ),
    quantity: int = Query(
        ...,
        gt=0,
    ),
    batch_number: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    job_id: Optional[int] = Query(
        None,
        gt=0,
    ),
    technician_id: Optional[int] = Query(
        None,
        gt=0,
    ),
    notes: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_orienteur_or_above
    ),
):
    try:
        line = await _svc(db).add_stock(
            item_id=item_id,
            warehouse_id=warehouse_id,
            quantity=quantity,
            batch_number=batch_number,
            operator=operator,
            job_id=job_id,
            technician_id=technician_id,
            created_by=current_user.id,
            notes=notes,
        )
        await db.commit()
        await db.refresh(line)
        return _stock_line_payload(line)
    except ValueError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock reception conflicts with existing data",
        ) from error


# ── Issues (bons de sortie) ─────────────────────────────────────────────────
@router.post("/issues")
async def create_issue(
    data: StockIssueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_orienteur_or_above
    ),
):
    issue = await _svc(db).create_issue(
        **data.dict(
            exclude={
                "items",
                "issued_by",
            }
        ),
        issued_by=current_user.id,
        items=[
            item.dict()
            for item in data.items
        ],
    )
    await db.commit()
    await db.refresh(issue)
    return issue


@router.post("/issues/{issue_id}/validate")
async def validate_issue(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        require_orienteur_or_above
    ),
):
    issue = await _svc(db).validate_issue(issue_id, validated_by=current_user.id)
    await db.commit()
    await db.refresh(issue)
    return issue


# ── Returns (retours) ───────────────────────────────────────────────────────
@router.post("/returns")
async def create_return(
    data: StockReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    ret = await _svc(db).create_return(
        **data.dict(exclude={"items"}),
        returned_by=current_user.id,
        items=[i.dict() for i in data.items],
    )
    await db.commit()
    await db.refresh(ret)
    return ret


@router.post("/returns/{return_id}/validate")
async def validate_return(
    return_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    ret = await _svc(db).validate_return(return_id, validated_by=current_user.id)
    await db.commit()
    await db.refresh(ret)
    return ret


# ── Consumptions (consommations) ────────────────────────────────────────────
@router.post("/consumptions")
async def create_consumption(
    data: StockConsumptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    consumption = await _svc(db).create_consumption(
        **data.dict(exclude={"items"}),
        created_by=current_user.id,
        items=[i.dict() for i in data.items],
    )
    await db.commit()
    await db.refresh(consumption)
    return consumption


@router.post("/consumptions/{consumption_id}/validate")
async def validate_consumption(
    consumption_id: int,
    warehouse_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    consumption = await _svc(db).validate_consumption(
        consumption_id,
        validated_by=current_user.id,
        warehouse_id=warehouse_id,
    )
    await db.commit()
    await db.refresh(consumption)
    return consumption


# ── Inventories ──────────────────────────────────────────────────────────────
@router.post("/inventories")
async def create_inventory(
    data: InventoryCountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    inv = await _svc(db).create_inventory(
        **data.dict(exclude={"items"}),
        counted_by=current_user.id,
        items=[i.dict() for i in data.items] if data.items else None,
    )
    await db.commit()
    await db.refresh(inv)
    return inv


@router.post("/inventories/{inventory_count_id}/validate")
async def validate_inventory(
    inventory_count_id: int,
    apply_adjustments: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    inv = await _svc(db).validate_inventory(
        inventory_count_id,
        validated_by=current_user.id,
        apply_adjustments=apply_adjustments,
    )
    await db.commit()
    await db.refresh(inv)
    return inv


# ── Movements (historique) ──────────────────────────────────────────────────
@router.get("/movements")
async def list_movements(
    item_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    movement_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    job_id: Optional[int] = Query(None),
    technician_id: Optional[int] = Query(None),
    created_by: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    enum_type = None
    if movement_type:
        try:
            enum_type = StockMovementType(
                movement_type
            )
        except ValueError:
            enum_type = None
    rows = await _svc(db).get_movements(
        item_id=item_id,
        warehouse_id=warehouse_id,
        movement_type=enum_type,
        operator=operator,
        job_id=job_id,
        technician_id=technician_id,
        created_by=created_by,
    )
    return [
        _movement_payload(movement)
        for movement in rows
    ]


# ============================================================ #
# PHASE 3 — API simplifiée avec pagination/recherche/filtres
# ============================================================ #


@simple_router.get("/lines")
async def get_stock(
    search: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    """GET /stock/lines — Retourne les lignes FTTH paginées."""
    offset = (page - 1) * size
    q = select(Stock)
    count_q = select(func.count(Stock.id))

    if warehouse_id is not None:
        q = q.where(Stock.warehouse_id == warehouse_id)
        count_q = count_q.where(Stock.warehouse_id == warehouse_id)

    if search:
        items_sub = select(StockItem.id).where(
            or_(
                StockItem.reference.ilike(f"%{search}%"),
                StockItem.label.ilike(f"%{search}%"),
                StockItem.equipment_type.ilike(f"%{search}%"),
                StockItem.operator.ilike(f"%{search}%"),
            )
        ).subquery()
        q = q.where(Stock.item_id.in_(select(items_sub.c.id)))
        count_q = count_q.where(Stock.item_id.in_(select(items_sub.c.id)))

    if equipment_type:
        items_sub = select(StockItem.id).where(StockItem.equipment_type == equipment_type).subquery()
        q = q.where(Stock.item_id.in_(select(items_sub.c.id)))
        count_q = count_q.where(Stock.item_id.in_(select(items_sub.c.id)))

    if operator:
        items_sub = select(StockItem.id).where(StockItem.operator == operator).subquery()
        q = q.where(Stock.item_id.in_(select(items_sub.c.id)))
        count_q = count_q.where(Stock.item_id.in_(select(items_sub.c.id)))

    total = (await db.execute(count_q)).scalar() or 0
    q = q.offset(offset).limit(size).order_by(Stock.item_id)
    rows = (await db.execute(q)).scalars().all()

    data = []
    for r in rows:
        item = await db.get(StockItem, r.item_id)
        wh = await db.get(Warehouse, r.warehouse_id)
        data.append({
            "id": r.id,
            "item_id": r.item_id,
            "reference": item.reference if item else None,
            "label": item.label if item else None,
            "equipment_type": item.equipment_type if item else None,
            "operator": item.operator if item else None,
            "warehouse_id": r.warehouse_id,
            "warehouse_name": wh.name if wh else None,
            "quantity": r.quantity,
            "reserved_quantity": r.reserved_quantity,
            "available_quantity": r.available_quantity,
            "batch_number": r.batch_number,
        })

    return {"total": total, "page": page, "size": size, "data": data}


@simple_router.get("/items")
async def get_stock_items(
    search: Optional[str] = Query(None),
    equipment_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    """GET /stock/items — Retourne le catalogue articles avec pagination et filtres."""
    offset = (page - 1) * size
    q = select(StockItem)
    count_q = select(func.count(StockItem.id))

    if search:
        filt = or_(
            StockItem.reference.ilike(f"%{search}%"),
            StockItem.label.ilike(f"%{search}%"),
            StockItem.equipment_type.ilike(f"%{search}%"),
            StockItem.operator.ilike(f"%{search}%"),
        )
        q = q.where(filt)
        count_q = count_q.where(filt)

    if equipment_type:
        q = q.where(StockItem.equipment_type == equipment_type)
        count_q = count_q.where(StockItem.equipment_type == equipment_type)

    if operator:
        q = q.where(StockItem.operator == operator)
        count_q = count_q.where(StockItem.operator == operator)

    total = (await db.execute(count_q)).scalar() or 0
    q = q.offset(offset).limit(size).order_by(StockItem.created_at.desc())
    items = (await db.execute(q)).scalars().all()

    return {"total": total, "page": page, "size": size, "data": items}


@simple_router.post("/issue")
async def post_stock_issue(
    warehouse_id: int = Query(...),
    technician_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    operator: Optional[str] = Query(None),
    notes: Optional[str] = Query(None),
    items: str = Query(..., description='JSON list: [{"item_id":1,"quantity":5}]'),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    """POST /stock/issue — Crée et valide un bon de sortie."""
    parsed = _parse_stock_items(items)
    create = StockIssueCreate(
        warehouse_id=warehouse_id,
        technician_id=technician_id,
        job_id=job_id,
        operator=operator,
        notes=notes,
        items=[{"item_id": i.get("item_id"), "quantity": i.get("quantity")} for i in parsed],
    )
    issue = await _svc(db).create_issue(
        **create.dict(exclude={"items"}),
        issued_by=current_user.id,
        items=[i.dict() for i in create.items],
    )
    issue = await _svc(db).validate_issue(issue.id, validated_by=current_user.id)
    await db.commit()
    await db.refresh(issue)
    return {"id": issue.id, "issue_number": issue.issue_number, "status": issue.status.value}


@simple_router.post("/return")
async def post_stock_return(
    warehouse_id: int = Query(...),
    technician_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    operator: Optional[str] = Query(None),
    notes: Optional[str] = Query(None),
    items: str = Query(..., description='JSON list: [{"item_id":1,"quantity":3}]'),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    """POST /stock/return — Crée et valide un bon de retour."""
    parsed = _parse_stock_items(items)
    create = StockReturnCreate(
        warehouse_id=warehouse_id,
        technician_id=technician_id,
        job_id=job_id,
        operator=operator,
        notes=notes,
        items=[{"item_id": i.get("item_id"), "quantity": i.get("quantity")} for i in parsed],
    )
    ret = await _svc(db).create_return(
        **create.dict(exclude={"items"}),
        returned_by=current_user.id,
        items=[i.dict() for i in create.items],
    )
    ret = await _svc(db).validate_return(ret.id, validated_by=current_user.id)
    await db.commit()
    await db.refresh(ret)
    return {"id": ret.id, "return_number": ret.return_number, "status": ret.status.value}


@simple_router.post("/consume")
async def post_stock_consume(
    job_id: Optional[int] = Query(None),
    technician_id: Optional[int] = Query(None),
    operator: Optional[str] = Query(None),
    notes: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    items: str = Query(..., description='JSON list: [{"item_id":1,"quantity":2}]'),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    """POST /stock/consume — Crée et valide une consommation."""
    parsed = _parse_stock_items(items)
    create = StockConsumptionCreate(
        job_id=job_id,
        technician_id=technician_id,
        operator=operator,
        notes=notes,
        warehouse_id=warehouse_id,
        items=[{"item_id": i.get("item_id"), "quantity": i.get("quantity")} for i in parsed],
    )
    consumption = await _svc(db).create_consumption(
        **create.dict(exclude={"items"}),
        created_by=current_user.id,
        items=[i.dict() for i in create.items],
    )
    consumption = await _svc(db).validate_consumption(
        consumption.id,
        validated_by=current_user.id,
        warehouse_id=warehouse_id,
    )
    await db.commit()
    await db.refresh(consumption)
    return {"id": consumption.id, "consumption_number": consumption.consumption_number, "status": consumption.status.value}


@simple_router.post("/adjustment")
async def post_stock_adjustment(
    item_id: int = Query(...),
    warehouse_id: int = Query(...),
    quantity: int = Query(...),
    reason: str = Query("ajustement"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    """POST /stock/adjustment — Ajuste la quantité (positif = entrée, négatif = perte/casse)."""
    if quantity > 0:
        line = await _svc(db).add_stock(
            item_id=item_id, warehouse_id=warehouse_id, quantity=quantity,
            created_by=current_user.id, notes=reason, reference_type="adjustment",
        )
    else:
        line = await _svc(db).write_off_stock(
            item_id=item_id, warehouse_id=warehouse_id, quantity=abs(quantity),
            created_by=current_user.id, notes=reason, reference_type="adjustment",
        )
    await db.commit()
    await db.refresh(line)
    return {"id": line.id, "item_id": item_id, "warehouse_id": warehouse_id, "quantity": line.quantity}


@simple_router.get("/history")
async def get_stock_history(
    item_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    movement_type: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    job_id: Optional[int] = Query(None),
    technician_id: Optional[int] = Query(None),
    created_by: Optional[int] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_internal_user),
):
    """GET /stock/history — Historique paginé avec filtres complets et recherche."""
    offset = (page - 1) * size
    q = select(StockMovement)
    count_q = select(func.count(StockMovement.id))

    if search:
        items_sub = select(StockItem.id).where(
            or_(
                StockItem.reference.ilike(f"%{search}%"),
                StockItem.label.ilike(f"%{search}%"),
                StockItem.equipment_type.ilike(f"%{search}%"),
                StockItem.operator.ilike(f"%{search}%"),
            )
        ).subquery()
        q = q.where(StockMovement.item_id.in_(select(items_sub.c.id)))
        count_q = count_q.where(StockMovement.item_id.in_(select(items_sub.c.id)))

    if item_id is not None:
        q = q.where(StockMovement.item_id == item_id)
        count_q = count_q.where(StockMovement.item_id == item_id)

    if warehouse_id is not None:
        q = q.where(StockMovement.warehouse_id == warehouse_id)
        count_q = count_q.where(StockMovement.warehouse_id == warehouse_id)

    if movement_type:
        q = q.where(StockMovement.movement_type == movement_type)
        count_q = count_q.where(StockMovement.movement_type == movement_type)

    if operator:
        q = q.where(StockMovement.operator == operator)
        count_q = count_q.where(StockMovement.operator == operator)

    if job_id is not None:
        q = q.where(StockMovement.job_id == job_id)
        count_q = count_q.where(StockMovement.job_id == job_id)

    if technician_id is not None:
        q = q.where(StockMovement.technician_id == technician_id)
        count_q = count_q.where(StockMovement.technician_id == technician_id)

    if created_by is not None:
        q = q.where(StockMovement.created_by == created_by)
        count_q = count_q.where(StockMovement.created_by == created_by)

    if from_date:
        try:
            dt = datetime.fromisoformat(from_date)
            q = q.where(StockMovement.created_at >= dt)
            count_q = count_q.where(StockMovement.created_at >= dt)
        except ValueError:
            pass

    if to_date:
        try:
            dt = datetime.fromisoformat(to_date)
            q = q.where(StockMovement.created_at <= dt)
            count_q = count_q.where(StockMovement.created_at <= dt)
        except ValueError:
            pass

    total = (await db.execute(count_q)).scalar() or 0
    q = q.order_by(desc(StockMovement.created_at)).offset(offset).limit(size)
    rows = (await db.execute(q)).scalars().all()

    data = []
    for r in rows:
        item = await db.get(StockItem, r.item_id) if r.item_id else None
        wh = await db.get(Warehouse, r.warehouse_id) if r.warehouse_id else None
        data.append({
            "id": r.id,
            "item_id": r.item_id,
            "reference": item.reference if item else None,
            "label": item.label if item else None,
            "equipment_type": item.equipment_type if item else None,
            "operator": item.operator if item else None,
            "warehouse_id": r.warehouse_id,
            "warehouse_name": wh.name if wh else None,
            "movement_type": r.movement_type.value if r.movement_type else None,
            "quantity": r.quantity,
            "quantity_before": r.quantity_before,
            "quantity_after": r.quantity_after,
            "reference_type": r.reference_type,
            "reference_id": r.reference_id,
            "job_id": r.job_id,
            "technician_id": r.technician_id,
            "notes": r.notes,
            "created_by": r.created_by,
            "created_at": r.created_at,
        })

    return {"total": total, "page": page, "size": size, "data": data}
