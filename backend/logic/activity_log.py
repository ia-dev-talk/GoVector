"""
Service de journalisation d'activité pour les interventions.
Chaque action importante est historisée dans job_activity_logs.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import JobActivityLog

logger = logging.getLogger("uvicorn.error")


async def log_job_activity(
    db: AsyncSession,
    job_id: int,
    action: str,
    technician_id: Optional[int] = None,
    description: Optional[str] = None,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    metadata: Optional[dict] = None,
) -> JobActivityLog:
    """Enregistre une action dans le journal d'activité."""
    log_entry = JobActivityLog(
        job_id=job_id,
        technician_id=technician_id,
        action=action,
        description=description,
        old_status=old_status,
        new_status=new_status,
        latitude=latitude,
        longitude=longitude,
        meta_data=metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(log_entry)
    await db.flush()
    logger.info(
        f"[ACTIVITY_LOG] Job #{job_id} | {action} | "
        f"tech={technician_id} | {old_status}→{new_status}"
    )
    return log_entry
