"""Resilient public-V2 stock and assignment context for intervention details."""

from typing import Any

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import stock_ftth
from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models import FieldTeam, Job, Orienteur, Technician, User
from backend.logic.assignments import get_assignments_for_job
from backend.logic.job_access import require_job_read_access
from backend.logic.technician_stock import technician_stock_payload


@stock_ftth.router.get("/job-context/{job_id}")
async def get_job_stock_context_v2(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return current assignment organization + custody without broad personnel joins."""
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    await require_job_read_access(db, job=job, current_user=current_user)

    assignment = await get_assignments_for_job(db, job_id)
    if assignment is None or assignment.technician_id is None:
        return {
            "technician_id": None,
            "technician_name": None,
            "team_id": None,
            "team_name": None,
            "orienteur_id": None,
            "orienteur_name": None,
            "warehouse_id": None,
            "warehouse_name": None,
            "vehicle_stock": [],
            "stock_summary": {
                "line_count": 0,
                "total_units": 0,
                "available_units": 0,
            },
        }

    technician = await db.get(Technician, assignment.technician_id)
    if technician is None:
        raise HTTPException(
            status_code=409,
            detail="L'affectation pointe vers un technicien indisponible. Corrigez l'affectation.",
        )

    team = await db.get(FieldTeam, technician.team_id) if technician.team_id else None
    if team is None and technician.orienteur_id:
        team = await db.scalar(
            select(FieldTeam).where(
                FieldTeam.orienteur_id == technician.orienteur_id,
                FieldTeam.is_active.is_(True),
            )
        )
    orienteur_id = technician.orienteur_id or (team.orienteur_id if team else None)
    orienteur = await db.get(Orienteur, orienteur_id) if orienteur_id else None

    rows = await technician_stock_payload(
        db,
        technician_id=technician.id,
    )
    total_units = sum(int(row.get("quantity") or 0) for row in rows)
    available_units = sum(int(row.get("available_quantity") or 0) for row in rows)
    warehouse_id = rows[0].get("warehouse_id") if rows else None
    warehouse_name = rows[0].get("warehouse_name") if rows else None
    return {
        "technician_id": technician.id,
        "technician_name": technician.name,
        "team_id": team.id if team else technician.team_id,
        "team_name": team.name if team else None,
        "orienteur_id": orienteur.id if orienteur else orienteur_id,
        "orienteur_name": orienteur.name if orienteur else None,
        "warehouse_id": warehouse_id,
        "warehouse_name": warehouse_name,
        "vehicle_stock": rows,
        "stock_summary": {
            "line_count": len(rows),
            "total_units": total_units,
            "available_units": available_units,
        },
    }
