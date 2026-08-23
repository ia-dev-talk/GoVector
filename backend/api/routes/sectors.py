"""
API routes for Sector operations
Gestion des secteurs géographiques d'intervention.
"""

from collections import OrderedDict
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.sectors import (
    Sector,
    SectorCreate,
    SectorStats,
    SectorStatsGlobal,
    SectorUpdate,
)
from backend.auth.dependencies import (
    get_current_user,
    require_chef_orienteur,
)
from backend.database.connection import get_db
from backend.database.models import User, UserRole
from backend.logic.sectors import (
    create_sector,
    delete_sector,
    get_all_sectors,
    get_sector,
    get_stats_by_sector,
    update_sector,
)


router = APIRouter()


class TechnicianSectorItem(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    is_active: bool = True
    is_primary: bool = False


class TechnicianSectorAssignment(BaseModel):
    technician_id: int
    primary_sector_id: Optional[int] = None
    primary_sector_name: Optional[str] = None
    sector_ids: List[int] = Field(default_factory=list)
    sector_names: List[str] = Field(default_factory=list)
    sectors: List[TechnicianSectorItem] = Field(default_factory=list)


class TechnicianSectorAssignmentUpdate(BaseModel):
    primary_sector_id: Optional[int] = Field(default=None, gt=0)
    sector_ids: List[int] = Field(default_factory=list)


def _validate_assignment_sector_rows(requested_ids, rows) -> None:
    """Reject missing or inactive sectors before mutating technician assignments."""
    states = {
        int(row["id"]): bool(row["is_active"])
        for row in rows
    }
    missing_ids = [
        sector_id
        for sector_id in requested_ids
        if sector_id not in states
    ]
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=(
                "Secteur introuvable : "
                + ", ".join(str(value) for value in missing_ids)
            ),
        )

    inactive_ids = [
        sector_id
        for sector_id in requested_ids
        if not states[sector_id]
    ]
    if inactive_ids:
        raise HTTPException(
            status_code=409,
            detail=(
                "Secteur inactif non assignable : "
                + ", ".join(str(value) for value in inactive_ids)
            ),
        )


def _assignment_orienteur_scope(current_user: User) -> Optional[int]:
    """Return the server-side team scope allowed for assignment reads."""
    if current_user.role in {
        UserRole.ADMIN,
        UserRole.CHEF_ORIENTEUR,
    }:
        return None

    if current_user.role == UserRole.ORIENTEUR:
        if not current_user.orienteur_id:
            raise HTTPException(
                status_code=403,
                detail="Orienteur non affilié à une équipe.",
            )
        return int(current_user.orienteur_id)

    raise HTTPException(
        status_code=403,
        detail="Accès insuffisant pour voir les affectations secteurs techniciens.",
    )


_ASSIGNMENT_QUERY = text(
    """
    SELECT
        ts.technician_id,
        ts.sector_id,
        ts.is_primary,
        s.name AS sector_name,
        s.color AS sector_color,
        s.is_active AS sector_is_active
    FROM technician_sectors AS ts
    JOIN sectors AS s
      ON s.id = ts.sector_id
    JOIN technicians AS t
      ON t.id = ts.technician_id
    WHERE (
        CAST(:technician_id AS INTEGER) IS NULL
        OR ts.technician_id = :technician_id
    )
      AND (
        CAST(:orienteur_id AS INTEGER) IS NULL
        OR t.orienteur_id = :orienteur_id
      )
    ORDER BY
        ts.technician_id,
        ts.is_primary DESC,
        s.name ASC
    """
)


