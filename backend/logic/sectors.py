"""Logique métier pour les Secteurs."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List, Optional
from datetime import datetime, timedelta
from types import SimpleNamespace


from backend.database.models import Sector, Orienteur, Technician, Job, Assignment, JobStatus
from backend.logic.job_sectors import hydrate_job_sector_identities


async def get_all_sectors(db: AsyncSession, active_only: bool = True) -> List[Sector]:
    """Récupérer tous les secteurs"""
    query = select(Sector)
    if active_only:
        query = query.where(Sector.is_active == True)
    result = await db.execute(query)
    return result.scalars().all()


async def get_sector(db: AsyncSession, sector_id: int) -> Optional[Sector]:
    """Récupérer un secteur par ID"""
    result = await db.execute(select(Sector).where(Sector.id == sector_id))
    return result.scalar_one_or_none()


async def create_sector(db: AsyncSession, name: str, color: str = "#1F497D", description: Optional[str] = None) -> Sector:
    """Créer un nouveau secteur"""
    sector = Sector(
        name=name,
        color=color,
        description=description,
        is_active=True,
    )
    db.add(sector)
    await db.commit()
    await db.refresh(sector)
    return sector


async def update_sector(db: AsyncSession, sector_id: int, **kwargs) -> Optional[Sector]:
    """Mettre à jour un secteur"""
    sector = await get_sector(db, sector_id)
    if not sector:
        return None

    for field, value in kwargs.items():
        if hasattr(sector, field) and value is not None:
            setattr(sector, field, value)

    sector.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(sector)
    return sector


async def delete_sector(db: AsyncSession, sector_id: int) -> bool:
    """Désactiver un secteur et retirer ses affectations technicien."""
    sector = await get_sector(db, sector_id)
    if not sector:
        return False

    sector.is_active = False
    sector.updated_at = datetime.utcnow()
    await db.execute(
        text(
            """
            DELETE FROM technician_sectors
            WHERE sector_id = :sector_id
            """
        ),
        {"sector_id": sector_id},
    )
    await db.commit()
    return True


async def get_orienteurs_by_sector(db: AsyncSession, sector_id: int) -> List[Orienteur]:
    """Récupérer les orienteurs d'un secteur"""
    result = await db.execute(
        select(Orienteur).where(Orienteur.sector_id == sector_id, Orienteur.is_active == True)
    )
    return result.scalars().all()


async def get_technicians_by_sector(db: AsyncSession, sector_id: int) -> List[Technician]:
    """Récupérer les techniciens d'un secteur via les orienteurs"""
    orienteurs = await get_orienteurs_by_sector(db, sector_id)
    orienteur_ids = [o.id for o in orienteurs]

    result = await db.execute(
        select(Technician).where(
            Technician.orienteur_id.in_(orienteur_ids),
            Technician.is_active == True,
        )
    )
    return result.scalars().all()


async def get_stats_by_sector(db: AsyncSession, sector_id: int) -> dict:
    """Récupérer les statistiques d'un secteur"""
    sector = await get_sector(db, sector_id)
    if not sector:
        return {}

    orienteurs = await get_orienteurs_by_sector(db, sector_id)
    technicians = await get_technicians_by_sector(db, sector_id)

    # The same Python resolver that hydrates Job API responses is also used for
    # KPIs.  This keeps legacy routing codes (for example CAS-SIDI-MAAROUF) and
    # structured territory links consistent without rewriting historical rows.
    job_rows = (
        await db.execute(
            select(
                Job.id,
                Job.sector_id,
                Job.sector_raw,
                Job.route_criteria,
                Job.latitude,
                Job.longitude,
                Job.scheduled_date,
                Job.status,
                Job.real_duration_minutes,
            ).where(Job.deleted_at.is_(None))
        )
    ).mappings().all()
    jobs = [SimpleNamespace(**row) for row in job_rows]
    await hydrate_job_sector_identities(db, jobs)
    sector_jobs = [
        job
        for job in jobs
        if getattr(job, "_canonical_sector_id", None) == sector_id
    ]

    today = datetime.utcnow().date()
    week_start = today - timedelta(days=today.weekday())
    jobs_today = sum(
        1
        for job in sector_jobs
        if job.scheduled_date is not None and job.scheduled_date.date() == today
    )
    jobs_week = sum(
        1
        for job in sector_jobs
        if job.scheduled_date is not None
        and week_start <= job.scheduled_date.date() <= today
    )

    completed_jobs = [
        job for job in sector_jobs if job.status == JobStatus.COMPLETED
    ]
    completed = len(completed_jobs)
    total_jobs = len(sector_jobs)

    completion_rate = (completed / total_jobs * 100) if total_jobs > 0 else 0.0

    durations = [
        job.real_duration_minutes
        for job in completed_jobs
        if job.real_duration_minutes is not None
    ]
    avg_duration = sum(durations) / len(durations) if durations else 0.0

    return {
        "sector_id": sector.id,
        "sector_name": sector.name,
        "color": sector.color,
        "tech_count": len(technicians),
        "orienteur_count": len(orienteurs),
        "jobs_today": jobs_today,
        "jobs_week": jobs_week,
        "completion_rate": round(completion_rate, 2),
        "avg_duration": round(avg_duration, 2),
    }
