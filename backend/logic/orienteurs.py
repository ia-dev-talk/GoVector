"""
Logique métier pour les Orienteurs (gestionnaires d'équipes de techniciens)
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime

from backend.database.models import Orienteur, OrienteurSector, Technician, Job, Assignment, JobStatus


async def create_orienteur(
    db: AsyncSession,
    name: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
) -> Orienteur:
    """Créer un nouvel orienteur"""
    orienteur = Orienteur(
        name=name,
        email=email,
        phone=phone,
        is_active=True,
    )
    db.add(orienteur)
    await db.commit()
    await db.refresh(orienteur)
    return orienteur


async def get_orienteur(db: AsyncSession, orienteur_id: int) -> Optional[Orienteur]:
    """Récupérer un orienteur par son ID"""
    result = await db.execute(
        select(Orienteur).where(Orienteur.id == orienteur_id)
    )
    return result.scalar_one_or_none()


async def get_all_orienteurs(
    db: AsyncSession,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 100,
) -> List[Orienteur]:
    """Récupérer tous les orienteurs"""
    query = select(Orienteur)
    if active_only:
        query = query.where(Orienteur.is_active == True)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


async def update_orienteur(
    db: AsyncSession,
    orienteur_id: int,
    **kwargs,
) -> Optional[Orienteur]:
    """Mettre à jour un orienteur"""
    orienteur = await get_orienteur(db, orienteur_id)
    if not orienteur:
        return None

    for field, value in kwargs.items():
        if hasattr(orienteur, field) and value is not None:
            setattr(orienteur, field, value)

    orienteur.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(orienteur)
    return orienteur


async def delete_orienteur(db: AsyncSession, orienteur_id: int) -> bool:
    """Désactiver un orienteur (soft delete)"""
    orienteur = await get_orienteur(db, orienteur_id)
    if not orienteur:
        return False
    orienteur.is_active = False
    orienteur.updated_at = datetime.utcnow()
    await db.commit()
    return True


async def add_sector_to_orienteur(
    db: AsyncSession,
    orienteur_id: int,
    sector_name: str,
) -> Optional[OrienteurSector]:
    """Ajouter un secteur à un orienteur"""
    orienteur = await get_orienteur(db, orienteur_id)
    if not orienteur:
        return None

    sector = OrienteurSector(
        orienteur_id=orienteur_id,
        sector_name=sector_name,
    )
    db.add(sector)
    await db.commit()
    await db.refresh(sector)
    return sector


async def remove_sector_from_orienteur(
    db: AsyncSession,
    sector_id: int,
) -> bool:
    """Supprimer un secteur d'un orienteur"""
    result = await db.execute(
        select(OrienteurSector).where(OrienteurSector.id == sector_id)
    )
    sector = result.scalar_one_or_none()
    if not sector:
        return False
    await db.delete(sector)
    await db.commit()
    return True


async def get_technician_count_for_orienteur(
    db: AsyncSession,
    orienteur_id: int,
) -> int:
    """Compter le nombre de techniciens associés à un orienteur"""
    result = await db.execute(
        select(func.count(Technician.id)).where(
            Technician.orienteur_id == orienteur_id,
            Technician.is_active == True,
        )
    )
    return result.scalar() or 0


async def get_sector_count_for_orienteur(
    db: AsyncSession,
    orienteur_id: int,
) -> int:
    """Compter le nombre de secteurs associés à un orienteur"""
    result = await db.execute(
        select(func.count(OrienteurSector.id)).where(
            OrienteurSector.orienteur_id == orienteur_id,
        )
    )
    return result.scalar() or 0


async def assign_technician_to_orienteur(
    db: AsyncSession,
    technician_id: int,
    orienteur_id: int,
) -> bool:
    """Assigner un technicien à un orienteur"""
    result = await db.execute(
        select(Technician).where(Technician.id == technician_id)
    )
    tech = result.scalar_one_or_none()
    if not tech:
        return False

    # Vérifier que l'orienteur existe
    orienteur = await get_orienteur(db, orienteur_id)
    if not orienteur:
        return False

    tech.orienteur_id = orienteur_id
    tech.updated_at = datetime.utcnow()
    await db.commit()
    return True


async def remove_technician_from_orienteur(
    db: AsyncSession,
    technician_id: int,
) -> bool:
    """Retirer un technicien de son orienteur"""
    result = await db.execute(
        select(Technician).where(Technician.id == technician_id)
    )
    tech = result.scalar_one_or_none()
    if not tech:
        return False

    tech.orienteur_id = None
    tech.updated_at = datetime.utcnow()
    await db.commit()
    return True


async def get_job_counts_for_technician(
    db: AsyncSession,
    technician_id: int,
) -> tuple:
    """Récupérer le nombre de jobs assignés et complétés pour un technicien"""
    assigned = await db.execute(
        select(func.count(Assignment.id)).where(
            Assignment.technician_id == technician_id,
        )
    )
    total_assigned = assigned.scalar() or 0

    completed = await db.execute(
        select(func.count(Assignment.id))
        .join(Job, Assignment.job_id == Job.id)
        .where(
            Assignment.technician_id == technician_id,
            Job.status == JobStatus.COMPLETED,
        )
    )
    total_completed = completed.scalar() or 0

    return total_assigned, total_completed