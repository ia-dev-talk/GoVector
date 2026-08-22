"""Atomic public-V2 technician stock allocation.

The UI must not create a persisted draft and then discover that transfer
validation failed. This endpoint creates the audit document and performs the
physical depot -> technician custody transfer in one database transaction.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import stock_ftth
from backend.api.routes.stock_v2_patch import (
    _allocation_payload,
    _technician_warehouse,
    _transfer_issue_item,
)
from backend.api.schemas.stock import StockIssueCreate
from backend.auth.dependencies import require_orienteur_or_above
from backend.database.connection import get_db
from backend.database.models import (
    StockIssue,
    StockIssueItem,
    StockIssueStatus,
    StockItem,
    Technician,
    User,
    Warehouse,
)
from backend.logic.stock_allocation_policy import enforce_technician_allocation_scope


def _issue_number() -> str:
    now = datetime.now(timezone.utc)
    return f"DOT-{now:%Y%m%d}-{uuid4().hex[:10].upper()}"


@stock_ftth.router.post("/technician-allocations")
async def create_technician_allocation(
    payload: StockIssueCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    """Create and validate a technician custody transfer atomically."""
    if payload.technician_id is None:
        raise HTTPException(
            status_code=422,
            detail="Un technicien destinataire est obligatoire pour cette dotation.",
        )

    try:
        source = await db.get(Warehouse, payload.warehouse_id)
        if source is None or not source.is_active:
            raise HTTPException(status_code=422, detail="Dépôt source indisponible.")

        technician = await db.get(Technician, payload.technician_id)
        if technician is None or not technician.is_active:
            raise HTTPException(status_code=422, detail="Technicien destinataire indisponible.")
        enforce_technician_allocation_scope(
            current_user=current_user,
            technician=technician,
        )

        destination = await _technician_warehouse(db, technician)
        if source.id == destination.id:
            raise HTTPException(
                status_code=409,
                detail="Le dépôt source est déjà le stock de garde de ce technicien.",
            )

        item_ids = [line.item_id for line in payload.items]
        existing_items = {
            item_id
            for item_id in item_ids
            if await db.get(StockItem, item_id) is not None
        }
        missing = [item_id for item_id in item_ids if item_id not in existing_items]
        if missing:
            raise HTTPException(
                status_code=422,
                detail="Article de stock introuvable : " + ", ".join(map(str, missing)),
            )

        issue = StockIssue(
            issue_number=_issue_number(),
            warehouse_id=source.id,
            technician_id=technician.id,
            job_id=payload.job_id,
            operator=payload.operator,
            status=StockIssueStatus.BROUILLON,
            issued_by=current_user.id,
            notes=payload.notes,
        )
        db.add(issue)
        await db.flush()

        issue_items = []
        for line in payload.items:
            issue_item = StockIssueItem(
                issue_id=issue.id,
                item_id=line.item_id,
                quantity=line.quantity,
                quantity_delivered=0,
            )
            db.add(issue_item)
            issue_items.append(issue_item)
        await db.flush()

        for issue_item in issue_items:
            await _transfer_issue_item(
                db,
                issue=issue,
                item=issue_item,
                destination=destination,
                current_user=current_user,
            )

        issue.status = StockIssueStatus.VALIDE
        issue.validated_by = current_user.id
        issue.validated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(issue)
        return _allocation_payload(issue, destination)
    except HTTPException:
        await db.rollback()
        raise
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail="La dotation n’a pas pu être enregistrée. Aucun mouvement n’a été appliqué.",
        ) from exc
