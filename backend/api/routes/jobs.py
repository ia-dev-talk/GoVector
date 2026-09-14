"""
API routes for job operations
"""
import traceback
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, or_, select

from backend.api.schemas import (
    CanDoResult,
    JobCreate,
    JobResponse,
    JobStatusUpdate,
    JobSummary,
    JobUpdate,
    MessageResponse,
    JobActivityLogResponse,
)
from backend.api.job_responses import job_response, job_responses
from backend.database.connection import get_db
from backend.database.models import ClientOrganization, JobStatus, JobType, User, UserRole, Orienteur, Technician, Job, JobActivityLog
from backend.logic import jobs as job_logic
from backend.logic import technicians as tech_logic
from backend.logic import assignments as assignment_logic
from backend.logic.workflow.engine import WorkflowEngine
from backend.logic.job_access import require_job_operations_access, require_job_read_access
from backend.logic.job_contract import job_create_kwargs
from backend.auth.dependencies import get_current_user, require_orienteur, require_admin
from backend.services.realtime.dashboard_service import DashboardService

router = APIRouter(tags=["Jobs"])
logger = logging.getLogger("uvicorn.error")


@router.post("/", response_model=JobResponse, status_code=201)
async def create_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Créer une nouvelle intervention d'ingénierie FTTH"""

    logger.info(
        f"--- [PAYLOAD REÇU FROM FLUTTER] --- : {job_data.model_dump()}"
    )

    # Assignation automatique de l'orienteur_id pour l'Orienteur bureau.
    # CHEF_ORIENTEUR est l'Agent terrain et n'entre jamais par cette route.
    orienteur_id = None
    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id:
        orienteur_id = current_user.orienteur_id

    if (
        current_user.role == UserRole.ORIENTEUR
        and job_data.client_organization_id is not None
    ):
        raise HTTPException(
            status_code=403,
            detail="Seul un administrateur peut choisir l'entreprise cliente.",
        )

    effective_job_data = job_data
    if job_data.client_organization_id is None and job_data.operator:
        operator_key = job_data.operator.strip().lower()
        organizations = (
            await db.execute(
                select(ClientOrganization).where(
                    ClientOrganization.is_active.is_(True),
                    or_(
                        func.lower(ClientOrganization.code) == operator_key,
                        func.lower(ClientOrganization.operator) == operator_key,
                    ),
                )
            )
        ).scalars().all()
        organization_ids = {organization.id for organization in organizations}
        if len(organization_ids) == 1:
            effective_job_data = job_data.model_copy(
                update={"client_organization_id": organization_ids.pop()}
            )

    try:
        job = await job_logic.create_job(
            db=db,
            **job_create_kwargs(effective_job_data, orienteur_id=orienteur_id),
        )

        # ✅ Temps réel : notifier Dashboard
        try:
            service = DashboardService(db)
            await service.broadcast_job_event("job_created", {"job_id": job.id, "status": job.status.value if job.status else "unknown"})
            await service.broadcast_dashboard_update()
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast error (create_job): {ws_err}")

        return await job_response(db, job)

    except Exception as e:
        logger.error(
            f"[CRITICAL CRASH] Échec lors de l'exécution de create_job : {e}"
        )
        traceback.print_exc()

        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de la création de la ressource : {str(e)}"
        )

