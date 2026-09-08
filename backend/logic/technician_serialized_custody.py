"""Read-only serialized equipment custody for the authenticated technician.

Legacy ``EquipmentInventory`` stores custody markers as strings in ``warehouse``
and ``vehicle``. The scanner already treats exact technician/warehouse markers as
a verified custody signal; this module reuses that same rule so the stock screen
and scan validation cannot disagree about ownership.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import EquipmentInventory
from backend.logic.technician_stock import (
    _inventory_custody_matches,
    get_technician_warehouse,
)


async def technician_serialized_custody_payload(
    db: AsyncSession,
    *,
    technician_id: int,
) -> list[dict[str, Any]]:
    warehouse = await get_technician_warehouse(
        db,
        technician_id=technician_id,
    )

    candidates = (
        await db.execute(
            select(EquipmentInventory)
            .where(
                or_(
                    EquipmentInventory.warehouse.is_not(None),
                    EquipmentInventory.vehicle.is_not(None),
                )
            )
            .order_by(
                EquipmentInventory.equipment_type.asc(),
                EquipmentInventory.model.asc().nullslast(),
                EquipmentInventory.serial_number.asc(),
                EquipmentInventory.id.asc(),
            )
        )
    ).scalars().all()

    items = []
    for inventory in candidates:
        if not _inventory_custody_matches(
            inventory,
            technician_id=technician_id,
            warehouse=warehouse,
        ):
            continue
        items.append(
            {
                "inventory_id": inventory.id,
                "serial_number": inventory.serial_number,
                "mac_address": inventory.mac_address,
                "operator": inventory.operator,
                "equipment_type": inventory.equipment_type,
                "model": inventory.model,
                "status": inventory.status,
                "assigned_job_id": inventory.assigned_job_id,
                "custody_warehouse_id": warehouse.id if warehouse is not None else None,
                "custody_warehouse_code": warehouse.code if warehouse is not None else None,
                "custody_verified": True,
            }
        )
    return items
