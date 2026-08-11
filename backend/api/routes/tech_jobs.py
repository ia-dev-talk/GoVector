import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.api.schemas import (
    JobResponse,
    TechFieldData,
    TechFieldResponse,
    JobStatusTransition,
    JobFailureCreate,
    JobPostponementCreate,
    JobActivityLogResponse,
)
from backend.database.connection import get_db
from backend.database.models import (
    Job,
    JobStatus,
    User,
    UserRole,
    Assignment,
    JobActivityLog,
    Warehouse,
    Stock,
    StockItem,
    StockConsumption,
    StockConsumptionItem,
    StockMovementType,
)
from backend.auth.dependencies import get_current_user, require_technician
from backend.logic import assignments as assignment_logic
from backend.logic.job_contract import technician_field_kwargs
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    accept_and_start_technician_job,
    fail_technician_job,
    postpone_technician_job,
    require_assigned_job,
    terminate_technician_job,
    transition_technician_job,
)
from backend.api.errors import BusinessAPIError
from backend.logic.completion_policy import CompletionPolicy
from backend.services.realtime.dashboard_service import DashboardService
from backend.logic.jobs import update_job, get_job
from backend.services.stock_service import StockService

router = APIRouter(tags=["Technician Jobs (Mobile)"])
logger = logging.getLogger("uvicorn.error")


def _mutation_http_exception(exc: TechnicianJobMutationError) -> BusinessAPIError:
    status_code = status.HTTP_400_BAD_REQUEST
    if exc.code == "job_not_found":
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.code == "job_not_assigned":
        status_code = status.HTTP_403_FORBIDDEN
    elif exc.status == "conflict":
        status_code = status.HTTP_409_CONFLICT
    code = {
        "invalid_job_status": "invalid_transition",
        "unsupported_technician_transition": "invalid_transition",
    }.get(exc.code, exc.code)
    return BusinessAPIError(status_code, code, exc.message)

# Liste des champs terrain autorisés (whitelist stricte)
# Tout champ absent de cette liste sera ignoré / rejeté
ALLOWED_FIELD_FIELDS = {
    "gps_latitude",
    "gps_longitude",
    "coordinator_comments",
    "before_photo",
    "after_photo",
    "client_signature",
    "optical_power_dbm",
    "cable_length_m",
    "ont_serial",
    "router_serial",
    "mac_address",
    "wifi_box_serial",
    "real_duration_minutes",
    "nro",
    "sro",
    "pbo",
    "splitter",
    "splitter_port",
    "pto",
}


async def _verify_job_ownership(
    db: AsyncSession,
    job_id: int,
    current_user: User,
) -> Job:
    """Vérifie que le Job appartient au technicien et est modifiable.
    Retourne le Job ou lève une HTTPException."""
    # 1. Récupérer le Job
    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Intervention {job_id} introuvable",
        )

    # 2. Vérifier que le technicien est bien assigné à ce Job
    tech_id = current_user.technician_id
    assignment = await assignment_logic.get_assignment_for_technician_job(
        db, technician_id=tech_id, job_id=job_id
    )
    if not assignment:
        logger.warning(
            f"[TECH_JOBS] Technicien {tech_id} non assigné au Job {job_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous n'êtes pas assigné à cette intervention",
        )

    # 3. Vérifier que le Job n'est pas dans un état terminal
    if job.status in (
        JobStatus.COMPLETED,
        JobStatus.CANCELLED,
        JobStatus.EN_ATTENTE_VALIDATION,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"L'intervention est déjà en statut {job.status.value}. Impossible de modifier les données terrain.",
        )

    return job


