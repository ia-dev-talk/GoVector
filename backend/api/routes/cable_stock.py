"""Web administration for physical cable drums (CODE = bobine = ouvrage)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_orienteur_or_above
from backend.database.connection import get_db
from backend.database.models import (
    CableDrum,
    CableDrumAssignment,
    CableDrumConsumption,
    Job,
    Technician,
    User,
)
from backend.logic.cable_drums import CABLE_TYPES, assign_drum, normalize_cable_type, parse_mark


router = APIRouter(prefix="/cable-stock", tags=["Cable stock"])


class DrumCreate(BaseModel):
    code: str = Field(min_length=1, max_length=80)
    cable_type: str
    current_mark_m: float = Field(ge=0)
    technician_id: int | None = Field(default=None, gt=0)

    @field_validator("code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        return value.strip()


class DrumAssign(BaseModel):
    technician_id: int = Field(gt=0)
    reason: str | None = Field(default=None, max_length=500)


class DrumFinish(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _drum_payload(drum: CableDrum, total_consumed: float = 0) -> dict:
    technician = drum.__dict__.get("assigned_technician")
    return {
        "id": drum.id,
        "code": drum.code,
        "cable_type": drum.cable_type,
        "current_mark_m": drum.current_mark_m,
        "remainder_m": drum.current_mark_m,
        "status": drum.status,
        "assigned_technician_id": drum.assigned_technician_id,
        "assigned_technician_name": getattr(technician, "name", None),
        "total_consumed_m": float(total_consumed or 0),
        "created_at": drum.created_at,
        "updated_at": drum.updated_at,
    }


@router.get("/drums")
async def list_drums(
    status: str | None = Query(default=None),
    technician_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
) -> list[dict]:
    totals = (
        select(
            CableDrumConsumption.drum_id,
            func.coalesce(func.sum(CableDrumConsumption.quantity_m), 0).label("total"),
        )
        .group_by(CableDrumConsumption.drum_id)
        .subquery()
    )
    statement = (
        select(CableDrum, func.coalesce(totals.c.total, 0))
        .outerjoin(totals, totals.c.drum_id == CableDrum.id)
        .order_by(CableDrum.status.asc(), CableDrum.code.asc())
    )
    if status:
        statement = statement.where(CableDrum.status == status.strip().upper())
    if technician_id:
        statement = statement.where(CableDrum.assigned_technician_id == technician_id)
    rows = (await db.execute(statement)).all()
    return [_drum_payload(drum, total) for drum, total in rows]


@router.post("/drums", status_code=201)
async def create_drum(
    payload: DrumCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
) -> dict:
    cable_type = normalize_cable_type(payload.cable_type)
    current_mark = parse_mark(payload.current_mark_m, label="Le repère courant")
    drum = CableDrum(
        code=payload.code,
        cable_type=cable_type,
        current_mark_m=current_mark,
        status="EXHAUSTED" if current_mark == 0 else "ACTIVE",
        created_by_user_id=current_user.id,
    )
    db.add(drum)
    try:
        await db.flush()
        if payload.technician_id is not None:
            await assign_drum(
                db, drum=drum, technician_id=payload.technician_id,
                actor_user_id=current_user.id, reason="Affectation initiale",
            )
        await db.commit()
        await db.refresh(drum)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Ce CODE câble existe déjà") from exc
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _drum_payload(drum)


@router.put("/drums/{drum_id}/assignment")
async def update_assignment(
    drum_id: int,
    payload: DrumAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
) -> dict:
    drum = await db.scalar(select(CableDrum).where(CableDrum.id == drum_id).with_for_update())
    if drum is None:
        raise HTTPException(status_code=404, detail="Bobine introuvable")
    try:
        await assign_drum(
            db, drum=drum, technician_id=payload.technician_id,
            actor_user_id=current_user.id, reason=payload.reason,
        )
        await db.commit()
        await db.refresh(drum)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _drum_payload(drum)


@router.post("/drums/{drum_id}/finish")
async def finish_drum(
    drum_id: int,
    payload: DrumFinish,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur_or_above),
) -> dict:
    drum = await db.scalar(select(CableDrum).where(CableDrum.id == drum_id).with_for_update())
    if drum is None:
        raise HTTPException(status_code=404, detail="Bobine introuvable")
    if drum.status == "EXHAUSTED":
        return _drum_payload(drum)
    assignment = await db.scalar(
        select(CableDrumAssignment)
        .where(CableDrumAssignment.drum_id == drum.id, CableDrumAssignment.ended_at.is_(None))
        .with_for_update()
    )
    now = datetime.now(timezone.utc)
    if assignment is not None:
        assignment.ended_at = now
        assignment.end_reason = payload.reason
    drum.status = "EXHAUSTED"
    drum.assigned_technician_id = None
    await db.commit()
    await db.refresh(drum)
    return _drum_payload(drum)


@router.get("/history")
async def cable_history(
    code: str | None = Query(default=None),
    limit: int = Query(default=250, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur_or_above),
) -> list[dict]:
    statement = (
        select(CableDrumConsumption, Job.job_number, Technician.name)
        .join(Job, Job.id == CableDrumConsumption.job_id)
        .join(Technician, Technician.id == CableDrumConsumption.technician_id)
        .order_by(CableDrumConsumption.occurred_at.desc(), CableDrumConsumption.id.desc())
        .limit(limit)
    )
    if code:
        statement = statement.where(CableDrumConsumption.cable_code == code.strip())
    rows = (await db.execute(statement)).all()
    return [{
        "id": item.id,
        "event_id": item.event_id,
        "code": item.cable_code,
        "cable_type": item.cable_type,
        "job_id": item.job_id,
        "job_number": job_number,
        "visit_id": item.visit_id,
        "technician_id": item.technician_id,
        "technician_name": technician_name,
        "start_mark_m": item.start_mark_m,
        "end_mark_m": item.end_mark_m,
        "quantity_m": item.quantity_m,
        "installation_mode": item.installation_mode,
        "continuity_justification": item.continuity_justification,
        "occurred_at": item.occurred_at,
    } for item, job_number, technician_name in rows]
