"""Public V2 stock allocation endpoints.

The historical issue validation route reserves source stock but does not model
technician custody. The public V2 workflow is explicit: validating a technician
allocation transfers physical stock from the selected depot to a deterministic
technician warehouse and writes both sides of the movement to the audit journal.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_orienteur_or_above
from backend.database.connection import get_db
from backend.database.models import (
    Stock,
    StockIssue,
    StockIssueItem,
    StockIssueStatus,
    StockMovement,
    StockMovementType,
    Technician,
    User,
    Warehouse,
)
from backend.api.routes import stock_ftth


def _allocation_payload(issue: StockIssue, destination: Warehouse) -> dict:
    return {
        "id": issue.id,
        "issue_number": issue.issue_number,
        "status": issue.status.value if issue.status else None,
        "warehouse_id": issue.warehouse_id,
        "technician_id": issue.technician_id,
        "technician_warehouse_id": destination.id,
        "technician_warehouse_name": destination.name,
        "validated_at": issue.validated_at,
    }


async def _technician_warehouse(
    db: AsyncSession,
    technician: Technician,
) -> Warehouse:
    code = f"TECH-{technician.id}"
    warehouse = await db.scalar(
        select(Warehouse).where(Warehouse.code == code)
    )
    if warehouse is not None:
        if not warehouse.is_active:
            warehouse.is_active = True
        return warehouse

    warehouse = Warehouse(
        name=f"Technicien {technician.id} · {technician.name}",
        code=code,
        type="TECHNICIEN",
        city=None,
        address=None,
        is_active=True,
        description=(
            "Dotation terrain BlueVector. Dépôt de garde créé automatiquement "
            f"pour le technicien #{technician.id}."
        ),
    )
    db.add(warehouse)
    await db.flush()
    return warehouse


async def _destination_line(
    db: AsyncSession,
    *,
    item_id: int,
    warehouse_id: int,
) -> Stock:
    result = await db.execute(
        select(Stock)
        .where(
            Stock.item_id == item_id,
            Stock.warehouse_id == warehouse_id,
            Stock.batch_number.is_(None),
        )
        .with_for_update()
    )
    lines = result.scalars().all()
    if len(lines) > 1:
        raise ValueError(
            "Plusieurs lignes de dotation existent pour cet article et ce technicien."
        )
    if lines:
        return lines[0]

    line = Stock(
        item_id=item_id,
        warehouse_id=warehouse_id,
        quantity=0,
        reserved_quantity=0,
        available_quantity=0,
        batch_number=None,
    )
    db.add(line)
    await db.flush()
    return line


async def _transfer_issue_item(
    db: AsyncSession,
    *,
    issue: StockIssue,
    item: StockIssueItem,
    destination: Warehouse,
    current_user: User,
) -> None:
    source_result = await db.execute(
        select(Stock)
        .where(
            Stock.item_id == item.item_id,
            Stock.warehouse_id == issue.warehouse_id,
            Stock.available_quantity > 0,
        )
        .order_by(
            Stock.expiration_date.asc().nullslast(),
            Stock.id.asc(),
        )
        .with_for_update()
    )
    source_lines = source_result.scalars().all()
    available = sum(max(int(line.available_quantity or 0), 0) for line in source_lines)
    if available < item.quantity:
        raise ValueError(
            f"Stock disponible insuffisant pour l’article {item.item_id} "
            f"({available} disponible, {item.quantity} demandé)."
        )

    destination_line = await _destination_line(
        db,
        item_id=item.item_id,
        warehouse_id=destination.id,
    )
    destination_before = int(destination_line.quantity or 0)
    remaining = int(item.quantity)

    for source in source_lines:
        if remaining <= 0:
            break
        line_available = max(int(source.available_quantity or 0), 0)
        if line_available <= 0:
            continue
        moved = min(line_available, remaining)
        source_before = int(source.quantity or 0)
        source.quantity = source_before - moved
        source.available_quantity = int(source.available_quantity or 0) - moved

        db.add(
            StockMovement(
                item_id=item.item_id,
                warehouse_id=issue.warehouse_id,
                movement_type=StockMovementType.TRANSFERT,
                quantity=-moved,
                quantity_before=source_before,
                quantity_after=source.quantity,
                reference_type="issue",
                reference_id=issue.id,
                operator=issue.operator,
                job_id=issue.job_id,
                technician_id=issue.technician_id,
                notes=issue.notes,
                created_by=current_user.id,
            )
        )
        remaining -= moved

    destination_line.quantity = destination_before + item.quantity
    destination_line.available_quantity = (
        int(destination_line.available_quantity or 0) + item.quantity
    )
    db.add(
        StockMovement(
            item_id=item.item_id,
            warehouse_id=destination.id,
            movement_type=StockMovementType.TRANSFERT,
            quantity=item.quantity,
            quantity_before=destination_before,
            quantity_after=destination_line.quantity,
            reference_type="issue",
            reference_id=issue.id,
            operator=issue.operator,
            job_id=issue.job_id,
            technician_id=issue.technician_id,
            notes=issue.notes,
            created_by=current_user.id,
        )
    )
    item.quantity_delivered = item.quantity


@stock_ftth.router.post("/issues/{issue_id}/validate-v2")
async def validate_issue_to_technician_custody(
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
):
    """Validate a technician issue as a real depot -> technician transfer."""
    try:
        issue = await db.scalar(
            select(StockIssue)
            .where(StockIssue.id == issue_id)
            .with_for_update()
        )
        if issue is None:
            raise HTTPException(status_code=404, detail="Bon de dotation introuvable.")
        if issue.technician_id is None:
            raise HTTPException(
                status_code=422,
                detail="Un technicien destinataire est obligatoire pour cette dotation.",
            )
        technician = await db.get(Technician, issue.technician_id)
        if technician is None or not technician.is_active:
            raise HTTPException(status_code=422, detail="Technicien destinataire indisponible.")

        destination = await _technician_warehouse(db, technician)
        if issue.warehouse_id == destination.id:
            raise HTTPException(
                status_code=409,
                detail="Le dépôt source est déjà le stock de garde de ce technicien.",
            )

        if issue.status == StockIssueStatus.VALIDE:
            await db.commit()
            return _allocation_payload(issue, destination)
        if issue.status != StockIssueStatus.BROUILLON:
            raise HTTPException(
                status_code=409,
                detail="Seul un bon de dotation en brouillon peut être validé.",
            )

        items = (
            await db.execute(
                select(StockIssueItem)
                .where(StockIssueItem.issue_id == issue.id)
                .order_by(StockIssueItem.id.asc())
            )
        ).scalars().all()
        if not items:
            raise HTTPException(status_code=422, detail="Le bon de dotation est vide.")

        for item in items:
            await _transfer_issue_item(
                db,
                issue=issue,
                item=item,
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
            detail="La dotation n’a pas pu être validée. Aucun mouvement n’a été appliqué.",
        ) from exc