@router.patch("/{job_id}/field-data", response_model=TechFieldResponse)
async def save_tech_field_data(
    job_id: int,
    field_data: TechFieldData,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Confirmer les données terrain d'une intervention depuis le mobile.
    Seuls les champs terrain autorisés sont pris en compte."""
    # 1. Vérifier la propriété et l'état du Job
    job = await _verify_job_ownership(db, job_id, current_user)

    # 2. Extraire uniquement les champs fournis (exclude_unset)
    raw_data = field_data.model_dump(exclude_unset=True)

    # 3. Filtrer par whitelist (sécurité redondante)
    filtered_data = {
        key: value
        for key, value in raw_data.items()
        if key in ALLOWED_FIELD_FIELDS
    }
    mapped_data = technician_field_kwargs(filtered_data)

    if not mapped_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun champ terrain valide fourni",
        )

    logger.info(
        f"[TECH_JOBS] Technicien {current_user.technician_id} "
        f"sauvegarde données terrain Job {job_id}: "
        f"{list(filtered_data.keys())}"
    )
    logger.info(f"[TECH_JOBS] PAYLOAD: {filtered_data}")

    # 4. Appliquer la mise à jour
    updated = await update_job(db, job_id, **mapped_data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur lors de la mise à jour des données terrain",
        )

    # 5. Notifier le Dashboard en temps réel
    try:
        service = DashboardService(db)
        await service.broadcast_job_event(
            "tech_field_data_updated",
            {
                "job_id": job_id,
                "technician_id": current_user.technician_id,
                "fields": list(mapped_data.keys()),
            },
        )
        await service.broadcast_dashboard_update()
    except Exception as ws_err:
        logger.warning(
            f"WebSocket broadcast error (tech_field_data): {ws_err}"
        )

    return TechFieldResponse(
        success=True,
        message="Données terrain enregistrées avec succès",
        job_id=job_id,
        field_count=len(mapped_data),
    )


@router.post("/{job_id}/terminate", response_model=JobResponse)
async def terminate_job_from_mobile(
    job_id: int,
    payload: dict | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Terminer l'intervention depuis le mobile.
    Transitionne le Job vers EN_ATTENTE_VALIDATION.
    L'orienteur pourra ensuite valider ou renvoyer.
    Accepte les données terrain en body pour les sauvegarder avant clôture."""
    termination_payload = payload or {}
    try:
        completed = await terminate_technician_job(
            db,
            job_id=job_id,
            payload=termination_payload,
            current_user=current_user,
        )
        await db.commit()
        await db.refresh(completed)
    except TechnicianJobMutationError as exc:
        await db.rollback()
        raise _mutation_http_exception(exc) from exc
    # External notifications happen only after the business transaction commits.
    try:
        service = DashboardService(db)
        event_payload = {
            "job_id": job_id,
            "technician_id": current_user.technician_id,
            "new_status": JobStatus.EN_ATTENTE_VALIDATION.value,
        }
        logger.info(
            f"[TECH_JOBS] DASHBOARD EVENT job_terminated: {event_payload}"
        )
        await service.broadcast_job_event("job_terminated", event_payload)
        logger.info(f"[TECH_JOBS] DASHBOARD UPDATE broadcasted")
        await service.broadcast_dashboard_update()
    except Exception as ws_err:
        logger.warning(
            f"WebSocket broadcast error (terminate_job): {ws_err}"
        )

    return JobResponse.from_orm_with_assignment(completed)


# =============================================================================
# Tâche 5 — Nouvelles routes Sprint 2 : workflow terrain
# =============================================================================


@router.post("/{job_id}/status", response_model=JobResponse)
async def update_job_mobile_status(
    job_id: int,
    transition: JobStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Exécuter une transition directe du workflow technicien."""
    try:
        new_status = JobStatus(transition.new_status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Statut invalide : {transition.new_status}",
        )

    try:
        result = await transition_technician_job(
            db,
            job_id=job_id,
            new_status=new_status,
            payload={
                "latitude": transition.latitude,
                "longitude": transition.longitude,
                "accuracy": transition.accuracy,
                "comment": transition.comment,
            },
            current_user=current_user,
        )
        await db.commit()
        await db.refresh(result.job)
    except TechnicianJobMutationError as exc:
        await db.rollback()
        raise _mutation_http_exception(exc) from exc
    except Exception:
        await db.rollback()
        raise

    if result.transitions:
        try:
            old_status, applied_status = result.transitions[-1]
            service = DashboardService(db)
            await service.broadcast_job_event(
                "job_status_changed",
                {
                    "job_id": job_id,
                    "technician_id": current_user.technician_id,
                    "old_status": old_status.value,
                    "new_status": applied_status.value,
                },
            )
            await service.broadcast_dashboard_update()
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast error (status): {ws_err}")

    return JobResponse.from_orm_with_assignment(result.job)


@router.post("/{job_id}/start", response_model=JobResponse)
async def start_job_mobile(
    job_id: int,
    transition: JobStatusTransition,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Accepter puis démarrer atomiquement une intervention technicien."""
    try:
        result = await accept_and_start_technician_job(
            db,
            job_id=job_id,
            payload={
                "latitude": transition.latitude,
                "longitude": transition.longitude,
                "accuracy": transition.accuracy,
                "comment": transition.comment,
            },
            current_user=current_user,
        )
        await db.commit()
        await db.refresh(result.job)
    except TechnicianJobMutationError as exc:
        await db.rollback()
        raise _mutation_http_exception(exc) from exc
    except Exception:
        await db.rollback()
        raise

    # Les notifications externes partent après le commit et seulement si la
    # commande a réellement produit un départ.
    if result.transitions:
        try:
            service = DashboardService(db)
            await service.broadcast_job_event(
                "job_started",
                {
                    "job_id": job_id,
                    "technician_id": current_user.technician_id,
                    "new_status": JobStatus.EN_ROUTE.value,
                    "transitions": [
                        f"{old.value}->{new.value}"
                        for old, new in result.transitions
                    ],
                    "latitude": transition.latitude,
                    "longitude": transition.longitude,
                },
            )
            await service.broadcast_dashboard_update()
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast error (start): {ws_err}")

    return JobResponse.from_orm_with_assignment(result.job)


@router.post("/{job_id}/failure", response_model=dict)
async def declare_job_failure(
    job_id: int,
    failure_data: JobFailureCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Déclarer un échec d'intervention depuis le mobile.
    Transitionne le Job vers FAILED et enregistre le motif d'échec."""
    try:
        result = await fail_technician_job(
            db,
            job_id=job_id,
            payload=failure_data.model_dump(),
            current_user=current_user,
        )
        await db.commit()
    except TechnicianJobMutationError as exc:
        await db.rollback()
        raise _mutation_http_exception(exc) from exc
    except Exception:
        await db.rollback()
        raise

    if result.transitions:
        try:
            service = DashboardService(db)
            await service.broadcast_job_event(
                "job_failure",
                {
                    "job_id": job_id,
                    "technician_id": current_user.technician_id,
                    "reason": failure_data.reason,
                    "old_status": result.transitions[0][0].value,
                },
            )
            await service.broadcast_dashboard_update()
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast error (failure): {ws_err}")

    return {
        "success": True,
        "message": "Échec enregistré avec succès",
        "job_id": job_id,
        "reason": failure_data.reason,
    }


@router.post("/{job_id}/postpone", response_model=dict)
async def postpone_job_mobile(
    job_id: int,
    postpone_data: JobPostponementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Demander un report d'intervention depuis le mobile.
    Transitionne le Job vers POSTPONED et enregistre la demande de report."""
    try:
        result = await postpone_technician_job(
            db,
            job_id=job_id,
            payload=postpone_data.model_dump(),
            current_user=current_user,
        )
        await db.commit()
    except TechnicianJobMutationError as exc:
        await db.rollback()
        raise _mutation_http_exception(exc) from exc
    except Exception:
        await db.rollback()
        raise

    if result.transitions:
        try:
            service = DashboardService(db)
            await service.broadcast_job_event(
                "job_postponed",
                {
                    "job_id": job_id,
                    "technician_id": current_user.technician_id,
                    "reason": postpone_data.reason,
                    "requested_date": (
                        str(postpone_data.requested_date)
                        if postpone_data.requested_date
                        else None
                    ),
                },
            )
            await service.broadcast_dashboard_update()
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast error (postpone): {ws_err}")

    return {
        "success": True,
        "message": "Demande de report enregistrée avec succès",
        "job_id": job_id,
        "reason": postpone_data.reason,
        "requested_date": (
            str(postpone_data.requested_date)
            if postpone_data.requested_date
            else None
        ),
    }


@router.get("/stock")
async def get_technician_stock(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne le stock du technicien connecté via ses entrepôts/warehouses dédiés."""
    tech_id = current_user.technician_id
    if not tech_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profil technicien manquant")

    wh_result = await db.execute(
        select(Warehouse).where(
            Warehouse.name.ilike(f"%technicien {tech_id}%"),
            Warehouse.is_active == True,
        )
    )
    warehouses = wh_result.scalars().all()
    warehouse_ids = [w.id for w in warehouses]

    if not warehouse_ids:
        return []

    rows = await db.execute(
        select(Stock, StockItem, Warehouse)
        .join(StockItem, Stock.item_id == StockItem.id)
        .join(Warehouse, Stock.warehouse_id == Warehouse.id)
        .where(Stock.warehouse_id.in_(warehouse_ids))
        .order_by(StockItem.equipment_type, StockItem.reference)
    )
    results = []
    for stock, item, warehouse in rows.all():
        results.append(
            {
                "stock_id": stock.id,
                "item_id": item.id,
                "reference": item.reference,
                "label": item.label,
                "equipment_type": item.equipment_type,
                "operator": item.operator,
                "warehouse_id": warehouse.id,
                "warehouse_name": warehouse.name,
                "quantity": stock.quantity,
                "reserved_quantity": stock.reserved_quantity,
                "available_quantity": stock.available_quantity,
            }
        )
    return results


@router.post("/{job_id}/validate-serial")
async def validate_job_serial_numbers(
    job_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Valide les numéros de série avant clôture :
    - existence en base
    - appartenance au stock du technicien
    - non utilisation sur une autre intervention active
    """
    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intervention introuvable")

    serial_fields = {
        "ont_serial": "ONT",
        "router_serial": "Routeur",
        "wifi_box_serial": "Boîtier WiFi",
        "mac_address": "MAC Address",
    }
    errors = []
    findings = {}

    for field, label in serial_fields.items():
        value = (payload.get(field) or "").strip()
        if not value:
            continue
        findings[field] = value

        inv = await db.execute(select(EquipmentInventory).where(EquipmentInventory.serial_number == value))
        record = inv.scalar_one_or_none()
        if not record:
            errors.append({"field": field, "label": label, "message": f"Numéro de série inconnu : {value}"})
            continue

        same_job_active = await db.execute(
            select(Job.id).where(
                Job.id != job_id,
                Job.status.notin_([JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.EN_ATTENTE_VALIDATION]),
                getattr(Job, field) == value,
            )
        )
        if same_job_active.scalar_one_or_none():
            errors.append({"field": field, "label": label, "message": f"Numéro déjà utilisé sur une intervention active : {value}"})

        if record.operator and record.operator == getattr(job, "operator", None):
            continue

        if record.warehouse and ("technicien" in record.warehouse.lower() or "vehicule" in record.warehouse.lower()):
            continue

        errors.append({"field": field, "label": label, "message": f"Équipement non autorisé pour ce technicien/opérateur : {value}"})

    return {
        "job_id": job_id,
        "checked": list(findings.keys()),
        "valid": not errors,
        "errors": errors,
    }


@router.post("/{job_id}/consume-stock", response_model=dict)
async def consume_job_stock(
    job_id: int,
    items: list[dict],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Crée une consommation de stock pour une intervention terminée.
    Déduit le stock du véhicule/warehouse du technicien."""
    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intervention introuvable")

    tech_id = current_user.technician_id
    wh_result = await db.execute(
        select(Warehouse).where(
            Warehouse.name.ilike(f"%technicien {tech_id}%"),
            Warehouse.is_active == True,
        )
    )
    warehouse = wh_result.scalar_one_or_none()
    warehouse_id = warehouse.id if warehouse else None

    consumption = await StockService(db).create_consumption(
        job_id=job_id,
        technician_id=tech_id,
        operator=getattr(job, "operator", None),
        notes=f"Consommation auto intervention {job_id}",
        created_by=current_user.id,
        warehouse_id=warehouse_id,
        items=items,
    )
    await db.commit()
    await db.refresh(consumption)

    try:
        await StockService(db).validate_consumption(consumption.id, validated_by=current_user.id, warehouse_id=warehouse_id)
        await db.commit()
        await db.refresh(consumption)
    except Exception as e:
        logger.warning(f"[TECH_JOBS] validation consommation autoKO: {e}")

    return {
        "id": consumption.id,
        "consumption_number": consumption.consumption_number,
        "status": consumption.status.value if consumption.status else None,
    }


@router.get("/kpis", response_model=dict)
async def get_technician_kpis(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Indicateurs terrain pour le dashboard technicien."""
    tech_id = current_user.technician_id
    if not tech_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profil technicien manquant")

    today = datetime.utcnow().date()
    start_today = datetime(today.year, today.month, today.day)

    assignments_q = select(Assignment).where(
        Assignment.technician_id == tech_id,
        Assignment.ended_at.is_(None),
    )
    all_assignments = (await db.execute(assignments_q)).scalars().all()
    job_ids = [a.job_id for a in all_assignments]

    jobs_today = jobs_total = jobs_completed = jobs_in_progress = jobs_failed = jobs_postponed = 0

    if job_ids:
        jobs_q = select(Job).where(Job.id.in_(job_ids))
        jobs = (await db.execute(jobs_q)).scalars().all()
        for j in jobs:
            jobs_total += 1
            if getattr(j, 'scheduled_date', None) and j.scheduled_date.date() == today:
                jobs_today += 1
            if j.status == JobStatus.COMPLETED:
                jobs_completed += 1
            elif j.status == JobStatus.IN_PROGRESS:
                jobs_in_progress += 1
            elif j.status == JobStatus.FAILED:
                jobs_failed += 1
            elif j.status == JobStatus.POSTPONED:
                jobs_postponed += 1

    completion_rate = (jobs_completed / jobs_total * 100) if jobs_total else 0
    failure_rate = (jobs_failed / jobs_total * 100) if jobs_total else 0

    return {
        "technician_id": tech_id,
        "jobs_total": jobs_total,
        "jobs_today": jobs_today,
        "jobs_in_progress": jobs_in_progress,
        "jobs_completed": jobs_completed,
        "jobs_failed": jobs_failed,
        "jobs_postponed": jobs_postponed,
        "completion_rate": round(completion_rate, 2),
        "failure_rate": round(failure_rate, 2),
        "report_requests": jobs_postponed,
    }


@router.get("/{job_id}/completion-requirements", response_model=dict)
async def get_completion_requirements(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """Return the effective completion evidence policy for an assigned job."""
    try:
        job = await require_assigned_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError as exc:
        raise _mutation_http_exception(exc) from exc
    return (await CompletionPolicy(db).evaluate(job)).as_dict()


@router.get("/{job_id}/activity-log", response_model=list[JobActivityLogResponse])
async def get_job_activity_log(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer le journal d'activité d'une intervention.
    Accessible au technicien assigné, à l'orienteur et à l'admin."""
    # Vérifier que le Job existe
    job = await get_job(db, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Intervention {job_id} introuvable",
        )

    # Vérifier les permissions : seul le technicien assigné, l'orienteur ou l'admin
    user = current_user
    if user.role == UserRole.TECHNICIAN:
        # Vérifier que le technicien est bien assigné
        assignment = await assignment_logic.get_assignment_for_technician_job(
            db, technician_id=user.technician_id, job_id=job_id
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vous n'êtes pas autorisé à consulter ce journal",
            )

    # Récupérer le journal d'activité
    result = await db.execute(
        select(JobActivityLog)
        .where(JobActivityLog.job_id == job_id)
        .order_by(JobActivityLog.created_at.asc())
    )
    logs = result.scalars().all()

    return [JobActivityLogResponse.model_validate(log) for log in logs]
