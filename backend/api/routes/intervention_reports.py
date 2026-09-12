"""Authenticated single-intervention PDF download."""

from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user
from backend.config import get_settings
from backend.database.connection import get_db
from backend.database.models import Assignment, CableDrumConsumption, ClientOrganization, Job, JobVisit, Technician, TechnicianFieldAction, TechnicianMedia, User
from backend.logic.job_access import require_job_read_access
from backend.services.intervention_report import build_intervention_report_pdf

router = APIRouter(tags=["Intervention reports"])


@router.get("/interventions/{job_id}.pdf")
async def download_intervention_report(job_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    job = await db.scalar(select(Job).where(Job.id == job_id, Job.deleted_at.is_(None)))
    if job is None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    await require_job_read_access(db, job=job, current_user=current_user)
    actions = (await db.execute(select(TechnicianFieldAction).where(TechnicianFieldAction.job_id == job_id).order_by(TechnicianFieldAction.occurred_at))).scalars().all()
    media = (await db.execute(select(TechnicianMedia).where(TechnicianMedia.job_id == job_id).order_by(TechnicianMedia.created_at))).scalars().all()
    visits = (await db.execute(select(JobVisit).where(JobVisit.job_id == job_id).order_by(JobVisit.attempt_number))).scalars().all()
    consumptions = (await db.execute(select(CableDrumConsumption).where(CableDrumConsumption.job_id == job_id).order_by(CableDrumConsumption.occurred_at))).scalars().all()
    technician_id = await db.scalar(select(Assignment.technician_id).where(Assignment.job_id == job_id, Assignment.ended_at.is_(None)))
    if technician_id is None and visits:
        technician_id = visits[-1].primary_technician_id
    technician_name = await db.scalar(select(Technician.name).where(Technician.id == technician_id)) if technician_id else None
    client_name = await db.scalar(select(ClientOrganization.name).where(ClientOrganization.id == job.client_organization_id)) if job.client_organization_id else None
    try:
        pdf = build_intervention_report_pdf(job=job, actions=actions, media=media, visits=visits, cable_consumptions=consumptions, technician_name=technician_name, client_organization_name=client_name, media_root=Path(get_settings().TECHNICIAN_MEDIA_ROOT))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    safe = ''.join(c for c in str(job.job_number or job.id) if c.isalnum() or c in '-_') or str(job.id)
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="rapport-intervention-{safe}.pdf"'})
