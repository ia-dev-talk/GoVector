"""
API routes for technician operations
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import logging
from datetime import datetime, timezone

from backend.database.connection import get_db
from backend.api.schemas import (
	TechnicianCreate, TechnicianResponse, TechnicianUpdate,
	TechnicianLocationUpdate, TechnicianStatusUpdate,
	TechnicianWorkload, MessageResponse,
)
from backend.logic import technicians as tech_logic
from backend.logic.technician_details import get_technician_full_details
from backend.database.models import (
	FieldTeam,
	FieldTeamSector,
	User,
	UserRole,
	Technician,
	TechnicianLiveStatus,
)
from backend.auth.dependencies import get_current_user, require_chef_orienteur, require_orienteur, require_orienteur_or_above
from sqlalchemy import select, text
from backend.services.realtime.dashboard_service import DashboardService
from backend.services.realtime.websocket_manager import ws_manager, WSEvent

router = APIRouter()


async def _technician_responses_with_team_scope(
	db: AsyncSession,
	technicians: list[Technician],
) -> list[TechnicianResponse]:
	team_ids = {
		technician.team_id
		for technician in technicians
		if technician.team_id is not None
	}
	teams = {}
	coverage: dict[int, list[int]] = {}
	if team_ids:
		teams = {
			team.id: team
			for team in (
				await db.execute(select(FieldTeam).where(FieldTeam.id.in_(team_ids)))
			).scalars()
		}
		for team_id, sector_id in (
			await db.execute(
				select(FieldTeamSector.team_id, FieldTeamSector.sector_id)
				.where(FieldTeamSector.team_id.in_(team_ids))
				.order_by(FieldTeamSector.team_id, FieldTeamSector.sector_id)
			)
		).all():
			coverage.setdefault(team_id, []).append(sector_id)

	responses = []
	for technician in technicians:
		team = teams.get(technician.team_id)
		responses.append(
			TechnicianResponse.from_orm_with_counts(technician).model_copy(
				update={
					"team_name": team.name if team is not None else None,
					"sector_ids": coverage.get(technician.team_id, []),
				}
			)
		)
	return responses


class TechnicianProfileSave(BaseModel):
    """Atomic Personnel save payload guarded by the technician snapshot revision."""

    expected_updated_at: datetime
    updates: TechnicianUpdate = Field(default_factory=TechnicianUpdate)
    primary_sector_id: Optional[int] = Field(default=None, gt=0)
    sector_ids: List[int] = Field(default_factory=list)
    live_status: Optional[TechnicianLiveStatus] = None


def _revision_key(value: datetime) -> str:
    """Normalize naive/aware database timestamps into one optimistic-lock key."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds")


def _normalize_profile_sector_ids(
    primary_sector_id: Optional[int],
    sector_ids: List[int],
) -> List[int]:
    normalized = []
    seen = set()
    for raw_sector_id in sector_ids:
        sector_id = int(raw_sector_id)
        if sector_id <= 0:
            raise HTTPException(
                status_code=422,
                detail="Chaque identifiant secteur doit être positif.",
            )
        if sector_id not in seen:
            seen.add(sector_id)
            normalized.append(sector_id)

    if primary_sector_id is not None and primary_sector_id not in seen:
        normalized.insert(0, int(primary_sector_id))

    return normalized


async def _validate_profile_sector_ids(
    db: AsyncSession,
    sector_ids: List[int],
) -> None:
    if not sector_ids:
        return

    placeholders = ", ".join(
        f":sector_{index}" for index in range(len(sector_ids))
    )
    params = {
        f"sector_{index}": sector_id
        for index, sector_id in enumerate(sector_ids)
    }
    result = await db.execute(
        text(
            f"""
            SELECT id, is_active
            FROM sectors
            WHERE id IN ({placeholders})
            """
        ),
        params,
    )
    states = {
        int(row["id"]): bool(row["is_active"])
        for row in result.mappings().all()
    }
    missing = [sector_id for sector_id in sector_ids if sector_id not in states]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Secteur introuvable : " + ", ".join(str(value) for value in missing),
        )
    inactive = [sector_id for sector_id in sector_ids if not states[sector_id]]
    if inactive:
        raise HTTPException(
            status_code=409,
            detail="Secteur inactif non assignable : " + ", ".join(str(value) for value in inactive),
        )


