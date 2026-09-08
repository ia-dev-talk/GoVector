"""Canonical BlueVector payloads waiting for the tenant-specific Praxedo mapping.

The field names below are *not* Praxedo API field names.  They are BlueVector's
stable internal contract.  A tenant adapter maps this shape to the exact
REST/SOAP operation once the customer's Praxedo documentation is available.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any, Iterable, Mapping


class PraxedoPayloadError(ValueError):
    """Raised when canonical integration data is incomplete or unsafe."""


SCHEMA_VERSION = "bluevector.praxedo.canonical.v1"


def _text(value: Any, field: str) -> str:
    result = str(value).strip() if value is not None else ""
    if not result:
        raise PraxedoPayloadError(f"{field}_required")
    return result


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise PraxedoPayloadError("timestamp_must_be_timezone_aware")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _non_negative_number(value: Any, field: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PraxedoPayloadError(f"{field}_must_be_numeric")
    if not math.isfinite(float(value)) or value < 0:
        raise PraxedoPayloadError(f"{field}_must_be_non_negative")
    return value


def canonical_envelope(
    *,
    operation: str,
    entity_type: str,
    local_entity_id: int | str,
    body: Mapping[str, Any],
    occurred_at: datetime,
    external_id: str | None = None,
) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "operation": _text(operation, "operation"),
        "entity": {
            "type": _text(entity_type, "entity_type"),
            "local_id": _text(local_entity_id, "local_entity_id"),
            "external_id": _optional_text(external_id),
        },
        "occurred_at": _utc_iso(occurred_at),
        "body": dict(body),
    }


def _stock_item(item: Mapping[str, Any], *, allow_zero: bool) -> dict[str, Any]:
    quantity = _non_negative_number(item.get("quantity"), "quantity")
    if not allow_zero and quantity == 0:
        raise PraxedoPayloadError("quantity_must_be_positive")

    local_item_id = item.get("local_item_id")
    sku = _optional_text(item.get("sku"))
    external_id = _optional_text(item.get("external_id"))
    if local_item_id is None and sku is None and external_id is None:
        raise PraxedoPayloadError("stock_item_identity_required")

    return {
        "local_item_id": None if local_item_id is None else str(local_item_id),
        "external_id": external_id,
        "sku": sku,
        "quantity": quantity,
        "unit": _text(item.get("unit"), "unit"),
    }


def technician_stock_snapshot(
    *,
    technician_id: int | str,
    captured_at: datetime,
    items: Iterable[Mapping[str, Any]],
    technician_external_id: str | None = None,
) -> dict[str, Any]:
    normalized = [_stock_item(item, allow_zero=True) for item in items]
    normalized.sort(
        key=lambda item: (
            item["external_id"] or "",
            item["sku"] or "",
            item["local_item_id"] or "",
        )
    )
    return canonical_envelope(
        operation="technician_stock_snapshot",
        entity_type="technician",
        local_entity_id=technician_id,
        external_id=technician_external_id,
        occurred_at=captured_at,
        body={
            "captured_at": _utc_iso(captured_at),
            "items": normalized,
        },
    )


def stock_movement(
    *,
    movement_id: int | str,
    movement_type: str,
    technician_id: int | str,
    item: Mapping[str, Any],
    occurred_at: datetime,
    job_id: int | str | None = None,
    visit_id: int | str | None = None,
) -> dict[str, Any]:
    return canonical_envelope(
        operation="stock_movement",
        entity_type="stock_movement",
        local_entity_id=movement_id,
        occurred_at=occurred_at,
        body={
            "movement_type": _text(movement_type, "movement_type"),
            "technician_id": _text(technician_id, "technician_id"),
            "job_id": None if job_id is None else str(job_id),
            "visit_id": None if visit_id is None else str(visit_id),
            "item": _stock_item(item, allow_zero=False),
        },
    )


def intervention_snapshot(
    *,
    job_id: int | str,
    job_number: str | None,
    status: str,
    updated_at: datetime,
    technician_id: int | str | None = None,
    technician_external_id: str | None = None,
    cable_length_m: int | float | None = None,
    custom_fields: Mapping[str, Any] | None = None,
    external_id: str | None = None,
) -> dict[str, Any]:
    cable_length = None
    if cable_length_m is not None:
        cable_length = _non_negative_number(cable_length_m, "cable_length_m")

    return canonical_envelope(
        operation="intervention_snapshot",
        entity_type="intervention",
        local_entity_id=job_id,
        external_id=external_id,
        occurred_at=updated_at,
        body={
            "job_number": _optional_text(job_number),
            "status": _text(status, "status"),
            "technician": None
            if technician_id is None and technician_external_id is None
            else {
                "local_id": None if technician_id is None else str(technician_id),
                "external_id": _optional_text(technician_external_id),
            },
            "cable_length_m": cable_length,
            "custom_fields": dict(custom_fields or {}),
        },
    )


def work_report(
    *,
    job_id: int | str,
    technician_id: int | str,
    completed_at: datetime,
    consumed_items: Iterable[Mapping[str, Any]],
    cable_length_m: int | float | None = None,
    custom_fields: Mapping[str, Any] | None = None,
    intervention_external_id: str | None = None,
) -> dict[str, Any]:
    cable_length = None
    if cable_length_m is not None:
        cable_length = _non_negative_number(cable_length_m, "cable_length_m")

    normalized_items = [_stock_item(item, allow_zero=False) for item in consumed_items]
    normalized_items.sort(
        key=lambda item: (
            item["external_id"] or "",
            item["sku"] or "",
            item["local_item_id"] or "",
        )
    )

    return canonical_envelope(
        operation="work_report",
        entity_type="intervention",
        local_entity_id=job_id,
        external_id=intervention_external_id,
        occurred_at=completed_at,
        body={
            "technician_id": _text(technician_id, "technician_id"),
            "completed_at": _utc_iso(completed_at),
            "consumed_items": normalized_items,
            "cable_length_m": cable_length,
            "custom_fields": dict(custom_fields or {}),
        },
    )
