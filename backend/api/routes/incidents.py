"""
Incident Management API Routes
Handles SAV, pannes, urgences, escalades, SLA
"""
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.database.connection import get_db
from backend.database.models import Incident, User
from backend.auth.dependencies import (
    require_internal_user,
    require_orienteur,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["Incidents"],
    dependencies=[Depends(require_internal_user)],
)


@router.get("/incidents")
async def get_incidents(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    incident_type: Optional[str] = Query(None),
    job_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get all incidents with optional filters"""
    query = select(Incident)

    if status:
        query = query.where(Incident.status == status)
    if severity:
        query = query.where(Incident.severity == severity)
    if incident_type:
        query = query.where(Incident.incident_type == incident_type)
    if job_id:
        query = query.where(Incident.job_id == job_id)

    query = query.order_by(Incident.created_at.desc())

    result = await db.execute(query)
    incidents = result.scalars().all()

    return [
        {
            "id": i.id,
            "job_id": i.job_id,
            "incident_type": i.incident_type,
            "severity": i.severity,
            "status": i.status,
            "description": i.description,
            "reported_by": i.reported_by,
            "assigned_to": i.assigned_to,
            "sla_deadline": i.sla_deadline,
            "resolution_time": i.resolution_time,
            "root_cause": i.root_cause,
            "corrective_action": i.corrective_action,
            "escalation_level": i.escalation_level,
            "is_escalated": i.is_escalated,
            "created_at": i.created_at,
            "updated_at": i.updated_at,
            "resolved_at": i.resolved_at,
        }
        for i in incidents
    ]


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific incident"""
    incident = await db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "id": incident.id,
        "job_id": incident.job_id,
        "incident_type": incident.incident_type,
        "severity": incident.severity,
        "status": incident.status,
        "description": incident.description,
        "reported_by": incident.reported_by,
        "assigned_to": incident.assigned_to,
        "sla_deadline": incident.sla_deadline,
        "resolution_time": incident.resolution_time,
        "root_cause": incident.root_cause,
        "corrective_action": incident.corrective_action,
        "escalation_level": incident.escalation_level,
        "is_escalated": incident.is_escalated,
        "created_at": incident.created_at,
        "updated_at": incident.updated_at,
        "resolved_at": incident.resolved_at,
    }


@router.post("/incidents")
async def create_incident(
    incident_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Create a new incident"""
    try:
        incident = Incident(
            job_id=incident_data.get("job_id"),
            incident_type=incident_data.get("incident_type", "SAV"),
            severity=incident_data.get("severity", "MEDIUM"),
            status=incident_data.get("status", "OPEN"),
            description=incident_data.get("description"),
            reported_by=current_user.username,
            assigned_to=incident_data.get("assigned_to"),
            sla_deadline=incident_data.get("sla_deadline"),
            escalation_level=incident_data.get("escalation_level", 0),
        )

        db.add(incident)
        await db.commit()
        await db.refresh(incident)

        return {
            "id": incident.id,
            "message": "Incident created successfully",
        }

    except Exception as e:
        logger.exception(f"Error creating incident: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create incident")


@router.put("/incidents/{incident_id}")
async def update_incident(
    incident_id: int,
    incident_data: dict,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur),
):
    """Update an incident"""
    incident = await db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    try:
        # Update fields
        for key, value in incident_data.items():
            if hasattr(incident, key) and key not in ["id", "created_at"]:
                setattr(incident, key, value)

        incident.updated_at = datetime.utcnow()

        # If status changed to RESOLVED, set resolved_at
        if incident_data.get("status") == "RESOLVED" and not incident.resolved_at:
            incident.resolved_at = datetime.utcnow()

        await db.commit()
        await db.refresh(incident)

        return {
            "id": incident.id,
            "message": "Incident updated successfully",
        }

    except Exception as e:
        logger.exception(f"Error updating incident: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update incident")


@router.delete("/incidents/{incident_id}")
async def delete_incident(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur),
):
    """Delete an incident"""
    incident = await db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    try:
        await db.delete(incident)
        await db.commit()

        return {
            "message": "Incident deleted successfully",
        }

    except Exception as e:
        logger.exception(f"Error deleting incident: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete incident")


@router.get("/incidents/stats/summary")
async def get_incidents_summary(db: AsyncSession = Depends(get_db)):
    """Get incident statistics summary"""
    # Total incidents
    total = await db.execute(select(func.count(Incident.id)))
    total_count = total.scalar()

    # By status
    open_incidents = await db.execute(
        select(func.count(Incident.id)).where(Incident.status == "OPEN")
    )
    open_count = open_incidents.scalar()

    resolved_incidents = await db.execute(
        select(func.count(Incident.id)).where(Incident.status == "RESOLVED")
    )
    resolved_count = resolved_incidents.scalar()

    escalated_incidents = await db.execute(
        select(func.count(Incident.id)).where(Incident.is_escalated == True)
    )
    escalated_count = escalated_incidents.scalar()

    # By type
    by_type = {}
    for incident_type in ["SAV", "INCIDENT", "URGENCE", "PANNEAU"]:
        count_result = await db.execute(
            select(func.count(Incident.id)).where(Incident.incident_type == incident_type)
        )
        by_type[incident_type] = count_result.scalar()

    return {
        "total": total_count,
        "open": open_count,
        "resolved": resolved_count,
        "escalated": escalated_count,
        "by_type": by_type,
    }


@router.post("/incidents/{incident_id}/escalate")
async def escalate_incident(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_orienteur),
):
    """Escalate an incident"""
    incident = await db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    try:
        incident.escalation_level += 1
        incident.is_escalated = True
        incident.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(incident)

        return {
            "id": incident.id,
            "escalation_level": incident.escalation_level,
            "message": f"Incident escalated to level {incident.escalation_level}",
        }

    except Exception as e:
        logger.exception(f"Error escalating incident: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to escalate incident")
