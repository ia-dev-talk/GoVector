"""
Service de détails complets d'un technicien.
Retourne en une seule requête : technicien, matériel, stock, historique, GPS, KPI, activité.
Connecté au StockService pour des données temps réel.
"""

from datetime import datetime, date, timedelta
from typing import Optional, Dict, List, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

import logging

from backend.database.models import (
    Technician, TechnicianStatus, TechnicianLiveStatus,
    EquipmentInventory, Warehouse, Stock, StockItem, StockMovement,
    Assignment, Job, JobStatus, JobActivityLog, GPSHistory,
    Orienteur, Sector, StockMovementType,
)

_logger = logging.getLogger("uvicorn.error")


async def _get_technician_warehouse(db: AsyncSession, technician_id: int) -> Optional[Warehouse]:
    """
    Retourne l'entrepôt (warehouse) associé à un technicien.
    Cherche par patterns de nom comme fallback.
    """
    for pattern in [f"%technicien {technician_id}%", f"%véhicule%{technician_id}%"]:
        result = await db.execute(
            select(Warehouse).where(
                Warehouse.name.ilike(pattern),
                Warehouse.is_active == True,
            )
        )
        wh = result.scalar_one_or_none()
        if wh:
            return wh
    _logger.warning(f"Aucun warehouse trouvé pour le technicien #{technician_id}")
    return None


