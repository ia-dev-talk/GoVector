"""Governed cable selection for GoVector field captures.

The pilot exposes only the three cable families confirmed for delivery: FO16,
FO64 and FO96. A technician may observe/use one of those families even when no
prior warehouse allocation exists. Stock is therefore informative at capture
time and never blocks the field observation; missing custody is flagged for
later reconciliation instead of being fabricated.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Stock, StockItem, User
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.technician_stock import get_technician_warehouse


CABLE_CAPTURE_SCHEMA_VERSION = 3

PILOT_CABLE_TYPES: dict[str, str] = {
    "FO16": "FO16",
    "FO64": "FO64",
    "FO96": "FO96",
}

INSTALLATION_MODES: dict[str, str] = {
    "CONDUITE_PEHD": "Pose câble FO en conduite / sous PEHD",
    "FACADE": "Pose câble FO en façade ou immeuble",
    "AERIEN": "Pose câble FO en aérien",
}

INSTALLATION_MODE_ALIASES: dict[str, str] = {
    "CONDUITE": "CONDUITE_PEHD",
    "SOUS_PEHD": "CONDUITE_PEHD",
    "PEHD": "CONDUITE_PEHD",
    "CONDUITE_SOUS_PEHD": "CONDUITE_PEHD",
    "FACADE_IMMEUBLE": "FACADE",
    "IMMEUBLE": "FACADE",
}

_METER_UNITS = {
    "M",
    "METRE",
    "METRES",
    "METER",
    "METERS",
}


def _ascii_token(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^A-Z0-9]+", "_", text.upper()).strip("_")


def is_cable_catalog_item(item: StockItem | Any) -> bool:
    """Classify a stock catalogue row as a cable without relying on its label."""
    equipment_type = _ascii_token(getattr(item, "equipment_type", None))
    unit = _ascii_token(getattr(item, "unit", None))
    return "CABL" in equipment_type or unit in _METER_UNITS


def pilot_cable_code(item: StockItem | Any) -> str | None:
    """Return FO16/FO64/FO96 when a real catalogue row represents one family."""
    if not is_cable_catalog_item(item):
        return None
    haystack = "_".join(
        _ascii_token(getattr(item, key, None))
        for key in ("reference", "label", "model", "equipment_type")
    )
    compact = haystack.replace("_", "")
    for code in PILOT_CABLE_TYPES:
        if code in compact:
            return code
    return None


def normalize_pilot_cable_code(raw: Any) -> str:
    code = _ascii_token(raw).replace("_", "")
    if code not in PILOT_CABLE_TYPES:
        raise TechnicianJobMutationError(
            "rejected",
            "cable_type_unavailable",
            "Choisissez un câble FO16, FO64 ou FO96",
        )
    return code


def normalize_installation_mode(raw: Any) -> tuple[str, str]:
    code = _ascii_token(raw)
    code = INSTALLATION_MODE_ALIASES.get(code, code)
    label = INSTALLATION_MODES.get(code)
    if label is None:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_installation_mode",
            "Choisissez un mode de pose câble autorisé",
        )
    return code, label


def _optional_item_id(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


async def normalize_cable_capture_payload(
    db: AsyncSession,
    *,
    payload: dict[str, Any],
    current_user: User,
) -> None:
    """Validate and canonicalize one cable entry/exit payload in-place.

    A governed pilot family is sufficient to capture field truth. When a real
    StockItem exists it is linked and its custody quantity is recorded. When it
    does not exist yet, the capture remains valid and is explicitly marked for
    later stock reconciliation.
    """
    technician_id = current_user.technician_id
    if technician_id is None:
        raise TechnicianJobMutationError(
            "rejected", "technician_profile_missing", "Profil technicien manquant"
        )

    requested_code = normalize_pilot_cable_code(
        payload.get("cable_type_code")
        or payload.get("cable_reference")
        or payload.get("cable_type_label")
    )
    mode_code, mode_label = normalize_installation_mode(
        payload.get("installation_mode_code")
    )

    item_id = _optional_item_id(payload.get("cable_item_id"))
    item: StockItem | None = None
    if item_id is not None:
        item = await db.get(StockItem, item_id)
        if item is None or not getattr(item, "is_active", True):
            item = None
        elif pilot_cable_code(item) != requested_code:
            raise TechnicianJobMutationError(
                "conflict",
                "cable_catalogue_mismatch",
                "La référence de stock ne correspond pas au type de câble choisi",
            )

    # If the app did not know a StockItem id, link an existing governed row when
    # possible. This keeps the mobile independent from prior technician custody.
    if item is None:
        candidates = (
            await db.execute(
                select(StockItem)
                .where(StockItem.is_active.is_(True))
                .order_by(StockItem.id.asc())
            )
        ).scalars().all()
        item = next(
            (candidate for candidate in candidates if pilot_cable_code(candidate) == requested_code),
            None,
        )
        item_id = item.id if item is not None else None

    warehouse = await get_technician_warehouse(db, technician_id=technician_id)
    lines = []
    if warehouse is not None and item_id is not None:
        lines = (
            await db.execute(
                select(Stock).where(
                    Stock.warehouse_id == warehouse.id,
                    Stock.item_id == item_id,
                )
            )
        ).scalars().all()
    available = sum(max(int(line.available_quantity or 0), 0) for line in lines)
    stock_registered = bool(lines)
    requires_reconciliation = not stock_registered or available <= 0

    payload.update(
        {
            "cable_capture_schema": CABLE_CAPTURE_SCHEMA_VERSION,
            "cable_item_id": item_id,
            "cable_reference": requested_code,
            "cable_type_code": requested_code,
            "cable_type_label": PILOT_CABLE_TYPES[requested_code],
            "cable_type_source": (
                "technician_custody"
                if available > 0
                else "governed_pilot_catalogue"
            ),
            "cable_stock_unit": getattr(item, "unit", None) or "m",
            "cable_stock_available": available,
            "cable_stock_registered": stock_registered,
            "cable_stock_known": available > 0,
            "stock_reconciliation_required": requires_reconciliation,
            "installation_mode_code": mode_code,
            "installation_mode_label": mode_label,
        }
    )
