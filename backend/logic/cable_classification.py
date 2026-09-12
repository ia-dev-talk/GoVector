"""Governed cable selection for GoVector field captures.

The delivery contract exposes only FO16 and FO64. Every capture references one
physical drum CODE that has been assigned from the Web.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import StockItem, User
from backend.logic.cable_drums import (
    CABLE_TYPES,
    INSTALLATION_MODES as DRUM_INSTALLATION_MODES,
    normalize_cable_type,
    normalize_mode,
    parse_mark,
    validate_capture_drum,
)
from backend.logic.technician_jobs import TechnicianJobMutationError


CABLE_CAPTURE_SCHEMA_VERSION = 4

PILOT_CABLE_TYPES: dict[str, str] = {
    code: code for code in sorted(CABLE_TYPES)
}

INSTALLATION_MODES: dict[str, str] = {
    **DRUM_INSTALLATION_MODES,
}

INSTALLATION_MODE_ALIASES: dict[str, str] = {
    "CONDUITE": "SP",
    "SOUS_PEHD": "SP",
    "PEHD": "SP",
    "CONDUITE_SOUS_PEHD": "SP",
    "AERIEN": "TR",
    "FACADE": "FSD",
    "FACADE_IMMEUBLE": "FSD",
    "IMMEUBLE": "FSD",
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
    """Return FO16/FO64 when a real catalogue row represents one family."""
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
    return normalize_cable_type(raw)


def normalize_installation_mode(raw: Any) -> tuple[str, str]:
    return normalize_mode(raw)


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
    event_type: str | None = None,
) -> None:
    """Validate one CODE/type/mode against authoritative Web custody."""
    technician_id = current_user.technician_id
    if technician_id is None:
        raise TechnicianJobMutationError(
            "rejected", "technician_profile_missing", "Profil technicien manquant"
        )

    drum = await validate_capture_drum(
        db, payload=payload, technician_id=technician_id
    )
    requested_code = normalize_pilot_cable_code(drum.cable_type)
    mode_code, mode_label = normalize_installation_mode(
        payload.get("installation_mode_code")
    )
    mark = parse_mark(payload.get("meter_mark_m"), label="Le repère métrique")
    justification = str(payload.get("continuity_justification") or "").strip()
    if event_type == "cable_entry" and abs(drum.current_mark_m - mark) > 0.001 and not justification:
        raise TechnicianJobMutationError(
            "conflict", "cable_continuity_mismatch",
            f"Le prochain départ attendu pour {drum.code} est {drum.current_mark_m:g} m",
        )

    payload.update(
        {
            "cable_capture_schema": CABLE_CAPTURE_SCHEMA_VERSION,
            "cable_item_id": None,
            "cable_drum_id": drum.id,
            "cable_code": drum.code,
            "cable_reference": drum.code,
            "cable_type_code": requested_code,
            "cable_type_label": PILOT_CABLE_TYPES[requested_code],
            "cable_type_source": "assigned_drum",
            "cable_stock_unit": "m",
            "cable_stock_available": drum.current_mark_m,
            "cable_stock_registered": True,
            "cable_stock_known": True,
            "stock_reconciliation_required": False,
            "installation_mode_code": mode_code,
            "installation_mode_label": mode_label,
        }
    )
