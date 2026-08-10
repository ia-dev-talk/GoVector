"""
Routes pour les actions métier sur les interventions :
- Réaffectation
- Report
- Duplication
- Annulation avec motif
- Archivage (soft delete)
- Timeline
- Photos
- Stock lié
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.api.schemas import (
    JobResponse,
    JobCreate,
    JobActivityLogResponse,
    MessageResponse,
)
from backend.database.connection import get_db
from backend.database.models import (
    Job, JobStatus, JobType, User, UserRole,
    Technician, Assignment, JobActivityLog,
    JobPostponement, EquipmentInventory,
)
from backend.logic import jobs as job_logic
from backend.logic import assignments as assignment_logic
from backend.logic.activity_log import log_job_activity
from backend.logic.job_access import require_job_operations_access, require_job_read_access
from backend.logic.workflow.engine import WorkflowEngine
from backend.auth.dependencies import get_current_user, require_orienteur, require_chef_orienteur
from backend.services.realtime.dashboard_service import DashboardService

router = APIRouter(tags=["Job Actions"])
logger = logging.getLogger("uvicorn.error")


@router.post("/{job_id}/reassign", response_model=JobResponse)
async def reassign_job(
    job_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Réaffecter une intervention à un autre technicien.
    Body: { "technician_name": "Mohamed", "reason": "Surcharge" }
    """
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)

    tech_name = payload.get("technician_name")
    reason = payload.get("reason", "Réaffectation")

    if not tech_name:
        raise HTTPException(status_code=400, detail="Nom du technicien obligatoire")

    # Vérifier que le technicien existe
    result = await db.execute(
        select(Technician).where(Technician.name == tech_name, Technician.is_active == True)
    )
    tech = result.scalar_one_or_none()
    if not tech:
        raise HTTPException(status_code=404, detail=f"Technicien '{tech_name}' introuvable")

    old_tech_name = job.assigned_technician_name

    # Mettre à jour l'affectation
    job.assigned_technician_name = tech_name
    job.updated_at = datetime.utcnow()

    # Mettre à jour ou créer l'Assignment
    existing = await assignment_logic.get_assignment_for_job(db, job_id)
    if existing:
        existing.technician_id = tech.id
        existing.updated_at = datetime.utcnow()
    else:
        assignment = Assignment(
            job_id=job_id,
            technician_id=tech.id,
            assigned_at=datetime.utcnow(),
        )
        db.add(assignment)

    # Logger l'activité
    await log_job_activity(
        db=db,
        job_id=job_id,
        action="reassigned",
        technician_id=tech.id,
        description=f"Réaffectation : {old_tech_name or 'N/A'} → {tech_name} — Motif : {reason}",
        old_status=job.status.value if job.status else None,
        new_status=job.status.value if job.status else None,
        metadata={"reason": reason, "old_tech": old_tech_name, "new_tech": tech_name},
    )

    await db.commit()
    await db.refresh(job)

    # WebSocket
    try:
        service = DashboardService(db)
        await service.broadcast_job_event("job_reassigned", {
            "job_id": job_id,
            "old_technician": old_tech_name,
            "new_technician": tech_name,
            "reason": reason,
        })
        await service.broadcast_dashboard_update()
    except Exception as e:
        logger.warning(f"WebSocket error (reassign): {e}")

    return JobResponse.from_orm_with_assignment(job)


