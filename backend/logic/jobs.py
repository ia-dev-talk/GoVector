"""
Job Business Logic
Core logic for job operations based on WFX routing concepts
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime, date, timedelta

from backend.database.models import Job, JobStatus, JobType, JobPriority, Technician, Assignment


async def create_job(
    db: AsyncSession,
    customer_name: Optional[str],
    service_address: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
    job_type: JobType,
    required_skills: List[str],
    job_number: Optional[str] = None,
    customer_phone: Optional[str] = None,
    customer_email: Optional[str] = None,
    service_city: Optional[str] = None,
    service_zip: Optional[str] = None,
    route_criteria: Optional[str] = None,
    priority: Optional['JobPriority'] = None,
    scheduled_date: Optional[datetime] = None,
    time_slot_start: Optional[str] = None,
    time_slot_end: Optional[str] = None,
    estimated_duration: int = 60,
    description: Optional[str] = None,
    notes: Optional[str] = None,
    special_instructions: Optional[str] = None,
    # --- Champs FTTH / Réseau ---
    operator: Optional[str] = None,
    nro_raw: Optional[str] = None,
    sro_raw: Optional[str] = None,
    pbo_raw: Optional[str] = None,
    pto_raw: Optional[str] = None,
    splitter_raw: Optional[str] = None,
    splitter_port_raw: Optional[int] = None,
    optical_power_dbm: Optional[float] = None,
    cable_length_m: Optional[int] = None,
    ont_serial: Optional[str] = None,
    router_serial: Optional[str] = None,
    mac_address: Optional[str] = None,
    wifi_box_serial: Optional[str] = None,
    # --- Équipement ---
    equipment_type: Optional[str] = None,
    serial_number: Optional[str] = None,
    # --- Signatures / Photos ---
    client_signature: Optional[str] = None,
    real_duration_minutes: Optional[int] = None,
    # --- Assignation ---
    assigned_technician_name: Optional[str] = None,
    orienteur_id: Optional[int] = None,
    client_organization_id: Optional[int] = None,
    status: JobStatus = JobStatus.PENDING,
    commit: bool = True,
    sector_raw: Optional[str] = None,
    sector_id: Optional[int] = None,
) -> Job:
    """Create a new service job with full FTTH fields"""
    from backend.database.models import JobPriority as JP
    if priority is None:
        priority = JP.NORMALE

    job = Job(
        job_number=job_number,
        job_type=job_type,
        status=status,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        service_address=service_address,
        service_city=service_city,
        service_zip=service_zip,
        sector_raw=sector_raw,
        sector_id=sector_id,
        latitude=latitude,
        longitude=longitude,
        required_skills=required_skills,
        route_criteria=route_criteria,
        priority=priority,
        scheduled_date=scheduled_date,
        time_slot_start=time_slot_start,
        time_slot_end=time_slot_end,
        estimated_duration=estimated_duration,
        description=description,
        notes=notes,
        special_instructions=special_instructions,
        # Champs FTTH
        operator=operator,
        nro_raw=nro_raw,
        sro_raw=sro_raw,
        pbo_raw=pbo_raw,
        pto_raw=pto_raw,
        splitter_raw=splitter_raw,
        splitter_port_raw=splitter_port_raw,
        optical_power_dbm=optical_power_dbm,
        cable_length_m=cable_length_m,
        ont_serial=ont_serial,
        router_serial=router_serial,
        mac_address=mac_address,
        wifi_box_serial=wifi_box_serial,
        # Équipement
        equipment_type=equipment_type,
        serial_number=serial_number,
        # Signatures
        client_signature=client_signature,
        real_duration_minutes=real_duration_minutes,
        # Assignation
        assigned_technician_name=assigned_technician_name,
        orienteur_id=orienteur_id,
        client_organization_id=client_organization_id,
    )

    db.add(job)
    if commit:
        await db.commit()
        await db.refresh(job)
    else:
        await db.flush()

    return job


async def get_job(db: AsyncSession, job_id: int) -> Optional[Job]:
	"""Get a job by ID"""
	result = await db.execute(select(Job).where(Job.id == job_id))
	return result.scalar_one_or_none()


async def get_job_by_number(db: AsyncSession, job_number: str) -> Optional[Job]:
	"""Get a job by job number"""
	result = await db.execute(select(Job).where(Job.job_number == job_number))
	return result.scalar_one_or_none()


def _build_jobs_list_query(
	*,
	status: Optional[JobStatus] = None,
	scheduled_date: Optional[date] = None,
	orienteur_id: Optional[int] = None,
	skip: int = 0,
	limit: int = 100,
):
	query = (
		select(Job)
		.where(Job.deleted_at.is_(None))
		.options(
			selectinload(
				Job.assignment
			).selectinload(
				Assignment.technician
			)
		)
	)

	if status is not None:
		query = query.where(
			Job.status == status
		)

	if scheduled_date is not None:
		start_of_day = datetime.combine(
			scheduled_date,
			datetime.min.time(),
		)
		next_day = start_of_day + timedelta(days=1)
		query = query.where(
			Job.scheduled_date >= start_of_day,
			Job.scheduled_date < next_day,
		)

	if orienteur_id is not None:
		query = query.where(
			Job.orienteur_id == orienteur_id
		)

	return (
		query
		.order_by(
			Job.created_at.desc(),
			Job.id.desc(),
		)
		.offset(skip)
		.limit(limit)
	)


async def get_all_jobs(
	db: AsyncSession,
	status: Optional[JobStatus] = None,
	scheduled_date: Optional[date] = None,
	skip: int = 0,
	limit: int = 100,
) -> List[Job]:
	"""Get all jobs with optional status and date filtering"""
	query = _build_jobs_list_query(
		status=status,
		scheduled_date=scheduled_date,
		skip=skip,
		limit=limit,
	)
	result = await db.execute(query)
	return result.scalars().all()


async def get_jobs_by_orienteur_id(
	db: AsyncSession,
	orienteur_id: int,
	status: Optional[JobStatus] = None,
	scheduled_date: Optional[date] = None,
	skip: int = 0,
	limit: int = 100,
) -> List[Job]:
	if (
		type(orienteur_id) is not int
		or orienteur_id <= 0
	):
		raise ValueError(
			"orienteur_id must be a positive integer"
		)

	query = _build_jobs_list_query(
		status=status,
		scheduled_date=scheduled_date,
		orienteur_id=orienteur_id,
		skip=skip,
		limit=limit,
	)
	result = await db.execute(query)
	return result.scalars().all()


async def get_pending_jobs(
	db: AsyncSession,
	scheduled_date: Optional[date] = None,
) -> List[Job]:
	"""Get all pending (unassigned) jobs, optionally filtered by scheduled date"""
	query = select(Job).where(Job.status == JobStatus.PENDING)

	if scheduled_date:
		start_of_day = datetime.combine(scheduled_date, datetime.min.time())
		end_of_day = datetime.combine(scheduled_date, datetime.max.time())
		query = query.where(
			Job.scheduled_date >= start_of_day,
			Job.scheduled_date <= end_of_day,
		)

	query = query.order_by(Job.priority.asc(), Job.created_at.asc())
	result = await db.execute(query)
	return result.scalars().all()


async def get_assigned_jobs(
	db: AsyncSession,
	scheduled_date: Optional[date] = None,
) -> List[Job]:
	"""Get all assigned jobs, optionally filtered by scheduled date"""
	query = select(Job).where(Job.status == JobStatus.ASSIGNED)

	if scheduled_date:
		start_of_day = datetime.combine(scheduled_date, datetime.min.time())
		end_of_day = datetime.combine(scheduled_date, datetime.max.time())
		query = query.where(
			Job.scheduled_date >= start_of_day,
			Job.scheduled_date <= end_of_day,
		)

	query = query.order_by(Job.priority.asc())
	result = await db.execute(query)
	return result.scalars().all()


async def update_job_status(
	db: AsyncSession,
	job_id: int,
	new_status: JobStatus,
) -> Optional[Job]:
	"""Compatibility wrapper around the authoritative WorkflowEngine."""
	from backend.logic.workflow.engine import WorkflowEngine

	job = await get_job(db, job_id)
	if not job:
		return None

	await WorkflowEngine(db).transition_job(
		job,
		new_status,
		metadata={"extra": {"source": "legacy_job_status_command"}},
	)

	await db.commit()
	await db.refresh(job)

	return job


async def start_job(db: AsyncSession, job_id: int) -> Optional[Job]:
    """Transition job from assigned to en_route via WorkflowEngine."""
    from backend.logic.workflow.engine import WorkflowEngine
    job = await get_job(db, job_id)
    if not job:
        return None
    engine = WorkflowEngine(db)
    job = await engine.transition_job(job, JobStatus.EN_ROUTE)
    await db.commit()
    await db.refresh(job)
    return job


async def complete_job(
    db: AsyncSession,
    job_id: int,
    wifi_box_serial: Optional[str] = None,
) -> Optional[Job]:
    """Transition job to completed via WorkflowEngine avec validation."""
    from backend.logic.workflow.engine import WorkflowEngine
    job = await get_job(db, job_id)
    if not job:
        return None
    engine = WorkflowEngine(db)

    # Vérifier que la complétion est possible
    check = await engine.can_complete(job)
    if not check["can_complete"]:
        raise ValueError(
            f"Impossible de clôturer: {', '.join(check['issues'])}"
        )

    metadata = {}
    if wifi_box_serial:
        metadata["equipment_serial"] = wifi_box_serial

    job = await engine.transition_job(job, JobStatus.COMPLETED, metadata=metadata)
    await db.commit()
    await db.refresh(job)
    return job


async def cancel_job(
	db: AsyncSession,
	job_id: int,
	reason: Optional[str] = None,
) -> Optional[Job]:
	"""Cancel a job from any non-terminal state"""
	job = await get_job(db, job_id)
	if not job:
		return None

	if reason:
		cancellation_note = f"\n[CANCELLED {datetime.utcnow().isoformat()}]: {reason}"
		job.notes = (job.notes or "") + cancellation_note

	return await update_job_status(db, job_id, JobStatus.CANCELLED)


async def update_job(
	db: AsyncSession,
	job_id: int,
	**kwargs,
) -> Optional[Job]:
	"""Update job fields"""
	job = await get_job(db, job_id)
	if not job:
		return None

	for field, value in kwargs.items():
		if (
			hasattr(job, field)
			and (
				value is not None
				or field in {"sector_raw", "sector_id"}
			)
		):
			setattr(job, field, value)

	job.updated_at = datetime.utcnow()

	await db.commit()
	await db.refresh(job)

	return job


async def delete_job(db: AsyncSession, job_id: int) -> bool:
	"""Delete a job (hard delete)"""
	job = await get_job(db, job_id)
	if not job:
		return False

	if job.status in [JobStatus.IN_PROGRESS, JobStatus.COMPLETED]:
		raise ValueError(f"Cannot delete job in {job.status} status. Cancel it instead.")

	await db.delete(job)
	await db.commit()

	return True


async def _build_jobs_summary(
	db: AsyncSession,
	*,
	target_date: Optional[date] = None,
	orienteur_id: Optional[int] = None,
	technician_id: Optional[int] = None,
) -> dict:
	common_filters = [
		Job.deleted_at.is_(None),
	]

	if target_date is not None:
		start_of_day = datetime.combine(
			target_date,
			datetime.min.time(),
		)
		next_day = start_of_day + timedelta(days=1)
		common_filters.extend([
			Job.scheduled_date >= start_of_day,
			Job.scheduled_date < next_day,
		])

	if orienteur_id is not None:
		common_filters.append(
			Job.orienteur_id == orienteur_id
		)

	if technician_id is not None:
		common_filters.append(
			Job.assignment.has(
				Assignment.technician_id == technician_id
			)
		)

	async def _count(extra_filter=None) -> int:
		filters = list(common_filters)
		if extra_filter is not None:
			filters.append(extra_filter)

		query = select(func.count(Job.id)).where(
			and_(*filters)
		)
		result = await db.execute(query)
		return int(result.scalar_one())

	return {
		"total": await _count(),
		"pending": await _count(
			Job.status == JobStatus.PENDING
		),
		"assigned": await _count(
			Job.status == JobStatus.ASSIGNED
		),
		"in_progress": await _count(
			Job.status == JobStatus.IN_PROGRESS
		),
		"completed": await _count(
			Job.status == JobStatus.COMPLETED
		),
		"cancelled": await _count(
			Job.status == JobStatus.CANCELLED
		),
		"on_hold": await _count(
			Job.status == JobStatus.ON_HOLD
		),
		"urgent": await _count(
			Job.priority == JobPriority.URGENT
		),
		"unassigned": await _count(
			~Job.assignment.has()
		),
	}


async def get_jobs_summary(
	db: AsyncSession,
	target_date: Optional[date] = None,
) -> dict:
	return await _build_jobs_summary(
		db,
		target_date=target_date,
	)


async def get_jobs_summary_by_orienteur_id(
	db: AsyncSession,
	orienteur_id: int,
	target_date: Optional[date] = None,
) -> dict:
	if (
		type(orienteur_id) is not int
		or orienteur_id <= 0
	):
		raise ValueError(
			"orienteur_id must be a positive integer"
		)

	return await _build_jobs_summary(
		db,
		target_date=target_date,
		orienteur_id=orienteur_id,
	)


async def get_jobs_summary_by_technician_id(
	db: AsyncSession,
	technician_id: int,
	target_date: Optional[date] = None,
) -> dict:
	if (
		type(technician_id) is not int
		or technician_id <= 0
	):
		raise ValueError(
			"technician_id must be a positive integer"
		)

	return await _build_jobs_summary(
		db,
		target_date=target_date,
		technician_id=technician_id,
	)


def can_technician_do_job(job: Job, technician: Technician) -> dict:
	"""
	Full CanDo evaluation — skill, route, time checks.
	Based on WFX CanDo functionality with 3 checkmarks.

	Returns dict with has_skill, has_route, has_time, missing_skills, route_match, distance_miles.
	"""
	import math

	# Skill check
	missing_skills = []
	if job.required_skills:
		missing_skills = [skill for skill in job.required_skills if skill not in technician.skills]
	has_skill = len(missing_skills) == 0

	# Route check — does the job's route_criteria match one of the tech's assigned_routes?
	route_match = False
	if job.route_criteria and technician.assigned_routes:
		route_match = job.route_criteria in technician.assigned_routes
	elif not job.route_criteria:
		# No route criteria on job — no restriction
		route_match = True
	has_route = route_match

	# Time check — does the tech have enough shift time remaining for this job?
	has_time = True
	if technician.shift_end and job.estimated_duration:
		try:
			end_h, end_m = map(int, technician.shift_end.split(':'))
			shift_end_mins = end_h * 60 + end_m
			# Calculate how many minutes of work already assigned
			assigned_mins = 0
			if technician.assignments:
				for a in technician.assignments:
					if a.job and a.job.status not in ('completed', 'cancelled'):
						assigned_mins += (a.job.estimated_duration or 0)
			start_h, start_m = map(int, technician.shift_start.split(':')) if technician.shift_start else (8, 0)
			shift_start_mins = start_h * 60 + start_m
			available_mins = (shift_end_mins - shift_start_mins) - assigned_mins
			has_time = available_mins >= job.estimated_duration
		except (ValueError, TypeError):
			has_time = True  # If we can't parse, don't block

	# Distance calculation (haversine — straight line miles)
	distance_miles = None
	tech_lat = technician.current_latitude or technician.home_latitude
	tech_lon = technician.current_longitude or technician.home_longitude
	if tech_lat and tech_lon and job.latitude and job.longitude:
		R = 3959  # Earth radius in miles
		dlat = math.radians(job.latitude - tech_lat)
		dlon = math.radians(job.longitude - tech_lon)
		a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(tech_lat)) * math.cos(math.radians(job.latitude)) * math.sin(dlon / 2) ** 2
		c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
		distance_miles = round(R * c, 1)

	can_do = has_skill and has_route and has_time

	return {
		"can_do": can_do,
		"has_skill": has_skill,
		"has_route": has_route,
		"has_time": has_time,
		"missing_skills": missing_skills,
		"route_match": route_match,
		"distance_miles": distance_miles,
	}


async def search_jobs(
	db: AsyncSession,
	date_from: Optional[date] = None,
	date_to: Optional[date] = None,
	job_id: Optional[int] = None,
	job_number: Optional[str] = None,
	tech_id: Optional[int] = None,
	customer_name: Optional[str] = None,
	status: Optional[JobStatus] = None,
	job_type: Optional[JobType] = None,
	route_criteria: Optional[str] = None,
	skill_group: Optional[str] = None,
	limit: int = 200,
) -> List[Job]:
	"""
	Multi-criteria job search — supports historical, current, and future queries.
	Mirrors WFX Job Search functionality.
	"""
	query = select(Job)
	filters = []

	if job_id:
		filters.append(Job.id == job_id)
	if job_number:
		filters.append(Job.job_number.ilike(f"%{job_number}%"))
	if customer_name:
		filters.append(Job.customer_name.ilike(f"%{customer_name}%"))
	if status:
		filters.append(Job.status == status)
	if job_type:
		filters.append(Job.job_type == job_type)
	if route_criteria:
		filters.append(Job.route_criteria == route_criteria)

	if date_from:
		start_of_day = datetime.combine(date_from, datetime.min.time())
		filters.append(Job.scheduled_date >= start_of_day)
	if date_to:
		end_of_day = datetime.combine(date_to, datetime.max.time())
		filters.append(Job.scheduled_date <= end_of_day)

	# Tech filter — need to join through assignments
	if tech_id:
		query = query.join(Assignment, Assignment.job_id == Job.id)
		filters.append(Assignment.technician_id == tech_id)

	if filters:
		query = query.where(and_(*filters))

	query = query.order_by(Job.scheduled_date.desc(), Job.priority.asc()).limit(limit)
	result = await db.execute(query)
	return result.scalars().all()
