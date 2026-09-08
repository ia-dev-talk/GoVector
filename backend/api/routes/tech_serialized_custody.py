"""Authenticated technician serialized-equipment custody endpoint."""

from typing import Any

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import tech_jobs
from backend.auth.dependencies import require_technician
from backend.database.connection import get_db
from backend.database.models import User
from backend.logic.technician_serialized_custody import (
    technician_serialized_custody_payload,
)


@tech_jobs.router.get("/stock-v2/serialized")
async def get_technician_serialized_custody_v2(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> list[dict[str, Any]]:
    """Return serialized ONT/router/etc. verified in the authenticated custody."""
    if current_user.technician_id is None:
        raise HTTPException(status_code=400, detail="Profil technicien manquant")
    return await technician_serialized_custody_payload(
        db,
        technician_id=current_user.technician_id,
    )
