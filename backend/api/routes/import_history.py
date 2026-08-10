"""
Import History API routes — query import history and statistics.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth.dependencies import require_orienteur
from backend.database.connection import AsyncSessionLocal
from backend.services.excel.import_history_service import ImportHistoryService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_orienteur)])


@router.get("/history")
async def get_import_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    operator: Optional[str] = Query(default=None),
):
    """Get import history records."""
    async with AsyncSessionLocal() as session:
        records = await ImportHistoryService.get_history(
            db=session,
            limit=limit,
            offset=offset,
            operator=operator,
        )
        return {
            "success": True,
            "records": [ImportHistoryService.record_to_dict(r) for r in records],
            "count": len(records),
        }


@router.get("/history/stats")
async def get_import_stats():
    """Get aggregate import statistics."""
    async with AsyncSessionLocal() as session:
        stats = await ImportHistoryService.get_history_stats(db=session)
        return {
            "success": True,
            "stats": stats,
        }


@router.get("/history/{record_id}")
async def get_import_record(record_id: int):
    """Get a single import history record by ID."""
    from sqlalchemy import select
    from backend.database.models import ImportHistory

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(ImportHistory).where(ImportHistory.id == record_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            raise HTTPException(
                status_code=404,
                detail="Enregistrement d'import introuvable.",
            )
        return {
            "success": True,
            "record": ImportHistoryService.record_to_dict(record),
        }
