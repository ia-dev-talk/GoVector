"""
Routes API Rapports — FieldOpt
Inclut l'export Excel multi-onglets FTTH.
"""
import logging
from typing import Optional, List
from datetime import datetime, date, time, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.database.connection import get_db
from backend.database.models import (
    Job,
    JobStatus,
    JobType,
    Technician,
    Incident,
    EquipmentInventory,
    ImportHistory,
    User,
)
from backend.auth.dependencies import get_current_user, require_chef_orienteur
from backend.services.excel.advanced_export import generate_advanced_excel_report
from backend.logic import technicians as tech_logic
from backend.logic import orienteurs as orienteur_logic
from backend.logic import sectors as sector_logic
from backend.services.export_service import FieldOptExportService
from backend.logic.job_planning import canonical_estimated_duration_minutes
from backend.services.realtime.kpi_calculator import KPICalculator
from backend.api.schemas.sectors import SectorStats, SectorStatsGlobal
from backend.api.schemas.orienteurs import OrienteurListResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Reports"])


def _advanced_export_job_filters(
    *,
    start_date: Optional[date],
    end_date: Optional[date],
    sector_id: Optional[int],
    orienteur_id: Optional[int],
    technician_id: Optional[int],
    job_type: Optional[str],
    status: Optional[str],
) -> dict:
    filters = {
        "start_date": datetime.combine(start_date, time.min) if start_date else None,
        "end_date": datetime.combine(end_date, time.max) if end_date else None,
        "sector_id": sector_id,
        "orienteur_id": orienteur_id,
        "technician_id": technician_id,
        "job_type": job_type,
        "status": status,
    }
    return {key: value for key, value in filters.items() if value is not None}


def _filtered_job_dashboard_stats(base_stats: dict, jobs: list[Job]) -> dict:
    """Reconcile job KPIs in the advanced dashboard with its filtered rows."""

    records = list(jobs)
    total = len(records)
    today = datetime.utcnow().date()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    completed = [job for job in records if job.status == JobStatus.COMPLETED]
    failed = [job for job in records if job.status == JobStatus.FAILED]
    durations = [
        job.real_duration_minutes
        for job in completed
        if job.real_duration_minutes is not None
    ]

    def scheduled_between(job, start, end):
        return (
            job.scheduled_date is not None
            and start <= job.scheduled_date.date() <= end
        )

    return {
        **dict(base_stats or {}),
        "totalJobs": total,
        "jobsToday": sum(
            1 for job in records if scheduled_between(job, today, today)
        ),
        "jobsWeek": sum(
            1 for job in records if scheduled_between(job, week_start, today)
        ),
        "jobsMonth": sum(
            1 for job in records if scheduled_between(job, month_start, today)
        ),
        "completedJobs": len(completed),
        "pendingJobs": sum(1 for job in records if job.status == JobStatus.PENDING),
        "inProgressJobs": sum(
            1
            for job in records
            if job.status
            in {
                JobStatus.EN_ROUTE,
                JobStatus.ON_SITE,
                JobStatus.IN_PROGRESS,
                JobStatus.WORK_IN_PROGRESS,
            }
        ),
        "cancelledJobs": sum(
            1 for job in records if job.status == JobStatus.CANCELLED
        ),
        "successRate": round(len(completed) / total * 100, 2) if total else 0,
        "failureRate": round(len(failed) / total * 100, 2) if total else 0,
        "completionRate": round(len(completed) / total * 100, 2) if total else 0,
        "avgDuration": round(sum(durations) / len(durations), 2) if durations else 0,
    }


