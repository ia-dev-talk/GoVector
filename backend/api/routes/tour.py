"""
Tour Management API Routes for FieldOpt
Endpoints for route optimization, reordering, merging, and ETA calculation
"""
import logging
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.logic.tour.optimizer import TourOptimizer, TourStop
from backend.database.models import Job, Technician
from backend.auth.dependencies import require_orienteur
from backend.logic.job_planning import job_estimated_duration_minutes


logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Tour Management"],
    dependencies=[Depends(require_orienteur)],
)


@router.post("/tour/optimize")
async def optimize_tour(
    technician_id: int = Query(..., description="Technician ID"),
    db: AsyncSession = Depends(get_db),
):
    """Optimize the tour for a technician's assigned jobs."""
    # Get technician's assigned jobs
    jobs = await db.execute(
        select(Job).where(Job.assigned_technician_id == technician_id)
    )
    jobs = jobs.scalars().all()

    if not jobs:
        return {"message": "No assigned jobs for this technician"}

    # Convert to TourStop objects
    stops = []
    for job in jobs:
        if job.latitude and job.longitude:
            stops.append(TourStop(
                job_id=job.id,
                lat=job.latitude,
                lng=job.longitude,
                estimated_duration=job_estimated_duration_minutes(job),
                priority=job.priority or "normal",
                operator=job.operator or "",
                address=job.service_address or "",
            ))

    # Optimize tour
    optimizer = TourOptimizer()
    metrics = optimizer.optimize_tour(stops)

    return {
        "technician_id": technician_id,
        "optimized_tour": [
            {
                "job_id": stop.job_id,
                "sequence": stop.sequence,
                "lat": stop.lat,
                "lng": stop.lng,
                "address": stop.address,
                "estimated_duration": stop.estimated_duration,
                "priority": stop.priority,
            }
            for stop in metrics.stops
        ],
        "metrics": {
            "total_distance_km": metrics.total_distance_km,
            "total_duration_minutes": metrics.total_duration_minutes,
            "estimated_fuel_liters": metrics.estimated_fuel_liters,
            "estimated_arrival": metrics.estimated_arrival.isoformat() if metrics.estimated_arrival else None,
        }
    }


@router.post("/tour/reorder")
async def reorder_tour(
    technician_id: int = Query(..., description="Technician ID"),
    job_ids: List[int] = Query(..., description="Ordered list of job IDs"),
    db: AsyncSession = Depends(get_db),
):
    """Reorder a technician's tour based on provided job sequence."""
    # Get technician's assigned jobs
    jobs = await db.execute(
        select(Job).where(Job.assigned_technician_id == technician_id)
    )
    jobs = jobs.scalars().all()

    if not jobs:
        return {"error": "No assigned jobs for this technician"}

    # Create a mapping of job_id to job for quick lookup
    job_map = {job.id: job for job in jobs}

    # Validate that all job_ids belong to this technician
    for job_id in job_ids:
        if job_id not in job_map:
            return {"error": f"Job {job_id} not assigned to this technician"}

    # Reorder jobs according to the provided sequence
    ordered_jobs = [job_map[job_id] for job_id in job_ids]

    # Convert to TourStop objects
    stops = []
    for job in ordered_jobs:
        if job.latitude and job.longitude:
            stops.append(TourStop(
                job_id=job.id,
                lat=job.latitude,
                lng=job.longitude,
                estimated_duration=job_estimated_duration_minutes(job),
                priority=job.priority or "normal",
                operator=job.operator or "",
                address=job.service_address or "",
            ))

    # Optimize the reordered tour (though we trust the order, we can still optimize for distance)
    optimizer = TourOptimizer()
    metrics = optimizer.optimize_tour(stops)

    return {
        "technician_id": technician_id,
        "reordered_tour": [
            {
                "job_id": stop.job_id,
                "sequence": stop.sequence,
                "lat": stop.lat,
                "lng": stop.lng,
                "address": stop.address,
                "estimated_duration": stop.estimated_duration,
                "priority": stop.priority,
            }
            for stop in metrics.stops
        ],
        "metrics": {
            "total_distance_km": metrics.total_distance_km,
            "total_duration_minutes": metrics.total_duration_minutes,
            "estimated_fuel_liters": metrics.estimated_fuel_liters,
            "estimated_arrival": metrics.estimated_arrival.isoformat() if metrics.estimated_arrival else None,
        }
    }


