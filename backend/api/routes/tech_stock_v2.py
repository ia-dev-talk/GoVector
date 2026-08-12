"""Public V2 technician stock + equipment scan endpoints.

These routes extend the existing `/tech/jobs` router so the mobile application
uses the same authenticated technician context as the intervention workflow.
"""

from typing import Any

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import tech_jobs
from backend.auth.dependencies import require_technician
from backend.database.connection import get_db
from backend.database.models import User
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.technician_stock import (
    resolve_equipment_scan,
    technician_stock_payload,
)


class EquipmentScanRequest(BaseModel):
    job_id: int = Field(gt=0)
    code: str = Field(min_length=1, max_length=512)


def _mutation_http_exception(exc: TechnicianJobMutationError) -> HTTPException:
    code = status.HTTP_409_CONFLICT if exc.status == "conflict" else status.HTTP_422_UNPROCESSABLE_ENTITY
    return HTTPException(
        status_code=code,
        detail={"code": exc.code, "message": exc.message},
    )


@tech_jobs.router.get("/stock-v2")
async def get_technician_custody_v2(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> list[dict[str, Any]]:
    """Return aggregated AVAILABLE custody for the authenticated technician."""
    if current_user.technician_id is None:
        raise HTTPException(status_code=400, detail="Profil technicien manquant")
    return await technician_stock_payload(
        db,
        technician_id=current_user.technician_id,
    )


@tech_jobs.router.post("/scan/resolve")
async def resolve_technician_equipment_scan(
    payload: EquipmentScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
) -> dict[str, Any]:
    """Resolve a raw QR/barcode against inventory, catalogue and technician custody."""
    try:
        return await resolve_equipment_scan(
            db,
            raw_code=payload.code,
            job_id=payload.job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _mutation_http_exception(exc) from exc
