"""
Route de Supervision Temps Réel (Sprint 7)
Centre de Supervision, GPS Live, Statuts temps réel, Alertes
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from backend.database.connection import get_db
from backend.database.models import (
    Technician,
    TechnicianLiveStatus,
    GPSHistory,
    Alert,
    Job,
    JobStatus,
    Assignment,
    User,
    UserRole,
    Orienteur,
    Sector,
)
from backend.api.schemas.technicians import (
    GPSLiveUpdate,
    TechnicianLiveStatusUpdate,
    TechnicianLiveResponse,
    GPSHistoryResponse,
    AlertResponse,
    SupervisionMapResponse,
)
from backend.auth.dependencies import require_orienteur, require_technician
from backend.logic.job_access import require_job_read_access_by_id
from backend.logic.job_visits import resolve_visit_for_technician
from backend.services.realtime.dashboard_service import DashboardService
from backend.services.realtime.websocket_manager import ws_manager, WSEvent

router = APIRouter(tags=["Supervision Temps Réel"])
logger = logging.getLogger("uvicorn.error")


@router.post("/gps", response_model=dict)
async def update_technician_gps(
    gps_data: GPSLiveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """
    PRIORITÉ 1 — GPS Live
    Reçoit la position GPS du technicien depuis le mobile.
    Met à jour la position en temps réel et historise dans GPSHistory.
    """
    tech_id = current_user.technician_id
    if not tech_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profil technicien manquant",
        )

    if gps_data.job_id is not None:
        await require_job_read_access_by_id(
            db,
            job_id=gps_data.job_id,
            current_user=current_user,
        )

    # Récupérer le technicien
    result = await db.execute(select(Technician).where(Technician.id == tech_id))
    tech = result.scalar_one_or_none()
    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technicien introuvable",
        )

    now = datetime.now(timezone.utc)
    observed_at = (
        gps_data.observed_at.astimezone(timezone.utc)
        if gps_data.observed_at is not None
        else now
    )
    last_location_update = tech.last_location_update
    if last_location_update is not None and last_location_update.tzinfo is None:
        last_location_update = last_location_update.replace(tzinfo=timezone.utc)
    is_latest_fix = (
        last_location_update is None or observed_at >= last_location_update
    )

    # A late HTTP response must never rewind the live technician position.
    if is_latest_fix:
        tech.current_latitude = gps_data.latitude
        tech.current_longitude = gps_data.longitude
        tech.current_speed = gps_data.speed
        tech.current_heading = gps_data.heading
        tech.current_accuracy = gps_data.accuracy
        tech.current_battery = gps_data.battery_level
        tech.last_location_update = observed_at

        if gps_data.job_id is not None:
            tech.current_job_id = gps_data.job_id

    # Historiser dans GPSHistory
    visit = (
        await resolve_visit_for_technician(
            db, job_id=gps_data.job_id, technician_id=tech_id
        )
        if gps_data.job_id is not None
        else None
    )
    gps_record = GPSHistory(
        technician_id=tech_id,
        job_id=gps_data.job_id,
        visit_id=visit.id if visit is not None else None,
        latitude=gps_data.latitude,
        longitude=gps_data.longitude,
        speed=gps_data.speed,
        heading=gps_data.heading,
        accuracy=gps_data.accuracy,
        battery_level=gps_data.battery_level,
        recorded_at=observed_at,
    )
    db.add(gps_record)
    await db.commit()

    # Diffuser la position via WebSocket
    if is_latest_fix:
        try:
            await ws_manager.broadcast(
                WSEvent.TECH_LOCATION_UPDATED,
                {
                    "technician_id": tech_id,
                    "technician_name": tech.name,
                    "latitude": gps_data.latitude,
                    "longitude": gps_data.longitude,
                    "speed": gps_data.speed,
                    "heading": gps_data.heading,
                    "accuracy": gps_data.accuracy,
                    "battery_level": gps_data.battery_level,
                    "live_status": tech.live_status.value,
                    "job_id": gps_data.job_id,
                    "timestamp": observed_at.isoformat(),
                },
                room="supervision",
            )
        except Exception as ws_err:
            logger.warning(f"WebSocket broadcast error (gps): {ws_err}")

    return {
        "success": True,
        "message": "Position mise à jour",
        "recorded_at": observed_at.isoformat(),
        "applied_to_live_position": is_latest_fix,
    }


@router.post("/status", response_model=dict)
async def update_technician_live_status(
    status_data: TechnicianLiveStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_technician),
):
    """
    PRIORITÉ 2 — Statut temps réel du technicien
    Le technicien change son statut depuis le mobile.
    Met à jour le backend et notifie le Dashboard.
    """
    tech_id = current_user.technician_id
    if not tech_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profil technicien manquant",
        )

    if status_data.job_id is not None:
        await require_job_read_access_by_id(
            db,
            job_id=status_data.job_id,
            current_user=current_user,
        )

    result = await db.execute(select(Technician).where(Technician.id == tech_id))
    tech = result.scalar_one_or_none()
    if not tech:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Technicien introuvable",
        )

    old_status = tech.live_status
    tech.live_status = status_data.status

    # Mettre à jour la position si fournie
    if status_data.latitude is not None:
        tech.current_latitude = status_data.latitude
        tech.current_longitude = status_data.longitude
        tech.last_location_update = datetime.now(timezone.utc)

    # Mettre à jour current_job_id si fourni
    if status_data.job_id is not None:
        tech.current_job_id = status_data.job_id
    elif status_data.status == TechnicianLiveStatus.DISPONIBLE:
        tech.current_job_id = None

    await db.commit()

    # Diffuser le changement de statut via WebSocket
    try:
        await ws_manager.broadcast(
            WSEvent.TECH_STATUS_CHANGED,
            {
                "technician_id": tech_id,
                "technician_name": tech.name,
                "old_status": old_status.value,
                "new_status": status_data.status.value,
                "latitude": status_data.latitude,
                "longitude": status_data.longitude,
                "job_id": status_data.job_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            room="supervision",
        )
        # Aussi diffuser la mise à jour du Dashboard
        service = DashboardService(db)
        await service.broadcast_dashboard_update()
    except Exception as ws_err:
        logger.warning(f"WebSocket broadcast error (status): {ws_err}")

    return {
        "success": True,
        "message": f"Statut mis à jour : {status_data.status.value}",
        "old_status": old_status.value,
        "new_status": status_data.status.value,
    }


@router.get("/map", response_model=SupervisionMapResponse)
async def get_supervision_map(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    PRIORITÉ 6 — Centre de Supervision
    Retourne tous les techniciens avec leur position en direct,
    les alertes actives et les KPIs temps réel.
    """
    # Récupérer tous les techniciens actifs
    result = await db.execute(
        select(Technician).where(Technician.is_active == True)
    )
    technicians = result.scalars().all()

    tech_responses = []
    for tech in technicians:
        # Récupérer le job en cours si current_job_id
        current_job_customer = None
        current_job_address = None
        current_job_started_at = None
        if tech.current_job_id:
            job_result = await db.execute(
                select(Job).where(Job.id == tech.current_job_id)
            )
            job = job_result.scalar_one_or_none()
            if job:
                current_job_customer = job.customer_name
                current_job_address = job.service_address
                current_job_started_at = job.started_at

        # Récupérer l'orienteur et le secteur
        orienteur_name = None
        sector_name = None
        if tech.orienteur:
            orienteur_name = tech.orienteur.name
            if tech.orienteur.sector:
                sector_name = tech.orienteur.sector.name

        tech_responses.append(
            TechnicianLiveResponse(
                id=tech.id,
                name=tech.name,
                phone=tech.phone,
                live_status=tech.live_status,
                current_latitude=tech.current_latitude,
                current_longitude=tech.current_longitude,
                current_speed=tech.current_speed,
                current_heading=tech.current_heading,
                current_accuracy=tech.current_accuracy,
                current_battery=tech.current_battery,
                last_location_update=tech.last_location_update,
                current_job_id=tech.current_job_id,
                current_job_customer=current_job_customer,
                current_job_address=current_job_address,
                current_job_started_at=current_job_started_at,
                orienteur_name=orienteur_name,
                sector_name=sector_name,
            )
        )

    # Récupérer les alertes non lues (dernières 50)
    alerts_result = await db.execute(
        select(Alert)
        .order_by(desc(Alert.created_at))
        .limit(50)
    )
    alerts = alerts_result.scalars().all()

    alert_responses = []
    for alert in alerts:
        tech_name = None
        if alert.technician_id:
            tech_result = await db.execute(
                select(Technician.name).where(Technician.id == alert.technician_id)
            )
            tech_name_row = tech_result.scalar_one_or_none()
            tech_name = tech_name_row if tech_name_row else None

        alert_responses.append(
            AlertResponse(
                id=alert.id,
                alert_type=alert.alert_type,
                severity=alert.severity,
                technician_id=alert.technician_id,
                technician_name=tech_name,
                job_id=alert.job_id,
                message=alert.message,
                details=alert.details,
                is_read=alert.is_read,
                created_at=alert.created_at,
            )
        )

    # KPIs temps réel
    total_techs = len(technicians)
    disponibles = sum(1 for t in technicians if t.live_status == TechnicianLiveStatus.DISPONIBLE)
    en_intervention = sum(1 for t in technicians if t.live_status == TechnicianLiveStatus.EN_INTERVENTION)
    pause = sum(1 for t in technicians if t.live_status == TechnicianLiveStatus.PAUSE)
    hors_service = sum(1 for t in technicians if t.live_status == TechnicianLiveStatus.HORS_SERVICE)
    deconnectes = sum(1 for t in technicians if t.live_status == TechnicianLiveStatus.DECONNECTE)

    kpis = {
        "total_technicians": total_techs,
        "disponibles": disponibles,
        "en_intervention": en_intervention,
        "pause": pause,
        "hors_service": hors_service,
        "deconnectes": deconnectes,
        "alertes_non_lues": sum(1 for a in alerts if not a.is_read),
    }

    return SupervisionMapResponse(
        technicians=tech_responses,
        alerts=alert_responses,
        kpis=kpis,
    )


