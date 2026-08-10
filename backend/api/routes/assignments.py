"""
API routes for assignment operations
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from backend.database.connection import get_db
from backend.database.models import User, UserRole, Technician, TechnicianStatus, Job, JobStatus, Orienteur
from backend.api.schemas import (
	AssignmentCreate, AssignmentResponse,
	UnassignRequest, ReassignRequest, MessageResponse,
	BatchAssignRequest, BatchUnassignRequest, BatchResult,
)
from backend.logic import assignments as assignment_logic
from backend.auth.dependencies import get_current_user, require_orienteur
from backend.logic.job_access import (
	require_job_operations_access,
	require_job_read_access,
)
from sqlalchemy import select, func

router = APIRouter()


async def _check_orienteur_scope(current_user: User, db: AsyncSession, technician_id: int):
    """Vérifie que l'orienteur a le droit d'accéder à ce technicien.

    Règles :
    - ADMIN et CHEF_ORIENTEUR : accès complet
    - ORIENTEUR : ne peut accéder qu'aux techniciens de SON orienteur_id
    """
    # ADMIN et CHEF_ORIENTEUR ont tous les droits
    if current_user.role in [UserRole.ADMIN, UserRole.CHEF_ORIENTEUR]:
        return

    # ORIENTEUR : vérifier que le technicien appartient à son équipe
    if current_user.role == UserRole.ORIENTEUR:
        if not current_user.orienteur_id:
            raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")

        result = await db.execute(
            select(Technician).where(
                Technician.id == technician_id,
                Technician.orienteur_id == current_user.orienteur_id
            )
        )
        tech = result.scalar_one_or_none()
        if not tech:
            raise HTTPException(status_code=403, detail="Ce technicien ne fait pas partie de votre équipe.")
        return

    raise HTTPException(status_code=403, detail="Accès insuffisant.")


async def _require_operations_job(
	db: AsyncSession,
	*,
	job_id: int,
	current_user: User,
) -> Job:
	result = await db.execute(select(Job).where(Job.id == job_id))
	job = result.scalar_one_or_none()
	if job is None:
		raise HTTPException(status_code=404, detail=f"Intervention {job_id} introuvable")
	return require_job_operations_access(job=job, current_user=current_user)


@router.post("/", response_model=AssignmentResponse, status_code=201)
async def create_assignment(
    assign_data: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Assign a job to a technician"""
	# Vérifier les permissions
	await _require_operations_job(
		db,
		job_id=assign_data.job_id,
		current_user=current_user,
	)
	await _check_orienteur_scope(current_user, db, assign_data.technician_id)

	try:
		assignment = await assignment_logic.create_assignment(
			db=db,
			job_id=assign_data.job_id,
			technician_id=assign_data.technician_id,
			sequence=assign_data.sequence,
		)
		return assignment
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))


