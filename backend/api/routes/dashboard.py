"""
Dashboard API Routes for FieldOpt
Real-time KPI dashboard endpoints
"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.database.connection import get_db
from backend.database.models import Job, JobStatus, JobType, User, UserRole, Technician, Assignment
from backend.services.realtime.dashboard_service import DashboardService
from backend.services.realtime.kpi_calculator import KPICalculator
from backend.auth.dependencies import require_orienteur

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/summary")
async def get_dashboard_summary(
    target_date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    Get the complete dashboard summary with all KPIs.
    Returns job counts, technician status, durations, success rates, etc.
    Filtré par rôle : Chef Orienteur voit tout, Orienteur voit son secteur.
    """
    parsed_date = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            pass

    service = DashboardService(db)

    # Si orienteur, filtrer par son secteur
    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id:
        return await service.get_orienteur_dashboard(current_user.orienteur_id, parsed_date)

    return await service.get_full_dashboard(parsed_date)


@router.get("/dashboard/jobs")
async def get_dashboard_jobs(
    target_date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get job counts by status for the dashboard, filtré par rôle."""
    parsed_date = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            pass

    calc = KPICalculator(db)

    # Si orienteur, filtrer par son secteur
    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id:
        return await calc._job_counts_by_orienteur(current_user.orienteur_id, parsed_date or date.today())

    return await calc._job_counts(parsed_date or date.today())


@router.get("/dashboard/technicians")
async def get_dashboard_technicians(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get technician status counts for the dashboard, filtré par rôle."""
    calc = KPICalculator(db)

    # Si orienteur, filtrer par son équipe
    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id:
        return await calc._technician_status_counts_by_orienteur(current_user.orienteur_id)

    return await calc._technician_status_counts()


@router.get("/dashboard/performance")
async def get_technician_performance(
    target_date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get technician performance metrics."""
    parsed_date = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            pass

    calc = KPICalculator(db)
    return await calc._technician_performance(
        parsed_date or date.today(),
        orienteur_id=(
            current_user.orienteur_id
            if current_user.role == UserRole.ORIENTEUR
            else None
        ),
    )


@router.get("/dashboard/success-rate")
async def get_success_rate(
    target_date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get first-time success rate."""
    parsed_date = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            pass

    calc = KPICalculator(db)
    return {
        "success_rate": await calc._success_rate(
            parsed_date or date.today(),
            orienteur_id=(
                current_user.orienteur_id
                if current_user.role == UserRole.ORIENTEUR
                else None
            ),
        )
    }


@router.get("/dashboard/advanced")
async def get_advanced_dashboard(
    target_date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    Dashboard avancé pour l'admin.
    Agrège KPIs, performance, types d'interventions, répartition, priorité, horaires.
    Filtre automatiquement pour un orienteur sur son périmètre.
    """
    parsed_date = None
    if target_date:
        try:
            parsed_date = date.fromisoformat(target_date)
        except ValueError:
            pass

    target = parsed_date or date.today()
    calc = KPICalculator(db)

    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id:
        summary = await calc.get_orienteur_summary(current_user.orienteur_id, target)
    else:
        summary = await calc.get_dashboard_summary(target)

    return summary



# ─────────────────────────────────────────────────────────────────
# ENDPOINTS GRAPHIQUES DASHBOARD — Données dynamiques depuis la DB
# ─────────────────────────────────────────────────────────────────

@router.get(
    "/dashboard/charts/secteurs",
    summary="Graphique — Volume par secteur FTTH",
    description=(
        "Renvoie le volume de pannes (SAV DOWN) et de raccordements (commandes FTTH) "
        "par secteur géographique réel : MOHAMMEDIA, AIN SEBAA, BERNOUSSI, ANASSI, "
        "HAY MOHAMMADI, BNI YAKHLEF, HARROUDA. "
        "Données lues dynamiquement depuis la base après import Excel. "
        "Structure compatible Chart.js / Recharts."
    ),
)
async def get_charts_secteurs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    Données analytiques par secteur FTTH pour les composants graphiques.
    Lit les données depuis la base de données (jobs importés).
    Fallback sur les données statiques si la base est vide.
    """
    # ── Lecture dynamique depuis la base ──
    secteurs = [
        "MOHAMMEDIA",
        "AIN SEBAA",
        "BERNOUSSI",
        "ANASSI",
        "HAY MOHAMMADI",
        "BNI YAKHLEF",
        "HARROUDA",
        "AIN HARROUDA",
    ]

    # Compter les jobs par secteur (via le champ service_address ou operator)
    pannes_par_secteur = {s: 0 for s in secteurs}
    raccordements_par_secteur = {s: 0 for s in secteurs}
    production_par_secteur = {s: 0 for s in secteurs}

    try:
        # Récupérer tous les jobs pour analyse
        query = select(Job)
        if current_user.role == UserRole.ORIENTEUR:
            query = query.where(Job.orienteur_id == current_user.orienteur_id)
        result = await db.execute(query)
        jobs = result.scalars().all()

        for job in jobs:
            addr = (job.service_address or "").upper()
            op = (job.operator or "").upper()

            # Détecter le secteur depuis l'adresse
            secteur_trouve = None
            for s in secteurs:
                if s in addr:
                    secteur_trouve = s
                    break

            if not secteur_trouve:
                continue

            # Classer par type de job
            if job.job_type == JobType.REPAIR or job.job_type == JobType.SAV:
                pannes_par_secteur[secteur_trouve] = pannes_par_secteur.get(secteur_trouve, 0) + 1
            elif job.job_type == JobType.INSTALLATION:
                raccordements_par_secteur[secteur_trouve] = raccordements_par_secteur.get(secteur_trouve, 0) + 1
                if job.status == JobStatus.COMPLETED:
                    production_par_secteur[secteur_trouve] = production_par_secteur.get(secteur_trouve, 0) + 1

    except Exception as e:
        logger.exception("Erreur lecture DB pour charts/secteurs")
        raise

    # ── Fallback statique si DB vide ──
    return {
        "labels": secteurs,
        "datasets": [
            {
                "label": "Pannes SAV DOWN",
                "data": [pannes_par_secteur.get(s, 0) for s in secteurs],
                "backgroundColor": "#C00000",
                "borderColor": "#8B0000",
                "borderWidth": 1,
            },
            {
                "label": "Raccordements FTTH",
                "data": [raccordements_par_secteur.get(s, 0) for s in secteurs],
                "backgroundColor": "#1F497D",
                "borderColor": "#163760",
                "borderWidth": 1,
            },
            {
                "label": "Production validée",
                "data": [production_par_secteur.get(s, 0) for s in secteurs],
                "backgroundColor": "#00B050",
                "borderColor": "#007A38",
                "borderWidth": 1,
            },
        ],
        "meta": {
            "total_pannes": sum(pannes_par_secteur.values()),
            "total_raccordements": sum(raccordements_par_secteur.values()),
            "total_production": sum(production_par_secteur.values()),
            "secteurs_actifs": [
                s for s in secteurs
                if pannes_par_secteur.get(s, 0) > 0 or raccordements_par_secteur.get(s, 0) > 0
            ],
            "source": "db",
            "available": bool(
                sum(pannes_par_secteur.values())
                or sum(raccordements_par_secteur.values())
            ),
        },
    }


@router.get(
    "/dashboard/charts/status",
    summary="Graphique — Proportions des états de commandes",
    description=(
        "Renvoie les proportions exactes des états de commandes FTTH : "
        "VA (Validé), IR (Irrécupérable/Refusé), Interrompu. "
        "Données lues dynamiquement depuis la base après import Excel. "
        "Structure compatible Chart.js Pie / Doughnut et Recharts PieChart."
    ),
)
async def get_charts_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    Données analytiques des états de commandes FTTH pour graphique camembert.
    Lit les données depuis la base de données (jobs importés).
    Fallback sur les données statiques si la base est vide.
    """
    etats_commandes = {
        "VA": 0,
        "IR": 0,
        "Interrompu": 0,
    }

    try:
        query = select(Job)
        if current_user.role == UserRole.ORIENTEUR:
            query = query.where(Job.orienteur_id == current_user.orienteur_id)
        result = await db.execute(query)
        jobs = result.scalars().all()

        for job in jobs:
            op = (job.operator or "").upper()
            status = job.status.value if job.status else ""
            jtype = job.job_type.value if job.job_type else ""

            # Détection VA (Validé) = installation complétée
            if jtype in ("INSTALLATION",) and status == JobStatus.COMPLETED.value:
                etats_commandes["VA"] += 1
            # Détection IR (Irrécupérable) = installation annulée
            elif jtype in ("INSTALLATION",) and status in (JobStatus.CANCELLED.value, JobStatus.ON_HOLD.value):
                etats_commandes["IR"] += 1
            # Détection Interrompu = SAV/REPAIR en cours
            elif jtype in ("REPAIR", "SAV", "DEPANNAGE"):
                etats_commandes["Interrompu"] += 1

    except Exception as e:
        logger.exception("Erreur lecture DB pour charts/status")
        raise

    # ── Fallback statique si DB vide ──
    total = sum(etats_commandes.values())

    return {
        "labels": list(etats_commandes.keys()),
        "datasets": [
            {
                "label": "États des commandes FTTH",
                "data": list(etats_commandes.values()),
                "backgroundColor": [
                    "#00B050",   # VA — vert
                    "#FFC000",   # IR — jaune/orange
                    "#C00000",   # Interrompu — rouge foncé
                ],
                "borderColor": [
                    "#007A38",
                    "#CC9900",
                    "#8B0000",
                ],
                "borderWidth": 2,
            }
        ],
        "meta": {
            "total": total,
            "proportions": {
                etat: round((count / total) * 100, 1) if total > 0 else 0
                for etat, count in etats_commandes.items()
            },
            "details": {
                "VA": {
                    "label": "Validé — Raccordement confirmé",
                    "count": etats_commandes["VA"],
                    "color": "#00B050",
                },
                "IR": {
                    "label": "Irrécupérable — Commande annulée",
                    "count": etats_commandes["IR"],
                    "color": "#FFC000",
                },
                "Interrompu": {
                    "label": "Interrompu — Ticket SAV DOWN actif",
                    "count": etats_commandes["Interrompu"],
                    "color": "#C00000",
                },
            },
            "source": "db",
            "available": total > 0,
        },
    }