@router.get("/gps-history/{technician_id}", response_model=List[GPSHistoryResponse])
async def get_technician_gps_history(
    technician_id: int,
    job_id: Optional[int] = Query(None, description="Filtrer par intervention"),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    PRIORITÉ 9 — Historique GPS
    Retourne l'historique des positions GPS d'un technicien.
    Peut être filtré par intervention (job_id).
    """
    query = select(GPSHistory).where(GPSHistory.technician_id == technician_id)

    if job_id is not None:
        query = query.where(GPSHistory.job_id == job_id)

    query = query.order_by(desc(GPSHistory.recorded_at)).limit(limit)

    result = await db.execute(query)
    records = result.scalars().all()

    return [
        GPSHistoryResponse(
            id=r.id,
            latitude=r.latitude,
            longitude=r.longitude,
            speed=r.speed,
            heading=r.heading,
            accuracy=r.accuracy,
            battery_level=r.battery_level,
            recorded_at=r.recorded_at,
            job_id=r.job_id,
        )
        for r in records
    ]


@router.get("/alerts", response_model=List[AlertResponse])
async def get_alerts(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    PRIORITÉ 10 — Alertes Dashboard
    Retourne les alertes générées automatiquement.
    """
    query = select(Alert)

    if unread_only:
        query = query.where(Alert.is_read == False)

    query = query.order_by(desc(Alert.created_at)).limit(limit)

    result = await db.execute(query)
    alerts = result.scalars().all()

    alert_responses = []
    for alert in alerts:
        tech_name = None
        if alert.technician_id:
            tech_result = await db.execute(
                select(Technician.name).where(Technician.id == alert.technician_id)
            )
            tech_name_row = tech_result.scalar_one_or_none()
            tech_name = tech_name_row if tech_name_row else None

        alert_responses.append(
            AlertResponse(
                id=alert.id,
                alert_type=alert.alert_type,
                severity=alert.severity,
                technician_id=alert.technician_id,
                technician_name=tech_name,
                job_id=alert.job_id,
                message=alert.message,
                details=alert.details,
                is_read=alert.is_read,
                created_at=alert.created_at,
            )
        )

    return alert_responses


@router.post("/alerts/{alert_id}/read", response_model=dict)
async def mark_alert_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Marquer une alerte comme lue"""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerte introuvable",
        )

    alert.is_read = True
    await db.commit()

    return {"success": True, "message": "Alerte marquée comme lue"}


@router.post("/alerts/read-all", response_model=dict)
async def mark_all_alerts_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Marquer toutes les alertes comme lues"""
    await db.execute(
        Alert.__table__.update().where(Alert.is_read == False).values(is_read=True)
    )
    await db.commit()

    return {"success": True, "message": "Toutes les alertes marquées comme lues"}
