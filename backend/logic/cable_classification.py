"""Governed cable selection for GoVector field captures.

Cable entry/exit events identify a real cable from the governed catalogue and a
controlled installation mode. The mobile client may send display labels, but
the server rebuilds canonical cable identity from server data so forged/free-
text labels never become authoritative.

For the GoVector pilot, zero or unknown technician custody does NOT block a real
field observation. The payload records whether stock was known; measured usage
is reconciled separately as observed cable consumption.
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


CABLE_CAPTURE_SCHEMA_VERSION = 2

# Small delivery vocabulary matching the Praxedo activity shown by the user.
# It stays governed/configurable rather than accepting arbitrary free text.
INSTALLATION_MODES: dict[str, str] = {
    "CONDUITE_PEHD": "Conduite / sous PEHD",
    "FACADE": "Façade / immeuble",
    "AERIEN": "Aérien",
    "AUTRE": "Autre",
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


def _positive_item_id(raw: Any) -> int:
    if isinstance(raw, bool):
        raise TechnicianJobMutationError(
            "rejected", "cable_type_required", "Choisissez le type de câble"
        )
    try:
        item_id = int(raw)
    except (TypeError, ValueError) as exc:
        raise TechnicianJobMutationError(
            "rejected", "cable_type_required", "Choisissez le type de câble"
        ) from exc
    if item_id <= 0:
        raise TechnicianJobMutationError(
            "rejected", "cable_type_required", "Choisissez le type de câble"
        )
    return item_id


async def normalize_cable_capture_payload(
    db: AsyncSession,
    *,
    payload: dict[str, Any],
    current_user: User,
) -> None:
    """Validate and canonicalize one cable entry/exit payload in-place."""

    technician_id = current_user.technician_id
    if technician_id is None:
        raise TechnicianJobMutationError(
            "rejected", "technician_profile_missing", "Profil technicien manquant"
        )

    item_id = _positive_item_id(payload.get("cable_item_id"))
    mode_code, mode_label = normalize_installation_mode(
        payload.get("installation_mode_code")
    )

    item = await db.get(StockItem, item_id)
    if item is None or not getattr(item, "is_active", True):
        raise TechnicianJobMutationError(
            "rejected", "cable_type_unavailable", "Le type de câble est indisponible"
        )
    if not is_cable_catalog_item(item):
        raise TechnicianJobMutationError(
            "conflict",
            "stock_item_not_cable",
            "L'article sélectionné n'est pas configuré comme câble",
        )

    warehouse = await get_technician_warehouse(
        db,
        technician_id=technician_id,
    )
    lines = []
    if warehouse is not None:
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

    reference = str(getattr(item, "reference", None) or "").strip()
    type_code = reference or f"STOCK_ITEM_{item_id}"
    label = str(getattr(item, "label", None) or type_code).strip()

    payload.update(
        {
            "cable_capture_schema": CABLE_CAPTURE_SCHEMA_VERSION,
            "cable_item_id": item_id,
            "cable_reference": reference or f"stock-item:{item_id}",
            "cable_type_code": type_code,
            "cable_type_label": label,
            "cable_type_source": (
                "technician_custody" if available > 0 else "catalogue_observed"
            ),
            "cable_stock_unit": getattr(item, "unit", None),
            "cable_stock_available": available,
            "cable_stock_registered": stock_registered,
            "cable_stock_known": available > 0,
            "installation_mode_code": mode_code,
            "installation_mode_label": mode_label,
        }
    )
