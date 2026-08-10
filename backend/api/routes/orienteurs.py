"""
API routes for Orienteur operations
Gestion des orienteurs et de leurs équipes de techniciens
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from backend.database.connection import get_db
from backend.database.models import Orienteur, OrienteurSector, Technician, Job, User, UserRole, Assignment, JobStatus
from backend.api.schemas.orienteurs import (
    OrienteurCreate, OrienteurUpdate, OrienteurResponse, OrienteurListResponse,
    OrienteurSectorCreate, OrienteurSectorResponse, TechnicianBrief, MessageResponse,
)
from backend.auth.dependencies import get_current_user, require_chef_orienteur
from backend.logic import orienteurs as orienteur_logic

router = APIRouter()


def _build_technician_brief(tech: Technician, assigned: int = 0, completed: int = 0) -> TechnicianBrief:
    return TechnicianBrief(
        id=tech.id,
        name=tech.name,
        status=tech.status.value if hasattr(tech.status, 'value') else str(tech.status),
        is_active=tech.is_active,
        assigned_jobs=assigned,
        completed_jobs=completed,
    )


@router.get("/", response_model=List[OrienteurListResponse])
async def get_orienteurs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer la liste de tous les orienteurs"""
    orienteurs = await orienteur_logic.get_all_orienteurs(db, skip=skip, limit=limit)
    result = []
    for o in orienteurs:
        tech_count = await orienteur_logic.get_technician_count_for_orienteur(db, o.id)
        sector_count = await orienteur_logic.get_sector_count_for_orienteur(db, o.id)
        result.append(OrienteurListResponse(
            id=o.id,
            name=o.name,
            email=o.email,
            phone=o.phone,
            is_active=o.is_active,
            technician_count=tech_count,
            sector_count=sector_count,
        ))
    return result


@router.get("/{orienteur_id}", response_model=OrienteurResponse)
async def get_orienteur(
    orienteur_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer un orienteur avec ses techniciens et secteurs"""
    orienteur = await orienteur_logic.get_orienteur(db, orienteur_id)
    if not orienteur:
        raise HTTPException(status_code=404, detail=f"Orienteur {orienteur_id} non trouvé")

    # Construire la liste des techniciens avec leurs compteurs
    tech_briefs = []
    if orienteur.technicians:
        for tech in orienteur.technicians:
            assigned, completed = await orienteur_logic.get_job_counts_for_technician(db, tech.id)
            tech_briefs.append(_build_technician_brief(tech, assigned, completed))

    # Construire la liste des secteurs
    sectors = []
    if orienteur.sectors:
        sectors = [OrienteurSectorResponse(
            id=s.id,
            orienteur_id=s.orienteur_id,
            sector_name=s.sector_name,
            created_at=s.created_at,
        ) for s in orienteur.sectors]

    return OrienteurResponse(
        id=orienteur.id,
        name=orienteur.name,
        email=orienteur.email,
        phone=orienteur.phone,
        is_active=orienteur.is_active,
        created_at=orienteur.created_at,
        updated_at=orienteur.updated_at,
        technicians=tech_briefs,
        sectors=sectors,
    )


@router.post("/", response_model=OrienteurResponse, status_code=201)
async def create_orienteur(
    orienteur_data: OrienteurCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Créer un nouvel orienteur"""
    try:
        orienteur = await orienteur_logic.create_orienteur(
            db=db,
            name=orienteur_data.name,
            email=orienteur_data.email,
            phone=orienteur_data.phone,
        )
        return await get_orienteur(orienteur.id, db, current_user)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{orienteur_id}", response_model=OrienteurResponse)
async def update_orienteur(
    orienteur_id: int,
    orienteur_data: OrienteurUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Mettre à jour un orienteur"""
    update_data = orienteur_data.model_dump(exclude_unset=True)
    orienteur = await orienteur_logic.update_orienteur(db, orienteur_id, **update_data)
    if not orienteur:
        raise HTTPException(status_code=404, detail=f"Orienteur {orienteur_id} non trouvé")
    return await get_orienteur(orienteur_id, db, current_user)


@router.delete("/{orienteur_id}", response_model=MessageResponse)
async def delete_orienteur(
    orienteur_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Désactiver un orienteur"""
    success = await orienteur_logic.delete_orienteur(db, orienteur_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Orienteur {orienteur_id} non trouvé")
    return MessageResponse(success=True, message=f"Orienteur {orienteur_id} désactivé")


@router.get("/{orienteur_id}/technicians", response_model=List[TechnicianBrief])
async def get_orienteur_technicians(
    orienteur_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer les techniciens d'un orienteur (filtré par rôle)"""
    # Un orienteur ne peut voir que ses propres techniciens
    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id != orienteur_id:
        raise HTTPException(status_code=403, detail="Accès refusé : vous ne pouvez voir que votre propre équipe")

    orienteur = await orienteur_logic.get_orienteur(db, orienteur_id)
    if not orienteur:
        raise HTTPException(status_code=404, detail=f"Orienteur {orienteur_id} non trouvé")

    tech_briefs = []
    if orienteur.technicians:
        for tech in orienteur.technicians:
            assigned, completed = await orienteur_logic.get_job_counts_for_technician(db, tech.id)
            tech_briefs.append(_build_technician_brief(tech, assigned, completed))
    return tech_briefs


@router.post("/{orienteur_id}/technicians/{technician_id}", response_model=MessageResponse)
async def assign_technician_to_orienteur(
    orienteur_id: int,
    technician_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Assigner un technicien à un orienteur (Chef Orienteur uniquement)"""
    success = await orienteur_logic.assign_technician_to_orienteur(db, technician_id, orienteur_id)
    if not success:
        raise HTTPException(status_code=404, detail="Technicien ou orienteur non trouvé")
    return MessageResponse(success=True, message=f"Technicien {technician_id} assigné à l'orienteur {orienteur_id}")


@router.delete("/{orienteur_id}/technicians/{technician_id}", response_model=MessageResponse)
async def remove_technician_from_orienteur(
    orienteur_id: int,
    technician_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Retirer un technicien d'un orienteur (Chef Orienteur uniquement)"""
    success = await orienteur_logic.remove_technician_from_orienteur(db, technician_id)
    if not success:
        raise HTTPException(status_code=404, detail="Technicien non trouvé")
    return MessageResponse(success=True, message=f"Technicien {technician_id} retiré de l'orienteur {orienteur_id}")


@router.post("/{orienteur_id}/sectors", response_model=OrienteurSectorResponse, status_code=201)
async def add_sector(
    orienteur_id: int,
    sector_data: OrienteurSectorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Ajouter un secteur à un orienteur"""
    sector = await orienteur_logic.add_sector_to_orienteur(db, orienteur_id, sector_data.sector_name)
    if not sector:
        raise HTTPException(status_code=404, detail=f"Orienteur {orienteur_id} non trouvé")
    return OrienteurSectorResponse(
        id=sector.id,
        orienteur_id=sector.orienteur_id,
        sector_name=sector.sector_name,
        created_at=sector.created_at,
    )


@router.delete("/sectors/{sector_id}", response_model=MessageResponse)
async def remove_sector(
    sector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Supprimer un secteur d'un orienteur"""
    success = await orienteur_logic.remove_sector_from_orienteur(db, sector_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Secteur {sector_id} non trouvé")
    return MessageResponse(success=True, message="Secteur supprimé")