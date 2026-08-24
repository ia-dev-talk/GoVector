"""
Service de détails complets d'un technicien.
Retourne en une seule requête : technicien, matériel, stock, historique, GPS, KPI, activité.
Connecté au StockService pour des données temps réel.
"""

from datetime import date, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import logging

from backend.database.models import (
    Technician,
    EquipmentInventory,
    Warehouse,
    Stock,
    StockItem,
    StockMovement,
    Assignment,
    Job,
    JobVisit,
    JobActivityLog,
    GPSHistory,
    Orienteur,
    Sector,
    StockMovementType,
)
from backend.logic.job_planning import job_estimated_duration_minutes

_logger = logging.getLogger("uvicorn.error")


async def _get_technician_warehouse(
    db: AsyncSession,
    technician_id: int,
) -> Optional[Warehouse]:
    """Retourne le dépôt de garde associé à un technicien."""
    # Public V2 creates deterministic TECH-{id} custody warehouses. Keep the
    # historical name patterns as fallbacks for older installations.
    by_code = await db.scalar(
        select(Warehouse).where(
            Warehouse.code == f"TECH-{technician_id}",
            Warehouse.is_active.is_(True),
        )
    )
    if by_code:
        return by_code

    for pattern in [
        f"%technicien {technician_id}%",
        f"%véhicule%{technician_id}%",
    ]:
        result = await db.execute(
            select(Warehouse).where(
                Warehouse.name.ilike(pattern),
                Warehouse.is_active.is_(True),
            )
        )
        warehouses = result.scalars().all()
        if warehouses:
            return warehouses[0]

    _logger.info(
        "Aucun dépôt de garde trouvé pour le technicien #%s",
        technician_id,
    )
    return None


