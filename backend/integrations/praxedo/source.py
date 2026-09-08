"""Build Praxedo canonical payloads from authoritative BlueVector records.

This layer reads BlueVector only.  It does not know tenant-specific Praxedo
field names and performs no network I/O.  The resulting canonical envelopes are
then mapped by the tenant adapter before :mod:`executor` is allowed to send.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.integration_models import IntegrationExternalReference
from backend.database.models import (
    Assignment,
    Job,
    StockConsumption,
    StockConsumptionItem,
    StockConsumptionStatus,
    StockItem,
)
from backend.integrations.journal import find_external_reference
from backend.integrations.praxedo.payloads import (
    intervention_snapshot,
    technician_stock_snapshot,
    work_report,
)
from backend.logic.technician_stock import technician_stock_payload


class PraxedoSourceError(RuntimeError):
    """Canonical source data is missing or internally inconsistent."""


def _aware_utc(value: datetime | None, *, field: str) -> datetime:
    if value is None:
        raise PraxedoSourceError(f"{field}_missing")
    # BlueVector legacy models used ``datetime.utcnow`` with timezone-aware DB
    # columns. Treat a legacy naive value as UTC at this boundary rather than
    # producing a local-time-dependent integration timestamp.
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def stock_rows_to_canonical_items(
    rows: Iterable[dict[str, Any]],
    *,
    external_ids: dict[int, str] | None = None,
) -> list[dict[str, Any]]:
    refs = external_ids or {}
    result: list[dict[str, Any]] = []
    for row in rows:
        item_id = int(row["item_id"])
        result.append(
            {
                "local_item_id": item_id,
                "external_id": refs.get(item_id),
                "sku": row.get("reference"),
                "quantity": max(int(row.get("available_quantity") or 0), 0),
                "unit": row.get("unit"),
            }
        )
    return result


async def _item_external_ids(
    db: AsyncSession,
    item_ids: Iterable[int],
) -> dict[int, str]:
    ids = sorted({int(item_id) for item_id in item_ids if int(item_id) > 0})
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(IntegrationExternalReference).where(
                IntegrationExternalReference.system == "praxedo",
                IntegrationExternalReference.entity_type == "stock_item",
                IntegrationExternalReference.local_entity_id.in_(ids),
            )
        )
    ).scalars().all()
    return {row.local_entity_id: row.external_id for row in rows}


async def build_technician_stock_snapshot(
    db: AsyncSession,
    *,
    technician_id: int,
    captured_at: datetime | None = None,
) -> dict[str, Any]:
    if technician_id <= 0:
        raise PraxedoSourceError("technician_id_invalid")
    rows = await technician_stock_payload(db, technician_id=technician_id)
    external_ids = await _item_external_ids(db, (row["item_id"] for row in rows))
    technician_ref = await find_external_reference(
        db,
        system="praxedo",
        entity_type="technician",
        local_entity_id=technician_id,
    )
    now = captured_at or datetime.now(timezone.utc)
    return technician_stock_snapshot(
        technician_id=technician_id,
        technician_external_id=technician_ref.external_id if technician_ref else None,
        captured_at=_aware_utc(now, field="captured_at"),
        items=stock_rows_to_canonical_items(rows, external_ids=external_ids),
    )


async def _technician_for_job(db: AsyncSession, job: Job) -> int | None:
    if job.started_by:
        return int(job.started_by)
    assignment = await db.scalar(
        select(Assignment)
        .where(Assignment.job_id == job.id)
        .order_by(Assignment.assigned_at.desc(), Assignment.id.desc())
        .limit(1)
    )
    return int(assignment.technician_id) if assignment is not None else None


async def build_intervention_snapshot(
    db: AsyncSession,
    *,
    job_id: int,
) -> dict[str, Any]:
    job = await db.get(Job, job_id)
    if job is None:
        raise PraxedoSourceError("job_not_found")

    technician_id = await _technician_for_job(db, job)
    job_ref = await find_external_reference(
        db,
        system="praxedo",
        entity_type="intervention",
        local_entity_id=job.id,
    )
    technician_ref = None
    if technician_id is not None:
        technician_ref = await find_external_reference(
            db,
            system="praxedo",
            entity_type="technician",
            local_entity_id=technician_id,
        )

    status = job.status.value if hasattr(job.status, "value") else str(job.status)
    return intervention_snapshot(
        job_id=job.id,
        job_number=job.job_number,
        status=status,
        updated_at=_aware_utc(job.updated_at, field="job_updated_at"),
        technician_id=technician_id,
        technician_external_id=technician_ref.external_id if technician_ref else None,
        cable_length_m=job.cable_length_m,
        external_id=job_ref.external_id if job_ref else None,
    )


async def build_work_report(
    db: AsyncSession,
    *,
    job_id: int,
) -> dict[str, Any]:
    """Build the cumulative validated material report for one completed job."""

    job = await db.get(Job, job_id)
    if job is None:
        raise PraxedoSourceError("job_not_found")
    completed_at = _aware_utc(job.completed_at, field="job_completed_at")
    technician_id = await _technician_for_job(db, job)
    if technician_id is None:
        raise PraxedoSourceError("job_technician_missing")

    rows = (
        await db.execute(
            select(StockConsumptionItem, StockItem)
            .join(StockConsumption, StockConsumptionItem.consumption_id == StockConsumption.id)
            .join(StockItem, StockConsumptionItem.item_id == StockItem.id)
            .where(
                StockConsumption.job_id == job.id,
                StockConsumption.status == StockConsumptionStatus.VALIDE,
            )
            .order_by(StockItem.id.asc(), StockConsumptionItem.id.asc())
        )
    ).all()

    quantities: dict[int, int] = defaultdict(int)
    catalogue: dict[int, StockItem] = {}
    for consumption_item, item in rows:
        quantities[item.id] += max(int(consumption_item.quantity or 0), 0)
        catalogue[item.id] = item

    external_ids = await _item_external_ids(db, quantities.keys())
    consumed_items = [
        {
            "local_item_id": item_id,
            "external_id": external_ids.get(item_id),
            "sku": catalogue[item_id].reference,
            "quantity": quantity,
            "unit": catalogue[item_id].unit,
        }
        for item_id, quantity in sorted(quantities.items())
        if quantity > 0
    ]

    job_ref = await find_external_reference(
        db,
        system="praxedo",
        entity_type="intervention",
        local_entity_id=job.id,
    )
    return work_report(
        job_id=job.id,
        technician_id=technician_id,
        completed_at=completed_at,
        consumed_items=consumed_items,
        cable_length_m=job.cable_length_m,
        intervention_external_id=job_ref.external_id if job_ref else None,
    )