def _assignment_from_rows(
    technician_id: int,
    rows,
) -> TechnicianSectorAssignment:
    sectors = [
        TechnicianSectorItem(
            id=int(row["sector_id"]),
            name=str(row["sector_name"]),
            color=row["sector_color"],
            is_active=bool(row["sector_is_active"]),
            is_primary=bool(row["is_primary"]),
        )
        for row in rows
    ]

    primary = next(
        (
            sector
            for sector in sectors
            if sector.is_primary
        ),
        None,
    )

    return TechnicianSectorAssignment(
        technician_id=technician_id,
        primary_sector_id=(
            primary.id
            if primary
            else None
        ),
        primary_sector_name=(
            primary.name
            if primary
            else None
        ),
        sector_ids=[
            sector.id
            for sector in sectors
        ],
        sector_names=[
            sector.name
            for sector in sectors
        ],
        sectors=sectors,
    )


async def _read_assignments(
    db: AsyncSession,
    technician_id: Optional[int] = None,
    orienteur_id: Optional[int] = None,
) -> List[TechnicianSectorAssignment]:
    result = await db.execute(
        _ASSIGNMENT_QUERY,
        {
            "technician_id": technician_id,
            "orienteur_id": orienteur_id,
        },
    )

    grouped = OrderedDict()

    for row in result.mappings().all():
        key = int(row["technician_id"])
        grouped.setdefault(key, []).append(row)

    if technician_id is not None:
        return [
            _assignment_from_rows(
                technician_id,
                grouped.get(
                    technician_id,
                    [],
                ),
            )
        ]

    return [
        _assignment_from_rows(
            key,
            rows,
        )
        for key, rows in grouped.items()
    ]


@router.get(
    "/technician-assignments",
    response_model=List[TechnicianSectorAssignment],
)
async def get_technician_sector_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return technician-sector assignments inside the caller's RBAC scope."""
    orienteur_id = _assignment_orienteur_scope(current_user)
    return await _read_assignments(
        db,
        orienteur_id=orienteur_id,
    )


