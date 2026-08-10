from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.tech_sync import (
    TechnicianSyncBatchRequest,
    TechnicianSyncBatchResponse,
)
from backend.auth.dependencies import require_technician
from backend.database.connection import get_db
from backend.database.models import User
from backend.logic.technician_sync import process_technician_sync_event


router = APIRouter(tags=["Technician Sync (Mobile)"])


@router.post("/sync", response_model=TechnicianSyncBatchResponse)
async def sync_technician_events(
    batch: TechnicianSyncBatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> TechnicianSyncBatchResponse:
    results = []
    for event in batch.events:
        results.append(
            await process_technician_sync_event(
                db,
                event=event,
                current_user=current_user,
            )
        )

    await db.commit()
    return TechnicianSyncBatchResponse(results=results)