async def get_technician_full_details(
    db: AsyncSession,
    technician_id: int,
) -> Dict[str, Any]:
    """Retourne le contexte opérationnel complet d'un technicien."""
    tech = await db.get(Technician, technician_id)
    if not tech:
        raise ValueError(f"Technicien {technician_id} introuvable")

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

    equipment_result = await db.execute(
        select(EquipmentInventory).where(
            EquipmentInventory.assigned_job_id.is_(None),
            EquipmentInventory.status.in_(["STOCK", "ASSIGNED"]),
        )
    )
    all_equipment = equipment_result.scalars().all()
    tech_equipment = []
    for equipment in all_equipment:
        if equipment.warehouse and str(technician_id) in equipment.warehouse.lower():
            tech_equipment.append(
                {
                    "id": equipment.id,
                    "serial_number": equipment.serial_number,
                    "mac_address": equipment.mac_address,
                    "equipment_type": equipment.equipment_type,
                    "model": equipment.model,
                    "operator": equipment.operator,
                    "status": equipment.status,
                }
            )

    warehouse = await _get_technician_warehouse(db, technician_id)
    warehouse_id = warehouse.id if warehouse else None
    vehicle_stock = []
    stock_counts = {
        "ONT": 0,
        "Routeur": 0,
        "PTO": 0,
        "Jarretière": 0,
        "Splitter": 0,
        "Autre": 0,
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
            .order_by(StockItem.label.asc(), Stock.id.asc())
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
            equipment_type = item.equipment_type or "Autre"
            if equipment_type in stock_counts:
                stock_counts[equipment_type] += stock.quantity
            else:
                stock_counts["Autre"] += stock.quantity
            total_stock_value += row["line_value"]

        movements_result = await db.execute(
            select(StockMovement)
            .where(StockMovement.technician_id == technician_id)
            .order_by(StockMovement.created_at.desc())
            .limit(50)
        )
        movements = movements_result.scalars().all()
        for movement in movements:
            item = await db.get(StockItem, movement.item_id) if movement.item_id else None
            movement_warehouse = (
                await db.get(Warehouse, movement.warehouse_id)
                if movement.warehouse_id
                else None
            )
            stock_movements.append(
                {
                    "id": movement.id,
                    "item_id": movement.item_id,
                    "reference": item.reference if item else None,
                    "label": item.label if item else None,
                    "equipment_type": item.equipment_type if item else None,
                    "warehouse_name": movement_warehouse.name if movement_warehouse else None,
                    "movement_type": (
                        movement.movement_type.value if movement.movement_type else None
                    ),
                    "quantity": movement.quantity,
                    "quantity_before": movement.quantity_before,
                    "quantity_after": movement.quantity_after,
                    "reference_type": movement.reference_type,
                    "reference_id": movement.reference_id,
                    "job_id": movement.job_id,
                    "notes": movement.notes,
                    "created_by": movement.created_by,
                    "created_at": (
                        movement.created_at.isoformat() if movement.created_at else None
                    ),
                }
            )

        latest = movements[0] if movements else None
        if latest and latest.created_at:
            last_movement_date = latest.created_at.isoformat()

        allocation = next(
            (
                movement
                for movement in movements
                if movement.movement_type
                in {StockMovementType.SORTIE, StockMovementType.TRANSFERT}
                and (movement.quantity or 0) > 0
            ),
            None,
        )
        if allocation and allocation.created_at:
            last_allocation_date = allocation.created_at.isoformat()

        returned = next(
            (
                movement
                for movement in movements
                if movement.movement_type == StockMovementType.RETOUR
            ),
            None,
        )
        if returned and returned.created_at:
            last_return_date = returned.created_at.isoformat()

    stock_summary = {
        "warehouse_id": warehouse_id,
        "warehouse_name": warehouse.name if warehouse else None,
        "warehouse_code": warehouse.code if warehouse else None,
        "line_count": len(vehicle_stock),
        "total_units": sum(int(row["quantity"] or 0) for row in vehicle_stock),
        "available_units": sum(
            int(row["available_quantity"] or 0) for row in vehicle_stock
        ),
        "reserved_units": sum(
            int(row["reserved_quantity"] or 0) for row in vehicle_stock
        ),
        "total_value": round(total_stock_value, 2),
        "counts": stock_counts,
        "last_allocation_date": last_allocation_date,
        "last_return_date": last_return_date,
        "last_movement_date": last_movement_date,
        "movements": stock_movements,
    }

    today = date.today()
    assignments_result = await db.execute(
        select(Assignment, Job, JobVisit)
        .join(Job, Assignment.job_id == Job.id)
        .outerjoin(JobVisit, Assignment.visit_id == JobVisit.id)
        .where(Assignment.technician_id == technician_id)
        .order_by(Assignment.assigned_at.desc(), Assignment.id.desc())
        .limit(50)
    )
    assignments = []
    for assignment, job, visit in assignments_result.all():
        assignments.append(
            {
                "job_id": job.id,
                "visit_id": visit.id if visit else None,
                "attempt_number": visit.attempt_number if visit else None,
                "job_number": job.job_number,
                "customer_name": job.customer_name,
                "service_address": job.service_address,
                "job_type": job.job_type.value if job.job_type else None,
                "status": (
                    visit.outcome or visit.status
                    if visit
                    else (job.status.value if job.status else None)
                ),
                "scheduled_date": (
                    (visit.scheduled_at or job.scheduled_date).isoformat()
                    if (visit and visit.scheduled_at) or job.scheduled_date
                    else None
                ),
                "estimated_duration": job_estimated_duration_minutes(job),
                "actual_duration_minutes": assignment.actual_duration_minutes,
            }
        )

    gps_result = await db.execute(
        select(GPSHistory)
        .where(GPSHistory.technician_id == technician_id)
        .order_by(GPSHistory.recorded_at.desc())
        .limit(20)
    )
    gps_history = []
    for point in gps_result.scalars().all():
        gps_history.append(
            {
                "latitude": point.latitude,
                "longitude": point.longitude,
                "speed": point.speed,
                "heading": point.heading,
                "recorded_at": (
                    point.recorded_at.isoformat() if point.recorded_at else None
                ),
            }
        )
    last_position = gps_history[0] if gps_history else None

    total_jobs = len(assignments)
    completed_jobs = sum(1 for item in assignments if item["status"] == "completed")
    failed_jobs = sum(1 for item in assignments if item["status"] == "failed")
    completion_rate = (
        round((completed_jobs / total_jobs * 100), 1) if total_jobs > 0 else 0
    )
    today_assignments = [
        item
        for item in assignments
        if item["scheduled_date"]
        and item["scheduled_date"].startswith(today.isoformat())
    ]
    week_start = today - timedelta(days=today.weekday())
    week_assignments = [
        item
        for item in assignments
        if item["scheduled_date"] and item["scheduled_date"] >= week_start.isoformat()
    ]
    durations = [
        item["actual_duration_minutes"]
        for item in assignments
        if item["actual_duration_minutes"]
    ]
    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0

    job_ids = [item["job_id"] for item in assignments]
    timeline = []
    if job_ids:
        log_result = await db.execute(
            select(JobActivityLog)
            .where(JobActivityLog.job_id.in_(job_ids))
            .order_by(JobActivityLog.created_at.desc())
            .limit(30)
        )
        for log in log_result.scalars().all():
            timeline.append(
                {
                    "id": log.id,
                    "job_id": log.job_id,
                    "action": log.action,
                    "description": log.description,
                    "old_status": log.old_status,
                    "new_status": log.new_status,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
            )

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
            "team_id": getattr(tech, "team_id", None),
            "grade": getattr(tech, "grade", None),
            "created_at": tech.created_at.isoformat() if tech.created_at else None,
        },
        "equipment": tech_equipment,
        "vehicle_stock": vehicle_stock,
        "stock_summary": stock_summary,
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
