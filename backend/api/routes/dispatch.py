"""
Dispatch API Routes for FieldOpt
Oracle WFX-style dispatch endpoints
"""
import logging
from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.logic.dispatch.scoring_engine import DispatchScoringEngine
from backend.database.models import Technician, Job
from backend.auth.dependencies import require_orienteur


logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Dispatch"],
    dependencies=[Depends(require_orienteur)],
)


@router.post("/dispatch/best-tech")
async def get_best_technician(
    job_id: int = Query(..., description="Job ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get the best technician for a job using scoring engine."""
    # Get job
    job = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = job.scalar_one_or_none()
    if not job:
        return {"error": "Job not found"}

    # Get all technicians
    techs = await db.execute(
        select(Technician).where(Technician.is_active == True)
    )
    technicians = techs.scalars().all()

    # Get workloads (simplified)
    workloads = {}
    for tech in technicians:
        workloads[tech.id] = {
            'pending_jobs': 0,
            'in_progress_jobs': 0
        }

    # Get distances (simplified)
    distances = {}

    # Score
    engine = DispatchScoringEngine()
    scores = engine.rank_technicians(
        job,
        technicians,
        workloads,
        distances
    )

    # Return top 3
    top_scores = scores[:3]
    return {
        "job_id": job_id,
        "best_technician": top_scores[0] if top_scores else None,
        "top_3": [
            {
                "technician_id": score.tech_id,
                "total_score": score.total_score,
                "breakdown": score.breakdown,
                "reasons": score.reasons
            }
            for score in top_scores
        ]
    }


@router.get("/dispatch/rank")
async def rank_technicians(
    job_id: int = Query(..., description="Job ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get ranked list of technicians for a job."""
    # Get job
    job = await db.execute(
        select(Job).where(Job.id == job_id)
    )
    job = job.scalar_one_or_none()
    if not job:
        return {"error": "Job not found"}

    # Get all technicians
    techs = await db.execute(
        select(Technician).where(Technician.is_active == True)
    )
    technicians = techs.scalars().all()

    # Get workloads
    workloads = {}
    for tech in technicians:
        workloads[tech.id] = {
            'pending_jobs': 0,
            'in_progress_jobs': 0
        }

    # Get distances
    distances = {}

    # Score
    engine = DispatchScoringEngine()
    scores = engine.rank_technicians(
        job,
        technicians,
        workloads,
        distances
    )

    return {
        "job_id": job_id,
        "ranked_technicians": [
            {
                "technician_id": score.tech_id,
                "total_score": score.total_score,
                "breakdown": score.breakdown,
                "reasons": score.reasons
            }
            for score in scores
        ]
    }