@router.put(
    "/technician-assignments/{technician_id}",
    response_model=TechnicianSectorAssignment,
)
async def replace_technician_sector_assignment(
    technician_id: int,
    assignment: TechnicianSectorAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """
    Replace a technician's complete sector assignment atomically.

    The primary sector is always part of the selected sector set. Sector IDs
    are validated against the central active Sector registry, so free-text or
    deactivated values cannot create detached operational assignments.
    """
    del current_user

    technician_result = await db.execute(
        text(
            """
            SELECT id
            FROM technicians
            WHERE id = :technician_id
            FOR UPDATE
            """
        ),
        {
            "technician_id": technician_id,
        },
    )

    if technician_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=404,
            detail=f"Technicien {technician_id} non trouvé",
        )

    normalized_ids = []
    seen = set()

    for raw_sector_id in assignment.sector_ids:
        sector_id = int(raw_sector_id)

        if sector_id <= 0:
            raise HTTPException(
                status_code=422,
                detail="Chaque identifiant secteur doit être positif.",
            )

        if sector_id not in seen:
            seen.add(sector_id)
            normalized_ids.append(sector_id)

    primary_sector_id = assignment.primary_sector_id

    if (
        primary_sector_id is not None
        and primary_sector_id not in seen
    ):
        normalized_ids.insert(
            0,
            primary_sector_id,
        )
        seen.add(primary_sector_id)

    if normalized_ids:
        placeholders = ", ".join(
            f":sector_{index}"
            for index in range(len(normalized_ids))
        )
        params = {
            f"sector_{index}": sector_id
            for index, sector_id in enumerate(normalized_ids)
        }

        sector_result = await db.execute(
            text(
                f"""
                SELECT id, is_active
                FROM sectors
                WHERE id IN ({placeholders})
                """
            ),
            params,
        )
        _validate_assignment_sector_rows(
            normalized_ids,
            sector_result.mappings().all(),
        )

    try:
        await db.execute(
            text(
                """
                DELETE FROM technician_sectors
                WHERE technician_id = :technician_id
                """
            ),
            {
                "technician_id": technician_id,
            },
        )

        for sector_id in normalized_ids:
            await db.execute(
                text(
                    """
                    INSERT INTO technician_sectors (
                        technician_id,
                        sector_id,
                        is_primary
                    )
                    VALUES (
                        :technician_id,
                        :sector_id,
                        :is_primary
                    )
                    """
                ),
                {
                    "technician_id": technician_id,
                    "sector_id": sector_id,
                    "is_primary": (
                        sector_id
                        == primary_sector_id
                    ),
                },
            )

        await db.execute(
            text(
                """
                UPDATE technicians
                SET updated_at = CURRENT_TIMESTAMP
                WHERE id = :technician_id
                """
            ),
            {
                "technician_id": technician_id,
            },
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    assignments = await _read_assignments(
        db,
        technician_id,
    )

    return assignments[0]


@router.get("/", response_model=List[Sector])
async def get_sectors(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer la liste de tous les secteurs."""
    del skip, limit, current_user
    sectors = await get_all_sectors(
        db,
        active_only=False,
    )
    return sectors


@router.get("/{sector_id}", response_model=Sector)
async def get_sector_by_id(
    sector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer un secteur par son ID."""
    del current_user
    sector = await get_sector(
        db,
        sector_id,
    )
    if not sector:
        raise HTTPException(
            status_code=404,
            detail=f"Secteur {sector_id} non trouvé",
        )
    return sector


@router.post("/", response_model=Sector, status_code=201)
async def create_new_sector(
    sector_data: SectorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Créer un nouveau secteur."""
    del current_user
    try:
        sector = await create_sector(
            db=db,
            name=sector_data.name,
            color=sector_data.color,
            description=sector_data.description,
        )
        return sector
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@router.put("/{sector_id}", response_model=Sector)
async def update_existing_sector(
    sector_id: int,
    sector_data: SectorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Mettre à jour un secteur."""
    del current_user
    update_data = sector_data.model_dump(
        exclude_unset=True,
    )
    sector = await update_sector(
        db,
        sector_id,
        **update_data,
    )
    if not sector:
        raise HTTPException(
            status_code=404,
            detail=f"Secteur {sector_id} non trouvé",
        )
    return sector


@router.delete("/{sector_id}", response_model=dict)
async def delete_existing_sector(
    sector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Désactiver un secteur et retirer ses affectations technicien."""
    del current_user
    success = await delete_sector(
        db,
        sector_id,
    )
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Secteur {sector_id} non trouvé",
        )
    return {
        "success": True,
        "message": f"Secteur {sector_id} désactivé",
    }


@router.get(
    "/{sector_id}/stats",
    response_model=SectorStats,
)
async def get_sector_statistics(
    sector_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Récupérer les statistiques d'un secteur pour Chef Orienteur/Admin."""
    del current_user
    stats = await get_stats_by_sector(
        db,
        sector_id,
    )
    if not stats:
        raise HTTPException(
            status_code=404,
            detail=f"Secteur {sector_id} non trouvé",
        )
    return SectorStats(**stats)


@router.get(
    "/stats/global",
    response_model=SectorStatsGlobal,
)
async def get_global_sector_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Récupérer les statistiques globales pour Chef Orienteur/Admin."""
    del current_user
    all_sectors = await get_all_sectors(
        db,
        active_only=False,
    )
    sectors_stats = []

    for sector in all_sectors:
        stats = await get_stats_by_sector(
            db,
            sector.id,
        )
        if stats:
            sectors_stats.append(
                SectorStats(**stats),
            )

    total_orienteurs = sum(
        sector.orienteur_count
        for sector in sectors_stats
    )
    total_techs = sum(
        sector.tech_count
        for sector in sectors_stats
    )

    return SectorStatsGlobal(
        total_sectors=len(all_sectors),
        active_sectors=len([
            sector
            for sector in all_sectors
            if sector.is_active
        ]),
        sectors=sectors_stats,
        total_orienteurs=total_orienteurs,
        total_techs=total_techs,
    )