@router.post("/{job_id}/postpone", response_model=JobResponse)
async def postpone_job(
    job_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Reporter une intervention.
    Body: { "new_date": "2026-07-25", "new_time_slot_start": "14:00", "new_time_slot_end": "16:00", "reason": "Client indisponible" }
    """
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)

    new_date = payload.get("new_date")
    reason = payload.get("reason", "Report")

    if not new_date:
        raise HTTPException(status_code=400, detail="Nouvelle date obligatoire")

    old_date = job.scheduled_date

    # Mettre à jour la date
    from datetime import date
    job.scheduled_date = datetime.strptime(new_date, "%Y-%m-%d") if isinstance(new_date, str) else new_date
    if payload.get("new_time_slot_start"):
        job.time_slot_start = payload["new_time_slot_start"]
    if payload.get("new_time_slot_end"):
        job.time_slot_end = payload["new_time_slot_end"]
    try:
        await WorkflowEngine(db).transition_job(
            job,
            JobStatus.POSTPONED,
            metadata={
                "extra": {
                    "source": "orienteur_postpone",
                    "old_date": str(old_date) if old_date else None,
                    "new_date": str(new_date),
                    "reason": reason,
                },
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # Enregistrer le report
    postponement = JobPostponement(
        job_id=job_id,
        reason=reason,
        comment=payload.get("comment"),
        requested_date=job.scheduled_date,
        status="VALIDATED",
    )
    db.add(postponement)

    await db.commit()
    await db.refresh(job)

    # WebSocket
    try:
        service = DashboardService(db)
        await service.broadcast_job_event("job_postponed", {
            "job_id": job_id,
            "old_date": str(old_date),
            "new_date": new_date,
            "reason": reason,
        })
        await service.broadcast_dashboard_update()
    except Exception as e:
        logger.warning(f"WebSocket error (postpone): {e}")

    return JobResponse.from_orm_with_assignment(job)


@router.post("/{job_id}/duplicate", response_model=JobResponse, status_code=201)
async def duplicate_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Dupliquer une intervention.
    Copie : client, adresse, réseau, type, opérateur, priorité
    Ne copie PAS : statut, historique, photos, timeline
    """
    original = await job_logic.get_job(db, job_id)
    if not original:
        raise HTTPException(status_code=404, detail="Intervention source introuvable")
    require_job_operations_access(job=original, current_user=current_user)

    # Créer une copie
    new_job = Job(
        job_type=original.job_type,
        status=JobStatus.PENDING,
        customer_name=original.customer_name,
        customer_phone=original.customer_phone,
        customer_email=original.customer_email,
        service_address=original.service_address,
        service_city=original.service_city,
        service_zip=original.service_zip,
        latitude=original.latitude,
        longitude=original.longitude,
        required_skills=original.required_skills,
        route_criteria=original.route_criteria,
        operator=original.operator,
        priority=original.priority,
        estimated_duration=original.estimated_duration,
        description=original.description,
        notes=f"[DUPLICATE de #{original.id}] {original.notes or ''}",
        special_instructions=original.special_instructions,
        # Réseau FTTH
        nro_raw=original.nro_raw,
        sro_raw=original.sro_raw,
        pbo_raw=original.pbo_raw,
        pto_raw=original.pto_raw,
        splitter_raw=original.splitter_raw,
        splitter_port_raw=original.splitter_port_raw,
        optical_power_dbm=original.optical_power_dbm,
        cable_length_m=original.cable_length_m,
        type_cable=original.type_cable,
        # Équipement
        equipment_type=original.equipment_type,
        # Orienteur
        orienteur_id=original.orienteur_id or current_user.orienteur_id,
    )

    db.add(new_job)
    await db.flush()

    # Logger
    await log_job_activity(
        db=db,
        job_id=new_job.id,
        action="created",
        description=f"Duplication de l'intervention #{original.id}",
        metadata={"source_job_id": original.id, "action": "duplicate"},
    )

    await db.commit()
    await db.refresh(new_job)

    # WebSocket
    try:
        service = DashboardService(db)
        await service.broadcast_job_event("job_created", {
            "job_id": new_job.id,
            "source_job_id": original.id,
            "status": "pending",
        })
        await service.broadcast_dashboard_update()
    except Exception as e:
        logger.warning(f"WebSocket error (duplicate): {e}")

    return JobResponse.from_orm_with_assignment(new_job)


@router.post("/{job_id}/cancel", response_model=JobResponse)
async def cancel_job_with_reason(
    job_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Annuler une intervention avec motif obligatoire.
    Body: { "reason": "Client a annulé sa commande" }
    """
    reason = payload.get("reason", "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Motif d'annulation obligatoire")

    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)

    old_status = job.status

    # Appliquer l'annulation via le WorkflowEngine
    try:
        engine = WorkflowEngine(db)
        job = await engine.transition_job(
            job=job,
            new_status=JobStatus.CANCELLED,
            technician_id=current_user.technician_id,
            metadata={"reason": reason, "extra": {"cancel_reason": reason}},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Ajouter le motif dans les notes
    job.notes = (job.notes or "") + f"\n[ANNULATION {datetime.utcnow().isoformat()}] : {reason}"
    job.failure_reason = reason
    await db.commit()
    await db.refresh(job)

    return JobResponse.from_orm_with_assignment(job)


@router.post("/{job_id}/archive", response_model=MessageResponse)
async def archive_job(
    job_id: int,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Archiver une intervention (soft delete).
    L'intervention disparaît des listes mais reste en base.
    Body: { "reason": "Intervention obsolète" }
    """
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)

    reason = payload.get("reason", "Archivage")

    # Soft delete : on marque avec deleted_at
    job.deleted_at = datetime.utcnow()
    job.deleted_by = current_user.id
    job.notes = (job.notes or "") + f"\n[ARCHIVE {datetime.utcnow().isoformat()}] : {reason}"
    job.updated_at = datetime.utcnow()

    await log_job_activity(
        db=db,
        job_id=job_id,
        action="archived",
        description=f"Archivage : {reason}",
        metadata={"reason": reason, "archived_by": current_user.id},
    )

    await db.commit()

    # WebSocket
    try:
        service = DashboardService(db)
        await service.broadcast_job_event("job_archived", {"job_id": job_id, "reason": reason})
        await service.broadcast_dashboard_update()
    except Exception as e:
        logger.warning(f"WebSocket error (archive): {e}")

    return MessageResponse(success=True, message=f"Intervention #{job_id} archivée")


@router.get("/{job_id}/timeline", response_model=List[JobActivityLogResponse])
async def get_job_timeline(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer la timeline complète d'une intervention depuis JobActivityLog."""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    await require_job_read_access(db, job=job, current_user=current_user)

    result = await db.execute(
        select(JobActivityLog)
        .where(JobActivityLog.job_id == job_id)
        .order_by(JobActivityLog.created_at.asc())
    )
    logs = result.scalars().all()

    return [JobActivityLogResponse.model_validate(log) for log in logs]


@router.get("/{job_id}/equipment", response_model=List[dict])
async def get_job_equipment(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer les équipements liés à une intervention."""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    await require_job_read_access(db, job=job, current_user=current_user)
    result = await db.execute(
        select(EquipmentInventory).where(
            EquipmentInventory.assigned_job_id == job_id
        )
    )
    equipments = result.scalars().all()

    return [
        {
            "id": eq.id,
            "serial_number": eq.serial_number,
            "mac_address": eq.mac_address,
            "operator": eq.operator,
            "equipment_type": eq.equipment_type,
            "model": eq.model,
            "status": eq.status,
        }
        for eq in equipments
    ]
