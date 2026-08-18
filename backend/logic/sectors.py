"""Logique métier pour les Secteurs."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from typing import List, Optional
from datetime import datetime, timedelta


from backend.database.models import Sector, Orienteur, Technician, Job, Assignment, JobStatus


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

    # Jobs aujourd'hui
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start.replace(hour=23, minute=59, second=59)

    jobs_today_query = select(func.count(Job.id)).where(
        Job.scheduled_date >= today_start,
        Job.scheduled_date <= today_end,
        Job.orienteur_id.in_([o.id for o in orienteurs]),
    )
    jobs_today_result = await db.execute(jobs_today_query)
    jobs_today = jobs_today_result.scalar() or 0

    # Jobs cette semaine
    week_start = today_start - timedelta(days=today_start.weekday())
    jobs_week_query = select(func.count(Job.id)).where(
        Job.scheduled_date >= week_start,
        Job.scheduled_date <= today_end,
        Job.orienteur_id.in_([o.id for o in orienteurs]),
    )
    jobs_week_result = await db.execute(jobs_week_query)
    jobs_week = jobs_week_result.scalar() or 0

    # Taux de complétion
    completed_query = select(func.count(Job.id)).where(
        Job.status == JobStatus.COMPLETED,
        Job.orienteur_id.in_([o.id for o in orienteurs]),
    )
    completed_result = await db.execute(completed_query)
    completed = completed_result.scalar() or 0

    total_jobs_query = select(func.count(Job.id)).where(
        Job.orienteur_id.in_([o.id for o in orienteurs]),
    )
    total_jobs_result = await db.execute(total_jobs_query)
    total_jobs = total_jobs_result.scalar() or 0

    completion_rate = (completed / total_jobs * 100) if total_jobs > 0 else 0.0

    # Durée moyenne
    avg_duration_query = select(func.avg(Job.real_duration_minutes)).where(
        Job.status == JobStatus.COMPLETED,
        Job.orienteur_id.in_([o.id for o in orienteurs]),
        Job.real_duration_minutes.is_not(None),
    )
    avg_duration_result = await db.execute(avg_duration_query)
    avg_duration = avg_duration_result.scalar() or 0.0

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