@router.get("/", response_model=List[JobResponse])
async def get_jobs(
    status: Optional[JobStatus] = Query(None, description="Filter by job status"),
    scheduled_date: Optional[date] = Query(None, description="Filter by scheduled date"),
    scheduled_from: Optional[date] = Query(None, description="Filter from scheduled date"),
    scheduled_to: Optional[date] = Query(None, description="Filter through scheduled date"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get jobs with role scoping. Field agents use /orienteur-agent/me only."""
    import logging
    logger = logging.getLogger("uvicorn.error")

    if scheduled_date is not None and (
        scheduled_from is not None or scheduled_to is not None
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "scheduled_date cannot be combined with "
                "scheduled_from or scheduled_to."
            ),
        )

    if (
        scheduled_from is not None
        and scheduled_to is not None
        and scheduled_from > scheduled_to
    ):
        raise HTTPException(
            status_code=422,
            detail="scheduled_from cannot be after scheduled_to.",
        )

    if current_user.role == UserRole.ADMIN:
        jobs = await job_logic.get_all_jobs(
            db,
            status=status,
            scheduled_date=scheduled_date,
            scheduled_from=scheduled_from,
            scheduled_to=scheduled_to,
            skip=skip,
            limit=limit,
        )
        logger.info(f"[TECH_JOBS] ADMIN jobs count={len(jobs)}")
        return await job_responses(db, jobs)

    if current_user.role == UserRole.ORIENTEUR:
        if not current_user.orienteur_id:
            raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")
        jobs = await job_logic.get_jobs_by_orienteur_id(
            db,
            orienteur_id=current_user.orienteur_id,
            status=status,
            scheduled_date=scheduled_date,
            scheduled_from=scheduled_from,
            scheduled_to=scheduled_to,
            skip=skip,
            limit=limit,
        )
        logger.info(f"[TECH_JOBS] ORIENTEUR orienteur_id={current_user.orienteur_id} jobs_count={len(jobs)}")
        return await job_responses(db, jobs)

    if current_user.role == UserRole.TECHNICIAN:
        technician_id = current_user.technician_id
        if not technician_id:
            raise HTTPException(status_code=403, detail="Technicien non affilié.")
        logger.info(f"[TECH_JOBS] TECHNICIAN user_id={current_user.id} technician_id={technician_id}")

        assignments = await assignment_logic.get_assignments_for_technician(db, technician_id=technician_id)
        job_ids = [a.job_id for a in assignments if a.job_id is not None]
        logger.info(f"[TECH_JOBS] Assignments trouvés={len(job_ids)} -> job_ids={job_ids}")

        if not job_ids:
            return []

        base_query = select(Job).where(
            Job.id.in_(job_ids),
            Job.deleted_at.is_(None),
        )

        if status:
            base_query = base_query.where(Job.status == status)
        if scheduled_date:
            start_of_day = datetime.combine(scheduled_date, datetime.min.time())
            end_of_day = datetime.combine(scheduled_date, datetime.max.time())
            base_query = base_query.where(
                Job.scheduled_date >= start_of_day,
                Job.scheduled_date <= end_of_day,
            )
        else:
            if scheduled_from is not None:
                base_query = base_query.where(
                    Job.scheduled_date >= datetime.combine(
                        scheduled_from,
                        datetime.min.time(),
                    )
                )
            if scheduled_to is not None:
                base_query = base_query.where(
                    Job.scheduled_date < (
                        datetime.combine(
                            scheduled_to,
                            datetime.min.time(),
                        )
                        + timedelta(days=1)
                    )
                )

        base_query = base_query.order_by(Job.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(base_query)
        jobs = result.scalars().all()
        logger.info(f"[TECH_JOBS] Jobs IDs retournés={[j.id for j in jobs]}")
        logger.info(f"[TECH_JOBS] Retour API = {len(jobs)} jobs")
        return await job_responses(db, jobs)

    if current_user.role == UserRole.CHEF_ORIENTEUR:
        raise HTTPException(
            status_code=403,
            detail="L'Agent terrain doit utiliser son espace équipe dédié.",
        )

    raise HTTPException(status_code=403, detail="Accès insuffisant pour voir les interventions.")


@router.get("/my", response_model=List[JobResponse])
async def get_my_jobs(
    status: Optional[JobStatus] = Query(None, description="Filter by job status"),
    scheduled_date: Optional[date] = Query(None, description="Filter by scheduled date"),
    scheduled_from: Optional[date] = Query(None, description="Filter from scheduled date"),
    scheduled_to: Optional[date] = Query(None, description="Filter through scheduled date"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the same role-scoped jobs collection used by the main jobs route."""
    return await get_jobs(
        status=status,
        scheduled_date=scheduled_date,
        scheduled_from=scheduled_from,
        scheduled_to=scheduled_to,
        skip=skip,
        limit=limit,
        db=db,
        current_user=current_user,
    )


@router.get("/pending", response_model=List[JobResponse])
async def get_pending_jobs(
    scheduled_date: Optional[date] = Query(None, description="Filter by scheduled date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get pending jobs. Field agents never receive the global pending queue."""
    if current_user.role == UserRole.ADMIN:
        jobs = await job_logic.get_pending_jobs(db, scheduled_date=scheduled_date)
    elif current_user.role == UserRole.ORIENTEUR:
        if not current_user.orienteur_id:
            raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")
        jobs = await job_logic.get_pending_jobs_by_orienteur_id(db, orienteur_id=current_user.orienteur_id, scheduled_date=scheduled_date)
    else:
        raise HTTPException(status_code=403, detail="Accès insuffisant pour voir les interventions en attente.")
    return await job_responses(db, jobs)


@router.get("/summary", response_model=JobSummary)
async def get_jobs_summary(
    target_date: Optional[date] = Query(None, description="Get summary for specific date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get summary statistics of jobs by status, filtered by user role."""
    if current_user.role == UserRole.ADMIN:
        summary = await job_logic.get_jobs_summary(db, target_date=target_date)
    elif current_user.role == UserRole.ORIENTEUR:
        if not current_user.orienteur_id:
            raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")
        summary = await job_logic.get_jobs_summary_by_orienteur_id(db, orienteur_id=current_user.orienteur_id, target_date=target_date)
    elif current_user.role == UserRole.TECHNICIAN:
        if not current_user.technician_id:
            raise HTTPException(status_code=403, detail="Technicien non affilié.")
        summary = await job_logic.get_jobs_summary_by_technician_id(
            db,
            technician_id=current_user.technician_id,
            target_date=target_date,
        )
    else:
        raise HTTPException(status_code=403, detail="Accès insuffisant pour voir le résumé des interventions.")
    return JobSummary(**summary)


@router.get("/search/query", response_model=List[JobResponse])
async def search_jobs(
    date_from: Optional[date] = Query(None, description="Search from date"),
    date_to: Optional[date] = Query(None, description="Search to date"),
    job_id: Optional[int] = Query(None, description="Filter by job ID"),
    job_number: Optional[str] = Query(None, description="Filter by job number (partial match)"),
    tech_id: Optional[int] = Query(None, description="Filter by assigned technician ID"),
    customer_name: Optional[str] = Query(None, description="Filter by customer name (partial match)"),
    status: Optional[JobStatus] = Query(None, description="Filter by job status"),
    job_type: Optional[JobType] = Query(None, description="Filter by job type"),
    route_criteria: Optional[str] = Query(None, description="Filter by route criteria / management area"),
    skill_group: Optional[str] = Query(None, description="Filter by required skill"),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Multi-criteria job search — historical, current, and future jobs.
    Field agents use their dedicated team-scoped endpoints instead.
    """
    if current_user.role == UserRole.ADMIN:
        jobs = await job_logic.search_jobs(
            db,
            date_from=date_from,
            date_to=date_to,
            job_id=job_id,
            job_number=job_number,
            tech_id=tech_id,
            customer_name=customer_name,
            status=status,
            job_type=job_type,
            route_criteria=route_criteria,
            skill_group=skill_group,
            limit=limit,
        )
    elif current_user.role == UserRole.ORIENTEUR:
        if not current_user.orienteur_id:
            raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")
        jobs = await job_logic.search_jobs_by_orienteur_id(
            db,
            orienteur_id=current_user.orienteur_id,
            date_from=date_from,
            date_to=date_to,
            job_id=job_id,
            job_number=job_number,
            customer_name=customer_name,
            status=status,
            job_type=job_type,
            route_criteria=route_criteria,
            skill_group=skill_group,
            limit=limit,
        )
    else:
        raise HTTPException(status_code=403, detail="Accès insuffisant pour rechercher des interventions.")
    return await job_responses(db, jobs)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific job by ID, filtered by user role"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Intervention {job_id} non trouvée")

    await require_job_read_access(
        db,
        job=job,
        current_user=current_user,
    )

    return await job_response(db, job)


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: int,
    job_data: JobUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Update job information"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)

    update_data = job_data.model_dump(exclude_unset=True)
    final_latitude = update_data.get("latitude", job.latitude)
    final_longitude = update_data.get("longitude", job.longitude)
    if (final_latitude is None) != (final_longitude is None):
        raise HTTPException(
            status_code=422,
            detail="La latitude et la longitude doivent être fournies ensemble.",
        )
    if final_latitude is None:
        if update_data.get("planned_location_source") is not None or update_data.get(
            "planned_location_precision"
        ) is not None:
            raise HTTPException(
                status_code=422,
                detail="La provenance de localisation nécessite des coordonnées.",
            )
        update_data["planned_location_source"] = None
        update_data["planned_location_precision"] = None
    if (
        current_user.role == UserRole.ORIENTEUR
        and "client_organization_id" in update_data
    ):
        raise HTTPException(
            status_code=403,
            detail="Seul un administrateur peut modifier l'entreprise cliente.",
        )
    try:
        updated = await job_logic.update_job(db, job_id, **update_data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # ✅ Temps réel : notifier Dashboard
    try:
        service = DashboardService(db)
        await service.broadcast_job_event("job_updated", {"job_id": job_id, "status": updated.status.value if updated.status else "unknown"})
        await service.broadcast_dashboard_update()
    except Exception as ws_err:
        logger.warning(f"WebSocket broadcast error (update_job): {ws_err}")

    return await job_response(db, updated)


@router.patch("/{job_id}/status", response_model=JobResponse)
async def update_job_status(
    job_id: int,
    status_data: JobStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Update job status"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)
    if status_data.status == JobStatus.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail="Utilisez la validation bureau après le contrôle de l'Agent terrain.",
        )
    try:
        job = await job_logic.update_job_status(db, job_id, status_data.status)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return await job_response(db, job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{job_id}/start", response_model=JobResponse)
async def start_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Start a job (transition to in_progress)"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)
    try:
        job = await job_logic.start_job(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return await job_response(db, job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{job_id}/complete", response_model=JobResponse)
async def complete_job(
    job_id: int,
    payload: Optional[dict] = {},
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Complete a job, optionally with wifi_box_serial from mobile scan"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)
    try:
        serial = payload.get("wifi_box_serial") if isinstance(payload, dict) else None
        job = await job_logic.complete_job(
            db,
            job_id,
            wifi_box_serial=serial,
            validated_by_user_id=current_user.id,
        )
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return await job_response(db, job)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(
    job_id: int,
    reason: Optional[str] = Query(None, max_length=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Cancel a job"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)
    try:

        job = await job_logic.cancel_job(
            db,
            job_id,
            reason
        )

        if not job:
            raise HTTPException(
                status_code=404,
                detail=f"Job {job_id} not found"
            )

        return await job_response(db, job)


    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

@router.delete("/{job_id}", response_model=MessageResponse)
async def delete_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Archive a cancelled job while preserving audit history. Pilot deletion is restricted to ADMIN."""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)
    try:
        success = await job_logic.delete_job(
            db,
            job_id,
            deleted_by=current_user.id,
        )
        if not success:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return MessageResponse(success=True, message=f"Job {job_id} archived")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{job_id}/stock")
async def get_job_technician_stock(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne le stock embarqué du technicien affecté à ce job."""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    await require_job_read_access(db, job=job, current_user=current_user)
    from backend.logic.technician_details import get_technician_full_details
    from backend.logic.assignments import get_job_assignments

    assignments = await get_job_assignments(db, job_id)
    if not assignments:
        return {"technician_id": None, "vehicle_stock": [], "stock_summary": None}

    tech_id = assignments[0].technician_id
    if not tech_id:
        return {"technician_id": None, "vehicle_stock": [], "stock_summary": None}

    details = await get_technician_full_details(db, tech_id)
    return {
        "technician_id": tech_id,
        "technician_name": details["technician"]["name"],
        "vehicle_stock": details["vehicle_stock"],
        "stock_summary": details["stock_summary"],
    }


@router.post("/{job_id}/consume-stock")
async def consume_stock_for_job(
    job_id: int,
    items: str = Query(..., description='JSON list: [{"item_id":1,"quantity":1,"serial_number":"..."}]'),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consomme du stock pour un job (ex: ONT installé)."""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    require_job_operations_access(job=job, current_user=current_user)
    from backend.logic.assignments import get_job_assignments
    from backend.services.stock_service import StockService
    from backend.database.models import Warehouse
    import json

    try:
        parsed = json.loads(items)
    except Exception:
        raise HTTPException(400, "items must be a valid JSON array")

    assignments = await get_job_assignments(db, job_id)
    if not assignments:
        raise HTTPException(400, "Aucun technicien affecté à ce job")

    tech_id = assignments[0].technician_id
    if not tech_id:
        raise HTTPException(400, "Aucun technicien affecté à ce job")

    wh_result = await db.execute(
        select(Warehouse).where(
            Warehouse.name.ilike(f"%technicien {tech_id}%"),
            Warehouse.is_active == True,
        )
    )
    warehouse = wh_result.scalar_one_or_none()
    warehouse_id = warehouse.id if warehouse else None

    svc = StockService(db)
    consumption = await svc.create_consumption(
        job_id=job_id,
        technician_id=tech_id,
        operator=current_user.username or current_user.email,
        notes=f"Consommation job #{job_id}",
        created_by=current_user.id,
        warehouse_id=warehouse_id,
        items=[
            {
                "item_id": i.get("item_id"),
                "quantity": i.get("quantity", 1),
                "serial_number": i.get("serial_number"),
                "mac_address": i.get("mac_address"),
            }
            for i in parsed
        ],
    )
    consumption = await svc.validate_consumption(
        consumption.id,
        validated_by=current_user.id,
        warehouse_id=warehouse_id,
    )
    await db.commit()
    await db.refresh(consumption)

    return {
        "id": consumption.id,
        "consumption_number": consumption.consumption_number,
        "status": consumption.status.value,
        "items": [
            {
                "item_id": ci.item_id,
                "quantity": ci.quantity,
                "serial_number": ci.serial_number,
            }
            for ci in consumption.items
        ],
    }


@router.get("/{job_id}/can-do/{tech_id}", response_model=CanDoResult)
async def check_can_do(
    job_id: int,
    tech_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Check if a technician can perform a job (CanDo — skill, route, time)"""
    job = await job_logic.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    tech = await tech_logic.get_technician(db, tech_id)
    if not tech:
        raise HTTPException(status_code=404, detail=f"Technician {tech_id} not found")

    result = job_logic.can_technician_do_job(job, tech)

    return CanDoResult(
        job_id=job_id,
        technician_id=tech_id,
        **result,
    )