@router.post("/tour/merge")
async def merge_tours(
    technician_a_id: int = Query(..., description="First technician ID"),
    technician_b_id: int = Query(..., description="Second technician ID"),
    db: AsyncSession = Depends(get_db),
):
    """Merge two technicians' tours into one."""
    # Get jobs for both technicians
    jobs_a = await db.execute(
        select(Job).where(Job.assigned_technician_id == technician_a_id)
    )
    jobs_a = jobs_a.scalars().all()

    jobs_b = await db.execute(
        select(Job).where(Job.assigned_technician_id == technician_b_id)
    )
    jobs_b = jobs_b.scalars().all()

    if not jobs_a and not jobs_b:
        return {"message": "No jobs assigned to either technician"}

    # Convert to TourStop objects
    stops_a = []
    for job in jobs_a:
        if job.latitude and job.longitude:
            stops_a.append(TourStop(
                job_id=job.id,
                lat=job.latitude,
                lng=job.longitude,
                estimated_duration=job_estimated_duration_minutes(job),
                priority=job.priority or "normal",
                operator=job.operator or "",
                address=job.service_address or "",
            ))

    stops_b = []
    for job in jobs_b:
        if job.latitude and job.longitude:
            stops_b.append(TourStop(
                job_id=job.id,
                lat=job.latitude,
                lng=job.longitude,
                estimated_duration=job_estimated_duration_minutes(job),
                priority=job.priority or "normal",
                operator=job.operator or "",
                address=job.service_address or "",
            ))

    # Merge tours
    optimizer = TourOptimizer()
    merged_stops, remaining_stops, action = optimizer.merge_tours(
        stops_a, stops_b, technician_a_id, technician_b_id
    )

    # Optimize the merged tour
    metrics = optimizer.optimize_tour(merged_stops)

    return {
        "action": action,
        "merged_tour": [
            {
                "job_id": stop.job_id,
                "sequence": stop.sequence,
                "lat": stop.lat,
                "lng": stop.lng,
                "address": stop.address,
                "estimated_duration": stop.estimated_duration,
                "priority": stop.priority,
            }
            for stop in metrics.stops
        ],
        "remaining_tour": [
            {
                "job_id": stop.job_id,
                "lat": stop.lat,
                "lng": stop.lng,
                "address": stop.address,
                "estimated_duration": stop.estimated_duration,
                "priority": stop.priority,
            }
            for stop in remaining_stops
        ],
        "metrics": {
            "total_distance_km": metrics.total_distance_km,
            "total_duration_minutes": metrics.total_duration_minutes,
            "estimated_fuel_liters": metrics.estimated_fuel_liters,
            "estimated_arrival": metrics.estimated_arrival.isoformat() if metrics.estimated_arrival else None,
        }
    }


@router.get("/tour/eta")
async def calculate_eta(
    technician_id: int = Query(..., description="Technician ID"),
    start_time: Optional[str] = Query(None, description="Start time in ISO format"),
    db: AsyncSession = Depends(get_db),
):
    """Calculate ETA for each job in a technician's tour."""
    # Parse start time
    if start_time:
        try:
            start_dt = datetime.fromisoformat(start_time)
        except ValueError:
            return {"error": "Invalid start time format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}
    else:
        start_dt = None

    # Get technician's assigned jobs
    jobs = await db.execute(
        select(Job).where(Job.assigned_technician_id == technician_id)
    )
    jobs = jobs.scalars().all()

    if not jobs:
        return {"message": "No assigned jobs for this technician"}

    # Convert to TourStop objects
    stops = []
    for job in jobs:
        if job.latitude and job.longitude:
            stops.append(TourStop(
                job_id=job.id,
                lat=job.latitude,
                lng=job.longitude,
                estimated_duration=job_estimated_duration_minutes(job),
                priority=job.priority or "normal",
                operator=job.operator or "",
                address=job.service_address or "",
            ))

    # Calculate ETA
    optimizer = TourOptimizer()
    etas = optimizer.calculate_eta(stops, start_dt)

    return {
        "technician_id": technician_id,
        "eta": {str(job_id): eta.isoformat() for job_id, eta in etas.items()},
        "stops": [
            {
                "job_id": stop.job_id,
                "address": stop.address,
                "estimated_duration": stop.estimated_duration,
            }
            for stop in stops
        ]
    }