@router.get("/technician/{tech_id}", response_model=List[AssignmentResponse])
async def get_technician_assignments(
    tech_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Get all assignments for a technician — filtered by role"""
	# ADMIN et CHEF_ORIENTEUR : accès complet
	if current_user.role in [UserRole.ADMIN, UserRole.CHEF_ORIENTEUR]:
		return await assignment_logic.get_assignments_for_technician(db, tech_id)

	# ORIENTEUR : ne peut voir que les techniciens de SON équipe
	if current_user.role == UserRole.ORIENTEUR:
		if not current_user.orienteur_id:
			raise HTTPException(status_code=403, detail="Orienteur non affilié à un secteur.")

		result = await db.execute(
			select(Technician).where(
				Technician.id == tech_id,
				Technician.orienteur_id == current_user.orienteur_id
			)
		)
		tech = result.scalar_one_or_none()
		if not tech:
			raise HTTPException(status_code=403, detail="Accès refusé à ces assignments.")
		return await assignment_logic.get_assignments_for_technician(db, tech_id)

	# TECHNICIAN : ne peut voir que SES propres assignments
	if current_user.role == UserRole.TECHNICIAN:
		if current_user.technician_id != tech_id:
			raise HTTPException(status_code=403, detail="Vous ne pouvez consulter que vos propres assignments.")
		return await assignment_logic.get_assignments_for_technician(db, tech_id)

	raise HTTPException(status_code=403, detail="Accès insuffisant pour voir les assignments.")


@router.get("/job/{job_id}", response_model=AssignmentResponse)
async def get_job_assignment(
	job_id: int,
	db: AsyncSession = Depends(get_db),
	current_user: User = Depends(get_current_user),
):
	"""Get assignment for a specific job"""
	result = await db.execute(select(Job).where(Job.id == job_id))
	job = result.scalar_one_or_none()
	if not job:
		raise HTTPException(status_code=404, detail=f"Intervention {job_id} introuvable")
	await require_job_read_access(db, job=job, current_user=current_user)
	assignment = await assignment_logic.get_assignments_for_job(db, job_id)
	if not assignment:
		raise HTTPException(status_code=404, detail=f"No assignment found for job {job_id}")
	return assignment


@router.post("/unassign", response_model=MessageResponse)
async def unassign_job(
    unassign_data: UnassignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Unassign a job from its technician"""
	# Vérifier les permissions de base (ORIENTEUR+)
	if current_user.role not in [UserRole.ADMIN, UserRole.CHEF_ORIENTEUR, UserRole.ORIENTEUR]:
		raise HTTPException(status_code=403, detail="Accès insuffisant.")

	await _require_operations_job(
		db,
		job_id=unassign_data.job_id,
		current_user=current_user,
	)
	success = await assignment_logic.unassign_job(db, unassign_data.job_id)
	if not success:
		raise HTTPException(status_code=404, detail=f"No assignment found for job {unassign_data.job_id}")
	return MessageResponse(success=True, message=f"Job {unassign_data.job_id} unassigned")


@router.post("/reassign", response_model=AssignmentResponse)
async def reassign_job(
    reassign_data: ReassignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Reassign a job to a different technician"""
	# Vérifier les permissions
	await _require_operations_job(
		db,
		job_id=reassign_data.job_id,
		current_user=current_user,
	)
	await _check_orienteur_scope(current_user, db, reassign_data.new_technician_id)

	try:
		assignment = await assignment_logic.reassign_job(
			db=db,
			job_id=reassign_data.job_id,
			new_technician_id=reassign_data.new_technician_id,
		)
		return assignment
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch-assign", response_model=BatchResult)
async def batch_assign(
    data: BatchAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
	"""Assign multiple jobs to a single technician in one transaction"""
	# Vérifier les permissions
	for job_id in data.job_ids:
		await _require_operations_job(
			db,
			job_id=job_id,
			current_user=current_user,
		)
	await _check_orienteur_scope(current_user, db, data.technician_id)

	try:
		result = await assignment_logic.batch_assign(
			db=db,
			job_ids=data.job_ids,
			technician_id=data.technician_id,
		)
		return BatchResult(
			success=result["assigned"] > 0,
			assigned=result["assigned"],
			skipped=result["skipped"],
			errors=result["errors"],
		)
	except ValueError as e:
		raise HTTPException(status_code=400, detail=str(e))


@router.get("/available/{orienteur_id}", response_model=List[dict])
async def get_available_technicians(
    orienteur_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """
    Récupérer les techniciens disponibles pour un orienteur.
    Filtré par :
    - Même équipe (orienteur_id)
    - Statut disponible
    - Charge de travail la plus faible
    Résultat trié par charge croissante (préparation affectation automatique)
    """
    # Vérifier les permissions
    if current_user.role == UserRole.ORIENTEUR and current_user.orienteur_id != orienteur_id:
        raise HTTPException(status_code=403, detail="Accès refusé : vous ne pouvez voir que votre propre équipe")

    # Récupérer les techniciens disponibles de l'équipe
    result = await db.execute(
        select(Technician).where(
            Technician.orienteur_id == orienteur_id,
            Technician.is_active == True,
        )
    )
    technicians = result.scalars().all()

    # Calculer la charge de travail pour chaque technicien
    tech_list = []
    for tech in technicians:
        # Compter les jobs non terminés assignés
        count_result = await db.execute(
            select(func.count(Job.id))
            .join(Assignment, Assignment.job_id == Job.id)
            .where(
                Assignment.technician_id == tech.id,
                Job.status.notin_([JobStatus.COMPLETED, JobStatus.CANCELLED]),
            )
        )
        workload = count_result.scalar_one() or 0

        tech_list.append({
            "id": tech.id,
            "name": tech.name,
            "status": tech.status.value if hasattr(tech.status, 'value') else str(tech.status),
            "phone": tech.phone,
            "workload": workload,
            "is_available": tech.status == TechnicianStatus.AVAILABLE,
            "current_latitude": tech.current_latitude,
            "current_longitude": tech.current_longitude,
        })

    # Trier : disponibles en premier, puis par charge croissante
    tech_list.sort(key=lambda t: (not t["is_available"], t["workload"]))

    return tech_list


@router.post("/batch-unassign", response_model=BatchResult)
async def batch_unassign(
	data: BatchUnassignRequest,
	db: AsyncSession = Depends(get_db),
	current_user: User = Depends(require_orienteur),
):
	"""Unassign multiple jobs in one transaction"""
	for job_id in data.job_ids:
		await _require_operations_job(
			db,
			job_id=job_id,
			current_user=current_user,
		)
	result = await assignment_logic.batch_unassign(db=db, job_ids=data.job_ids)
	return BatchResult(
		success=result["unassigned"] > 0,
		unassigned=result["unassigned"],
		skipped=result["skipped"],
	)