async def get_technician_full_details(db: AsyncSession, technician_id: int) -> Dict[str, Any]:
    """Retourne toutes les données d'un technicien en une requête."""
    tech = await db.get(Technician, technician_id)
    if not tech:
        raise ValueError(f"Technicien {technician_id} introuvable")

    # 1. Infos générales
    orienteur_name = None
    sector_name = None
    if tech.orienteur_id:
        orienteur = await db.get(Orienteur, tech.orienteur_id)
        if orienteur:
            orienteur_name = orienteur.name
            if orienteur.sector_id:
                sector = await db.get(Sector, orienteur.sector_id)
                if sector:
                    sector_name = sector.name

    # 2. Matériel attribué (EquipmentInventory)
    equipment_result = await db.execute(
        select(EquipmentInventory).where(
            EquipmentInventory.assigned_job_id.is_(None),
            EquipmentInventory.status.in_(["STOCK", "ASSIGNED"]),
        )
    )
    all_equipment = equipment_result.scalars().all()
    tech_equipment = []
    for eq in all_equipment:
        if eq.warehouse and str(technician_id) in eq.warehouse.lower():
            tech_equipment.append({
                "id": eq.id,
                "serial_number": eq.serial_number,
                "mac_address": eq.mac_address,
                "equipment_type": eq.equipment_type,
                "model": eq.model,
                "operator": eq.operator,
                "status": eq.status,
            })

    # 3. Stock véhicule (Warehouse lié au technicien)
    warehouse = await _get_technician_warehouse(db, technician_id)
    warehouse_id = warehouse.id if warehouse else None
    vehicle_stock = []

    # Compteurs par type d'équipement
    stock_counts = {
        "ONT": 0, "Routeur": 0, "PTO": 0,
        "Jarretière": 0, "Splitter": 0, "Autre": 0,
    }
    total_stock_value = 0.0
    last_allocation_date = None
    last_return_date = None
    last_movement_date = None
    stock_movements = []

    if warehouse_id:
        stock_result = await db.execute(
            select(Stock, StockItem)
            .join(StockItem, Stock.item_id == StockItem.id)
            .where(Stock.warehouse_id == warehouse_id)
        )
        for stock, item in stock_result.all():
            row = {
                "item_id": item.id,
                "reference": item.reference,
                "label": item.label,
                "equipment_type": item.equipment_type,
                "quantity": stock.quantity,
                "available_quantity": stock.available_quantity,
                "reserved_quantity": stock.reserved_quantity,
                "unit_price": float(item.unit_price) if item.unit_price else 0,
                "line_value": float(item.unit_price or 0) * stock.quantity,
            }
            vehicle_stock.append(row)

            # Comptage par type
            etype = item.equipment_type or "Autre"
            if etype in stock_counts:
                stock_counts[etype] += stock.quantity
            else:
                stock_counts["Autre"] += stock.quantity

            total_stock_value += row["line_value"]

        # Dernier mouvement du technicien sur ce dépôt
        last_mvmt_result = await db.execute(
            select(StockMovement)
            .where(
                StockMovement.warehouse_id == warehouse_id,
                StockMovement.technician_id == technician_id,
            )
            .order_by(StockMovement.created_at.desc())
            .limit(1)
        )
        last_mvmt = last_mvmt_result.scalar_one_or_none()
        if last_mvmt:
            last_movement_date = last_mvmt.created_at.isoformat() if last_mvmt.created_at else None

        # Dernière attribution (SORTIE) pour ce technicien
        last_alloc_result = await db.execute(
            select(StockMovement)
            .where(
                StockMovement.warehouse_id == warehouse_id,
                StockMovement.technician_id == technician_id,
                StockMovement.movement_type == StockMovementType.SORTIE,
            )
            .order_by(StockMovement.created_at.desc())
            .limit(1)
        )
        last_alloc = last_alloc_result.scalar_one_or_none()
        if last_alloc:
            last_allocation_date = last_alloc.created_at.isoformat() if last_alloc.created_at else None

        # Dernier retour pour ce technicien
        last_ret_result = await db.execute(
            select(StockMovement)
            .where(
                StockMovement.warehouse_id == warehouse_id,
                StockMovement.technician_id == technician_id,
                StockMovement.movement_type == StockMovementType.RETOUR,
            )
            .order_by(StockMovement.created_at.desc())
            .limit(1)
        )
        last_ret = last_ret_result.scalar_one_or_none()
        if last_ret:
            last_return_date = last_ret.created_at.isoformat() if last_ret.created_at else None

        # Historique des 50 derniers mouvements du technicien (tous dépôts confondus)
        mvmt_result = await db.execute(
            select(StockMovement)
            .where(StockMovement.technician_id == technician_id)
            .order_by(StockMovement.created_at.desc())
            .limit(50)
        )
        for m in mvmt_result.scalars().all():
            mitem = await db.get(StockItem, m.item_id) if m.item_id else None
            mwh = await db.get(Warehouse, m.warehouse_id) if m.warehouse_id else None
            stock_movements.append({
                "id": m.id,
                "item_id": m.item_id,
                "reference": mitem.reference if mitem else None,
                "label": mitem.label if mitem else None,
                "equipment_type": mitem.equipment_type if mitem else None,
                "warehouse_name": mwh.name if mwh else None,
                "movement_type": m.movement_type.value if m.movement_type else None,
                "quantity": m.quantity,
                "quantity_before": m.quantity_before,
                "quantity_after": m.quantity_after,
                "reference_type": m.reference_type,
                "reference_id": m.reference_id,
                "job_id": m.job_id,
                "notes": m.notes,
                "created_by": m.created_by,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            })

    # 4. Interventions (Assignment → Job)
    today = date.today()
    assignments_result = await db.execute(
        select(Assignment, Job)
        .join(Job, Assignment.job_id == Job.id)
        .where(Assignment.technician_id == technician_id)
        .order_by(Job.scheduled_date.desc())
        .limit(50)
    )
    assignments = []
    for ass, job in assignments_result.all():
        assignments.append({
            "job_id": job.id,
            "job_number": job.job_number,
            "customer_name": job.customer_name,
            "service_address": job.service_address,
            "job_type": job.job_type.value if job.job_type else None,
            "status": job.status.value if job.status else None,
            "scheduled_date": job.scheduled_date.isoformat() if job.scheduled_date else None,
            "estimated_duration": job.estimated_duration,
            "actual_duration_minutes": ass.actual_duration_minutes,
        })

    # 5. GPS (dernières positions)
    gps_result = await db.execute(
        select(GPSHistory)
        .where(GPSHistory.technician_id == technician_id)
        .order_by(GPSHistory.recorded_at.desc())
        .limit(20)
    )
    gps_history = []
    for g in gps_result.scalars().all():
        gps_history.append({
            "latitude": g.latitude,
            "longitude": g.longitude,
            "speed": g.speed,
            "heading": g.heading,
            "recorded_at": g.recorded_at.isoformat() if g.recorded_at else None,
        })
    last_position = gps_history[0] if gps_history else None

    # 6. KPI
    total_jobs = len(assignments)
    completed_jobs = sum(1 for a in assignments if a["status"] == "completed")
    failed_jobs = sum(1 for a in assignments if a["status"] == "failed")
    completion_rate = round((completed_jobs / total_jobs * 100), 1) if total_jobs > 0 else 0

    today_assignments = [a for a in assignments if a["scheduled_date"] and a["scheduled_date"].startswith(today.isoformat())]
    week_start = today - timedelta(days=today.weekday())
    week_assignments = [a for a in assignments if a["scheduled_date"] and a["scheduled_date"] >= week_start.isoformat()]

    durations = [a["actual_duration_minutes"] for a in assignments if a["actual_duration_minutes"]]
    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0

    # 7. Timeline (JobActivityLog)
    job_ids = [a["job_id"] for a in assignments]
    timeline = []
    if job_ids:
        log_result = await db.execute(
            select(JobActivityLog)
            .where(JobActivityLog.job_id.in_(job_ids))
            .order_by(JobActivityLog.created_at.desc())
            .limit(30)
        )
        for log in log_result.scalars().all():
            timeline.append({
                "id": log.id,
                "job_id": log.job_id,
                "action": log.action,
                "description": log.description,
                "old_status": log.old_status,
                "new_status": log.new_status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

    return {
        "technician": {
            "id": tech.id,
            "name": tech.name,
            "employee_id": tech.employee_id,
            "phone": tech.phone,
            "email": tech.email,
            "status": tech.status.value if tech.status else None,
            "live_status": tech.live_status.value if tech.live_status else None,
            "is_active": tech.is_active,
            "skills": tech.skills,
            "shift_start": tech.shift_start,
            "shift_end": tech.shift_end,
            "max_jobs_per_day": tech.max_jobs_per_day,
            "current_latitude": tech.current_latitude,
            "current_longitude": tech.current_longitude,
            "home_latitude": tech.home_latitude,
            "home_longitude": tech.home_longitude,
            "home_address": tech.home_address,
            "orienteur_name": orienteur_name,
            "sector_name": sector_name,
            "orienteur_id": tech.orienteur_id,
            "created_at": tech.created_at.isoformat() if tech.created_at else None,
        },
        "equipment": tech_equipment,
        "vehicle_stock": vehicle_stock,
        "assignments": assignments,
        "gps_history": gps_history,
        "last_position": last_position,
        "kpi": {
            "total_jobs": total_jobs,
            "completed_jobs": completed_jobs,
            "failed_jobs": failed_jobs,
            "completion_rate": completion_rate,
            "today_jobs": len(today_assignments),
            "week_jobs": len(week_assignments),
            "avg_duration_minutes": avg_duration,
        },
        "timeline": timeline,
    }