@router.get("/me", response_model=TechnicianResponse)
async def get_current_technician(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current technician's info (for mobile)"""
    if current_user.role != UserRole.TECHNICIAN:
        raise HTTPException(status_code=403, detail="Accès réservé aux techniciens.")

    technician_id = current_user.technician_id
    if not technician_id:
        raise HTTPException(status_code=400, detail="Profil technicien manquant.")

    tech = await tech_logic.get_technician(db, technician_id)
    if not tech:
        raise HTTPException(status_code=404, detail="Technicien introuvable.")

    return TechnicianResponse.from_orm_with_counts(tech)


@router.post("/", response_model=TechnicianResponse, status_code=201)
async def create_technician(
    tech_data: TechnicianCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
	"""Create a new technician"""
	try:
		technician = await tech_logic.create_technician(
			db=db,
			name=tech_data.name,
			email=tech_data.email,
			phone=tech_data.phone,
			home_latitude=tech_data.home_latitude,
			home_longitude=tech_data.home_longitude,
			skills=tech_data.skills,
			home_address=tech_data.home_address,
			shift_start=tech_data.shift_start,
			shift_end=tech_data.shift_end,
			max_jobs_per_day=tech_data.max_jobs_per_day,
		)
		return TechnicianResponse.from_orm_with_counts(technician)
	except Exception as e:
		raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[TechnicianResponse])
async def get_technicians(
	skip: int = Query(0, ge=0),
	limit: int = Query(100, ge=1, le=500),
	db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Get all technicians with job counts, filtered by user role"""
	if current_user.role == UserRole.ADMIN:
		techs = await tech_logic.get_all_technicians(db, skip=skip, limit=limit)
	elif current_user.role == UserRole.ORIENTEUR:
		if not current_user.orienteur_id:
			raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")
		techs = await tech_logic.get_technicians_by_orienteur(db, current_user.orienteur_id, skip=skip, limit=limit)
	else:
		raise HTTPException(status_code=403, detail="Accès insuffisant pour voir les techniciens.")
	return await _technician_responses_with_team_scope(db, techs)


@router.get("/available", response_model=List[TechnicianResponse])
async def get_available_technicians(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Get all available technicians, filtered by user role"""
	if current_user.role == UserRole.ADMIN:
		techs = await tech_logic.get_available_technicians(db)
	elif current_user.role == UserRole.ORIENTEUR:
		if not current_user.orienteur_id:
			raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")
		techs = await tech_logic.get_available_technicians_by_orienteur(db, current_user.orienteur_id)
	else:
		raise HTTPException(status_code=403, detail="Accès insuffisant pour voir les techniciens disponibles.")
	return await _technician_responses_with_team_scope(db, techs)


@router.post("/{tech_id}/profile-save")
async def save_technician_profile(
    tech_id: int,
    payload: TechnicianProfileSave,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Persist Personnel profile + sectors + optional live status in one transaction."""
    result = await db.execute(
        select(Technician)
        .where(Technician.id == tech_id)
        .with_for_update()
    )
    technician = result.scalar_one_or_none()
    if technician is None:
        raise HTTPException(status_code=404, detail=f"Technicien {tech_id} non trouvé")

    if getattr(current_user, "role", None) == UserRole.ORIENTEUR and (
        not getattr(current_user, "orienteur_id", None)
        or technician.orienteur_id != current_user.orienteur_id
    ):
        raise HTTPException(
            status_code=403,
            detail="Vous ne pouvez modifier que les techniciens de votre équipe.",
        )

    if _revision_key(payload.expected_updated_at) != _revision_key(technician.updated_at):
        raise HTTPException(
            status_code=409,
            detail="La fiche technicien a été modifiée depuis son chargement. Rechargez-la avant d’enregistrer.",
        )

    normalized_sector_ids = _normalize_profile_sector_ids(
        payload.primary_sector_id,
        payload.sector_ids,
    )
    await _validate_profile_sector_ids(db, normalized_sector_ids)

    update_data = payload.updates.model_dump(exclude_unset=True)
    field_map = {"address": "home_address"}
    previous_live_status = technician.live_status
    live_status_changed = (
        payload.live_status is not None
        and payload.live_status != previous_live_status
    )

    try:
        for field, value in update_data.items():
            model_field = field_map.get(field, field)
            if hasattr(technician, model_field):
                setattr(technician, model_field, value)

        if payload.live_status is not None:
            technician.live_status = payload.live_status

        await db.execute(
            text(
                """
                DELETE FROM technician_sectors
                WHERE technician_id = :technician_id
                """
            ),
            {"technician_id": tech_id},
        )

        for sector_id in normalized_sector_ids:
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
                    "technician_id": tech_id,
                    "sector_id": sector_id,
                    "is_primary": sector_id == payload.primary_sector_id,
                },
            )

        technician.updated_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    if live_status_changed:
        try:
            await ws_manager.broadcast(
                WSEvent.TECH_STATUS_CHANGED,
                {
                    "technician_id": tech_id,
                    "technician_name": technician.name,
                    "old_status": previous_live_status.value if previous_live_status else None,
                    "new_status": technician.live_status.value,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                room="supervision",
            )
            await DashboardService(db).broadcast_dashboard_update()
        except Exception as ws_err:
            logger = logging.getLogger("uvicorn.error")
            logger.warning(f"WebSocket broadcast error (atomic tech status): {ws_err}")

    return {
        "success": True,
        "technician_id": tech_id,
        "updated_at": technician.updated_at.isoformat(),
        "primary_sector_id": payload.primary_sector_id,
        "sector_ids": normalized_sector_ids,
    }


@router.get("/{tech_id}", response_model=TechnicianResponse)
async def get_technician(
    tech_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Get a specific technician by ID, filtered by user role"""
	technician = await tech_logic.get_technician(db, tech_id)
	if not technician:
		raise HTTPException(status_code=404, detail=f"Technicien {tech_id} non trouvé")

	if current_user.role == UserRole.ORIENTEUR and (not current_user.orienteur_id or technician.orienteur_id != current_user.orienteur_id):
		raise HTTPException(status_code=403, detail="Accès insuffisant pour voir ce technicien.")

	return TechnicianResponse.from_orm_with_counts(technician)


@router.patch("/{tech_id}", response_model=TechnicianResponse)
async def update_technician(
	tech_id: int,
	tech_data: TechnicianUpdate,
	db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
	"""Update technician information"""
	technician = await tech_logic.get_technician(db, tech_id)
	if not technician:
		raise HTTPException(status_code=404, detail=f"Technician {tech_id} not found")

	update_data = tech_data.model_dump(exclude_unset=True)
	updated = await tech_logic.update_technician(db, tech_id, **update_data)
	return TechnicianResponse.from_orm_with_counts(updated)


@router.patch("/{tech_id}/location", response_model=TechnicianResponse)
async def update_technician_location(
	tech_id: int,
	location_data: TechnicianLocationUpdate,
	db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
	"""Update technician's current location"""
	technician = await tech_logic.update_technician_location(
		db, tech_id, location_data.latitude, location_data.longitude,
	)
	if not technician:
		raise HTTPException(status_code=404, detail=f"Technician {tech_id} not found")
	return TechnicianResponse.from_orm_with_counts(technician)


@router.patch("/{tech_id}/status", response_model=TechnicianResponse)
async def update_technician_status(
	tech_id: int,
	status_data: TechnicianStatusUpdate,
	db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Update technician status — accessible to ORIENTEUR (own team) and ADMIN."""
	# Vérifier les permissions
	if current_user.role not in [UserRole.ADMIN, UserRole.ORIENTEUR]:
		raise HTTPException(status_code=403, detail="Accès insuffisant pour modifier le statut d'un technicien.")

	# Si ORIENTEUR, vérifier que le technicien est dans son équipe
	if current_user.role == UserRole.ORIENTEUR:
		technician = await tech_logic.get_technician(db, tech_id)
		if not technician:
			raise HTTPException(status_code=404, detail=f"Technician {tech_id} not found")
		if not current_user.orienteur_id or technician.orienteur_id != current_user.orienteur_id:
			raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que le statut de vos propres techniciens.")

	new_status = status_data.status

	technician = await tech_logic.update_technician_status(db, tech_id, new_status)
	if not technician:
		raise HTTPException(status_code=404, detail=f"Technician {tech_id} not found")

	# ✅ Temps réel : notifier Dashboard du changement de statut
	try:
		await ws_manager.broadcast(
			WSEvent.TECH_STATUS_CHANGED,
			{
				"technician_id": tech_id,
				"technician_name": technician.name,
				"old_status": technician.live_status.value if hasattr(technician, 'live_status') else None,
				"new_status": technician.live_status.value,
				"timestamp": datetime.now(timezone.utc).isoformat(),
			},
			room="supervision",
		)
		await DashboardService(db).broadcast_dashboard_update()
	except Exception as ws_err:
		logger = logging.getLogger("uvicorn.error")
		logger.warning(f"WebSocket broadcast error (tech status): {ws_err}")

	return TechnicianResponse.from_orm_with_counts(technician)


@router.get("/{tech_id}/details")
async def get_technician_details(
    tech_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full technician details including equipment, stock, assignments, GPS, KPI, timeline"""
    from backend.logic.technician_details import get_technician_full_details
    try:
        details = await get_technician_full_details(db, tech_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return details


@router.get("/{tech_id}/workload", response_model=TechnicianWorkload)
async def get_technician_workload(
    tech_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Get technician\"s current workload for today, filtered by user role"""
	if current_user.role == UserRole.ORIENTEUR:
		technician = await tech_logic.get_technician(db, tech_id)
		if not technician or technician.orienteur_id != current_user.orienteur_id:
			raise HTTPException(status_code=403, detail="Accès insuffisant pour voir la charge de travail de ce technicien.")

	workload = await tech_logic.get_technician_workload(db, tech_id)
	if workload is None:
		raise HTTPException(status_code=404, detail=f"Technicien {tech_id} non trouvé")
	return workload


@router.delete("/{tech_id}", response_model=MessageResponse)
async def delete_technician(
    tech_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
	"""Deactivate a technician (soft delete)"""
	success = await tech_logic.delete_technician(db, tech_id)
	if not success:
		raise HTTPException(status_code=404, detail=f"Technician {tech_id} not found")
	return MessageResponse(success=True, message=f"Technician {tech_id} deactivated")
