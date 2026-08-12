import logging

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
from backend.services.realtime.dashboard_service import DashboardService


router = APIRouter(tags=["Technician Sync (Mobile)"])
logger = logging.getLogger(__name__)


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

    # Realtime is a projection, never part of the durable field transaction.
    # Broadcast only acknowledged effects and do it after commit so every web
    # refresh sees the same committed stock/equipment/GPS state.
    acknowledged_by_job: dict[int, set[str]] = {}
    for event, result in zip(batch.events, results):
        if result.status != "acknowledged":
            continue
        acknowledged_by_job.setdefault(event.job_id, set()).add(event.type)

    if acknowledged_by_job:
        service = DashboardService()
        try:
            for job_id, action_types in acknowledged_by_job.items():
                payload = {
                    "job_id": job_id,
                    "technician_id": current_user.technician_id,
                    "source": "technician_sync",
                    "field_actions": sorted(action_types),
                }
                await service.broadcast_job_event("job:updated", payload)
                if "material_used" in action_types:
                    await service.broadcast_job_event(
                        "stock:updated",
                        {
                            **payload,
                            "reason": "technician_consumption",
                        },
                    )
                if "equipment_scan" in action_types:
                    await service.broadcast_job_event(
                        "equipment:updated",
                        {
                            **payload,
                            "reason": "technician_scan",
                        },
                    )
            await service.broadcast_dashboard_update()
        except Exception as exc:
            logger.warning("Technician sync realtime broadcast failed: %s", exc)

    return TechnicianSyncBatchResponse(results=results)