@router.get(
    "/reports/export/advanced",
    summary="Export Excel avancé personnalisable",
    description=(
        "Génère et télécharge un fichier Excel avec les feuilles sélectionnées et les filtres appliqués.\n"
        "Les options disponibles sont:\n"
        "- sheets: Liste des feuilles à inclure (e.g., [\"interventions\", \"techniciens\"]). Les options sont: interventions, clients, techniciens, orienteurs, secteurs, historique, statistiques, dashboard_complet, performance_equipes, performance_techniciens, kpi, journal.\n"
        "- start_date: Date de début pour le filtrage (YYYY-MM-DD).\n"
        "- end_date: Date de fin pour le filtrage (YYYY-MM-DD).\n"
        "- sector_id: ID du secteur à filtrer.\n"
        "- orienteur_id: ID de l'orienteur à filtrer.\n"
        "- technician_id: ID du technicien à filtrer.\n"
        "- job_type: Type d'intervention à filtrer.\n"
        "- status: Statut d'intervention à filtrer.\n"
        "Authentification requise (ADMIN ou CHEF_ORIENTEUR)."
    ),
    response_class=Response,
)
async def export_advanced_excel(
    sheets: List[str] = Query(["dashboard_complet"], description="Liste des feuilles à inclure"),
    start_date: Optional[date] = Query(None, description="Date de début (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Date de fin (YYYY-MM-DD)"),
    sector_id: Optional[int] = Query(None, description="ID du secteur"),
    orienteur_id: Optional[int] = Query(None, description="ID de l'orienteur"),
    technician_id: Optional[int] = Query(None, description="ID du technicien"),
    job_type: Optional[JobType] = Query(None, description="Type d'intervention"),
    status: Optional[JobStatus] = Query(None, description="Statut d'intervention"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur), # Seuls Admin et Chef Orienteur
):
    """Génère un rapport Excel avancé en fonction des options de l'utilisateur."""
    # Préparer les options de filtrage
    filter_options = {
        "start_date": start_date,
        "end_date": end_date,
        "sector_id": sector_id,
        "orienteur_id": orienteur_id,
        "technician_id": technician_id,
        "job_type": job_type,
        "status": status,
    }

    # Récupérer les interventions via le même filtre/hydrateur canonique que
    # le Centre d'export (sans la limite historique de 100 lignes).
    all_jobs = await FieldOptExportService.get_filtered_jobs(
        db,
        _advanced_export_job_filters(**filter_options),
    )
    all_technicians = await tech_logic.get_all_technicians(db)
    all_orienteurs_db = await orienteur_logic.get_all_orienteurs(db)
    all_sectors_db = await sector_logic.get_all_sectors(db)
    kpi_calc = KPICalculator(db)
    dashboard_stats = _filtered_job_dashboard_stats(
        await kpi_calc.get_dashboard_summary(),
        all_jobs,
    )

    # Convertir les objets SQLAlchemy en dictionnaires pour l'export Excel
    jobs_data = []
    for job in all_jobs:
        job_dict = dict(job.__dict__)
        job_dict["job_type"] = job.job_type.value if job.job_type else None
        job_dict["status"] = job.status.value if job.status else None
        job_dict["priority"] = job.priority.value if job.priority else None
        job_dict["sector_id"] = getattr(job, "_canonical_sector_id", job.sector_id)
        job_dict["sector_name"] = getattr(job, "_canonical_sector_name", None)
        job_dict["sector_raw"] = getattr(job, "_canonical_sector_raw", job.sector_raw)
        job_dict["estimated_duration"] = canonical_estimated_duration_minutes(
            job_type=job.job_type,
            estimated_duration=job.estimated_duration,
            time_slot_start=job.time_slot_start,
            time_slot_end=job.time_slot_end,
        )
        # Add technician name if available
        if job.assignment and job.assignment.technician:
            job_dict["assigned_technician_name"] = job.assignment.technician.name
        else:
            job_dict["assigned_technician_name"] = "Non assigné"
        jobs_data.append(job_dict)

    technicians_data = []
    for tech in all_technicians:
        tech_dict = tech.__dict__
        tech_dict["status"] = tech.status.value if tech.status else None
        orienteur = await orienteur_logic.get_orienteur(db, tech.orienteur_id) if tech.orienteur_id else None
        tech_dict["orienteur_name"] = orienteur.name if orienteur else "N/A"
        assigned_jobs, completed_jobs = await orienteur_logic.get_job_counts_for_technician(db, tech.id)
        tech_dict["assigned_jobs"] = assigned_jobs
        tech_dict["completed_jobs"] = completed_jobs
        technicians_data.append(tech_dict)

    orienteurs_data = []
    for o in all_orienteurs_db:
        orienteur_dict = o.__dict__
        sector = await sector_logic.get_sector(db, o.sector_id) if o.sector_id else None
        orienteur_dict["sector_name"] = sector.name if sector else "N/A"
        orienteur_dict["technician_count"] = await orienteur_logic.get_technician_count_for_orienteur(db, o.id)
        orienteurs_data.append(orienteur_dict)

    sectors_data = []
    for s in all_sectors_db:
        sector_dict = s.__dict__
        sector_stats = await sector_logic.get_stats_by_sector(db, s.id)
        sector_dict.update(sector_stats)
        sectors_data.append(sector_dict)

    try:
        excel_bytes = generate_advanced_excel_report(
            jobs=jobs_data,
            technicians=technicians_data,
            orienteurs=orienteurs_data,
            sectors=sectors_data,
            stats=dashboard_stats,
            options={
                "sheets": sheets,
                **filter_options,
            }
        )
        filename = f"rapport_govector_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(excel_bytes)),
            },
        )
    except Exception as exc:
        logger.exception("Erreur lors de la génération du rapport Excel avancé : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du rapport Excel.")

# Suppression des anciennes routes de rapport pour les remplacer par la nouvelle route unifiée
# (les autres routes comme /reports/jobs, /reports/technicians, etc. seront supprimées après confirmation)


# La fonction _range_start_end n'est plus nécessaire si l'on utilise les dates dans les filtres de la nouvelle fonction


# Les routes /reports/jobs, /reports/technicians, /reports/incidents, /reports/imports, /reports/kpi deviennent obsolètes
# avec le nouvel export avancé. Pour éviter la rupture, nous les désactivons ou les supprimons.
# Pour le moment, nous les commentons pour conserver l'historique.

# @router.get("/reports/jobs")
# async def report_jobs(...):
#    pass # Logic removed

# @router.get("/reports/technicians")
# async def report_technicians(...):
#    pass # Logic removed

# @router.get("/reports/incidents")
# async def report_incidents(...):
#    pass # Logic removed

# @router.get("/reports/imports")
# async def report_imports(...):
#    pass # Logic removed

# @router.get("/reports/kpi")
# async def report_kpi(...):
#    pass # Logic removed

# Supprimer _range_start_all également

# L'ancien generate_ftth_report_excel() sera aussi supprimé du dossier excel/ pour éviter les doublons.
