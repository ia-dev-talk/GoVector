"""Authenticated audit views backed only by persisted business activity."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_chef_orienteur
from backend.database.connection import get_db
from backend.database.models import JobActivityLog, User


router = APIRouter(tags=["Audit & Security"])


@router.get("/audit/log")
async def get_audit_log(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    rows = (
        await db.execute(
            select(JobActivityLog)
            .order_by(JobActivityLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return {
        "available": bool(rows),
        "items": [
            {
                "id": row.id,
                "event": row.action,
                "job_id": row.job_id,
                "technician_id": row.technician_id,
                "old_status": row.old_status,
                "new_status": row.new_status,
                "description": row.description,
                "timestamp": row.created_at,
            }
            for row in rows
        ],
    }


@router.get("/audit/summary")
async def get_audit_summary(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    total = (
        await db.execute(select(func.count(JobActivityLog.id)))
    ).scalar_one()
    grouped = (
        await db.execute(
            select(JobActivityLog.action, func.count(JobActivityLog.id))
            .group_by(JobActivityLog.action)
            .order_by(func.count(JobActivityLog.id).desc())
            .limit(10)
        )
    ).all()
    return {
        "available": total > 0,
        "total": total,
        "issues": None,
        "top_events": [
            {"event": action, "count": count}
            for action, count in grouped
        ],
    }
