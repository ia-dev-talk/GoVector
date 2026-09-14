"""Magillan daily-report endpoint attached to the existing Export Center router."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_chef_orienteur
from backend.database.connection import get_db
from backend.database.models import User
from backend.services.magillan_daily_report import export_magillan_daily_report
from . import export_center


class MagillanDailyReportRequest(BaseModel):
    """Selected Reports-page scope used to render complete intervention reports."""

    filters: Optional[dict] = Field(default=None)


@export_center.router.post("/export/magillan-daily")
async def generate_magillan_daily_report(
    request: MagillanDailyReportRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    """Generate complete intervention pages followed by labelled photo pages."""

    try:
        file_bytes = await export_magillan_daily_report(db, request.filters or {})
        if not file_bytes.startswith(b"%PDF-"):
            raise RuntimeError("Le moteur Magillan n'a pas produit un PDF valide")

        filename = f"RAPPORT_JOURNALIER_MAGILLAN_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        return Response(
            content=file_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(file_bytes)),
            },
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Impossible de générer les rapports d’intervention Magillan.",
        ) from exc
