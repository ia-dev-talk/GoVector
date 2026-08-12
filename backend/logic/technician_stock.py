"""Technician custody stock operations for the field application.

The V2 allocation workflow moves physical units into a deterministic warehouse
(`TECH-{technician_id}`). Field consumption must therefore debit AVAILABLE
custody, not the historical reservation bucket. Functions in this module never
commit: callers own the surrounding sync/savepoint transaction.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    EquipmentInventory,
    Job,
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
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)


def technician_warehouse_code(technician_id: int) -> str:
    return f"TECH-{technician_id}"


async def get_technician_warehouse(
    db: AsyncSession,
    *,
    technician_id: int,
    lock: bool = False,
) -> Warehouse | None:
    statement = select(Warehouse).where(
        Warehouse.code == technician_warehouse_code(technician_id),
        Warehouse.is_active.is_(True),
    )
    if lock:
        statement = statement.with_for_update()
    return await db.scalar(statement)


async def technician_stock_payload(
    db: AsyncSession,
    *,
    technician_id: int,
) -> list[dict[str, Any]]:
    warehouse = await get_technician_warehouse(
        db,
        technician_id=technician_id,
    )
    if warehouse is None:
        return []

    rows = (
        await db.execute(
            select(Stock, StockItem)
            .join(StockItem, Stock.item_id == StockItem.id)
            .where(
                Stock.warehouse_id == warehouse.id,
                StockItem.is_active.is_(True),
            )
            .order_by(
                StockItem.equipment_type.asc(),
                StockItem.label.asc(),
                StockItem.reference.asc(),
                Stock.id.asc(),
            )
        )
    ).all()

    aggregated: dict[int, dict[str, Any]] = {}
    for stock, item in rows:
        record = aggregated.setdefault(
            item.id,
            {
                "item_id": item.id,
                "reference": item.reference,
                "label": item.label,
                "equipment_type": item.equipment_type,
                "operator": item.operator,
                "manufacturer": item.manufacturer,
                "model": item.model,
                "unit": item.unit,
                "warehouse_id": warehouse.id,
                "warehouse_name": warehouse.name,
                "quantity": 0,
                "reserved_quantity": 0,
                "available_quantity": 0,
            },
        )
        record["quantity"] += max(int(stock.quantity or 0), 0)
        record["reserved_quantity"] += max(int(stock.reserved_quantity or 0), 0)
        record["available_quantity"] += max(int(stock.available_quantity or 0), 0)
    return list(aggregated.values())


def _positive_int(value: Any, *, field: str) -> int:
    if isinstance(value, bool):
        raise TechnicianJobMutationError(
            "rejected", "invalid_material_quantity", f"{field} doit être un entier positif"
        )
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise TechnicianJobMutationError(
            "rejected", "invalid_material_quantity", f"{field} doit être un entier positif"
        ) from exc
    if parsed <= 0:
        raise TechnicianJobMutationError(
            "rejected", "invalid_material_quantity", f"{field} doit être supérieur à zéro"
        )
    return parsed


def _normalized_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        if payload.get("item_id") is not None:
            raw_items = [payload]
        else:
            raise TechnicianJobMutationError(
                "rejected",
                "invalid_material_payload",
                "Sélectionnez au moins un article du stock technicien",
            )

    if not raw_items or len(raw_items) > 30:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_material_payload",
            "Une déclaration doit contenir entre 1 et 30 lignes de matériel",
        )

    normalized: list[dict[str, Any]] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            raise TechnicianJobMutationError(
                "rejected", "invalid_material_payload", "Ligne de matériel invalide"
            )
        item_id = _positive_int(raw.get("item_id"), field="item_id")
        quantity = _positive_int(raw.get("quantity", 1), field="quantité")
        normalized.append(
            {
                "item_id": item_id,
                "quantity": quantity,
                "serial_number": str(raw.get("serial_number") or "").strip() or None,
                "mac_address": str(raw.get("mac_address") or "").strip() or None,
            }
        )
    return normalized


async def consume_technician_material(
    db: AsyncSession,
    *,
    job_id: int,
    payload: dict[str, Any],
    current_user: User,
    event_id: str | None = None,
    occurred_at: datetime | None = None,
) -> StockConsumption:
    """Atomically debit material from the authenticated technician custody.

    This function is intentionally commit-free so technician sync can keep the
    stock mutation and the idempotency receipt in the same savepoint.
    """

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
    warehouse = await get_technician_warehouse(
        db,
        technician_id=technician_id,
        lock=True,
    )
    if warehouse is None:
        raise TechnicianJobMutationError(
            "rejected",
            "technician_stock_missing",
            "Aucune dotation n'est disponible pour ce technicien",
        )

    requested = _normalized_items(payload)
    now = occurred_at or datetime.now(timezone.utc)
    suffix = re.sub(r"[^A-Za-z0-9]", "", event_id or "")[-16:] or uuid4().hex[:16]
    consumption = StockConsumption(
        consumption_number=f"MOB-{technician_id}-{suffix}",
        job_id=job_id,
        technician_id=technician_id,
        operator=(str(payload.get("operator") or "").strip() or job.operator),
        status=StockConsumptionStatus.VALIDE,
        notes=str(payload.get("note") or payload.get("value") or "").strip() or None,
        created_by=current_user.id,
        validated_by=current_user.id,
        validated_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(consumption)
    await db.flush()

    for request in requested:
        item = await db.get(StockItem, request["item_id"])
        if item is None or not item.is_active:
            raise TechnicianJobMutationError(
                "rejected",
                "stock_item_unavailable",
                f"Article #{request['item_id']} indisponible",
            )
        if job.operator and item.operator and item.operator != job.operator:
            raise TechnicianJobMutationError(
                "conflict",
                "operator_mismatch",
                (
                    f"{item.label} appartient à l'opérateur {item.operator}, "
                    f"pas à {job.operator}"
                ),
            )

        stock_lines = (
            await db.execute(
                select(Stock)
                .where(
                    Stock.warehouse_id == warehouse.id,
                    Stock.item_id == item.id,
                    Stock.available_quantity > 0,
                )
                .order_by(
                    Stock.expiration_date.asc().nullslast(),
                    Stock.id.asc(),
                )
                .with_for_update()
            )
        ).scalars().all()
        available = sum(max(int(line.available_quantity or 0), 0) for line in stock_lines)
        if available < request["quantity"]:
            raise TechnicianJobMutationError(
                "conflict",
                "insufficient_technician_stock",
                (
                    f"Stock insuffisant pour {item.label}: "
                    f"{available} disponible, {request['quantity']} demandé"
                ),
            )

        db.add(
            StockConsumptionItem(
                consumption_id=consumption.id,
                item_id=item.id,
                quantity=request["quantity"],
                serial_number=request["serial_number"],
                mac_address=request["mac_address"],
            )
        )

        remaining = request["quantity"]
        for line in stock_lines:
            if remaining <= 0:
                break
            line_available = max(int(line.available_quantity or 0), 0)
            if line_available <= 0:
                continue
            used = min(line_available, remaining)
            before = int(line.quantity or 0)
            line.quantity = before - used
            line.available_quantity = int(line.available_quantity or 0) - used
            db.add(
                StockMovement(
                    item_id=item.id,
                    warehouse_id=warehouse.id,
                    movement_type=StockMovementType.CONSOMMATION,
                    quantity=-used,
                    quantity_before=before,
                    quantity_after=line.quantity,
                    reference_type="technician_consumption",
                    reference_id=consumption.id,
                    operator=item.operator or job.operator,
                    job_id=job_id,
                    technician_id=technician_id,
                    notes=consumption.notes,
                    created_by=current_user.id,
                    created_at=now,
                )
            )
            remaining -= used

    await db.flush()
    return consumption


def _parse_scanned_code(raw_code: str) -> dict[str, str | None]:
    raw = raw_code.strip()
    parsed: dict[str, str | None] = {
        "serial_number": None,
        "mac_address": None,
        "operator": None,
    }
    for token in re.split(r"[;|,\n\r]+", raw):
        if ":" in token:
            key, value = token.split(":", 1)
        elif "=" in token:
            key, value = token.split("=", 1)
        else:
            continue
        key = re.sub(r"[^A-Z0-9]", "", key.upper())
        value = value.strip()
        if not value:
            continue
        if key in {"SN", "SERIAL", "SERIALNUMBER", "SNO"}:
            parsed["serial_number"] = value
        elif key in {"MAC", "MACADDRESS", "MACADDR"}:
            parsed["mac_address"] = value
        elif key in {"OP", "OPERATOR", "OPERATEUR"}:
            parsed["operator"] = value
    if parsed["serial_number"] is None:
        parsed["serial_number"] = raw
    return parsed


async def resolve_equipment_scan(
    db: AsyncSession,
    *,
    raw_code: str,
    job_id: int,
    current_user: User,
) -> dict[str, Any]:
    technician_id = current_user.technician_id
    if technician_id is None:
        raise TechnicianJobMutationError(
            "rejected", "technician_profile_missing", "Profil technicien manquant"
        )
    job = await require_assigned_job(
        db,
        job_id=job_id,
        current_user=current_user,
    )
    raw = raw_code.strip()
    if not raw or len(raw) > 512:
        raise TechnicianJobMutationError(
            "rejected", "invalid_scan", "Code QR / code-barres invalide"
        )

    parsed = _parse_scanned_code(raw)
    serial = str(parsed.get("serial_number") or "").strip()
    mac = str(parsed.get("mac_address") or "").strip()
    inventory = await db.scalar(
        select(EquipmentInventory).where(
            or_(
                EquipmentInventory.serial_number == serial,
                EquipmentInventory.mac_address == (mac or serial),
            )
        )
    )

    catalogue = await db.scalar(
        select(StockItem).where(
            or_(
                StockItem.reference == raw,
                StockItem.reference == serial,
                StockItem.model == raw,
            )
        )
    )
    warehouse = await get_technician_warehouse(
        db,
        technician_id=technician_id,
    )
    available = 0
    if catalogue is not None and warehouse is not None:
        lines = (
            await db.execute(
                select(Stock).where(
                    Stock.item_id == catalogue.id,
                    Stock.warehouse_id == warehouse.id,
                )
            )
        ).scalars().all()
        available = sum(max(int(line.available_quantity or 0), 0) for line in lines)

    operator = (
        (inventory.operator if inventory is not None else None)
        or (catalogue.operator if catalogue is not None else None)
        or parsed.get("operator")
    )
    equipment_type = (
        (inventory.equipment_type if inventory is not None else None)
        or (catalogue.equipment_type if catalogue is not None else None)
    )
    model = (
        (inventory.model if inventory is not None else None)
        or (catalogue.model if catalogue is not None else None)
    )
    source = (
        "inventory"
        if inventory is not None
        else "catalogue"
        if catalogue is not None
        else "raw"
    )
    operator_match = not bool(job.operator and operator and job.operator != operator)

    return {
        "raw_code": raw,
        "serial_number": inventory.serial_number if inventory is not None else serial,
        "mac_address": inventory.mac_address if inventory is not None else (mac or None),
        "operator": operator,
        "equipment_type": equipment_type,
        "model": model,
        "item_id": catalogue.id if catalogue is not None else None,
        "reference": catalogue.reference if catalogue is not None else None,
        "label": catalogue.label if catalogue is not None else None,
        "available_quantity": available,
        "in_technician_stock": available > 0,
        "job_operator": job.operator,
        "operator_match": operator_match,
        "source": source,
        "confidence": "verified" if source in {"inventory", "catalogue"} else "unverified",
    }
