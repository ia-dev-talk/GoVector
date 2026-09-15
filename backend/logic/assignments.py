"""
Assignment Business Logic
Manage job assignments to technicians
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from backend.database.models import (
	Assignment,
	FieldTeam,
	FieldTeamSector,
	Job,
	Technician,
	JobStatus,
	TechnicianStatus,
)
from backend.logic.job_planning import job_estimated_duration_minutes
from backend.logic.routing.distance import haversine_distance, calculate_travel_time
from backend.logic.workflow.engine import WorkflowEngine, get_valid_transitions
from backend.logic.job_visits import (
	close_current_assignment,
	reset_current_passage_projection,
)


_TERMINAL_ASSIGNMENT_STATUSES = {
	JobStatus.COMPLETED,
	JobStatus.CANCELLED,
}


def _assignment_interval(job: Job) -> Optional[tuple[datetime, datetime]]:
	start = job.scheduled_date
	if start is None or start.tzinfo is None or start.utcoffset() is None:
		return None

	slot_start = getattr(job, "time_slot_start", None)
	slot_end = getattr(job, "time_slot_end", None)
	if bool(slot_start) != bool(slot_end):
		return None
	if slot_start and slot_end:
		try:
			start_hour, start_minute = (
				int(value) for value in str(slot_start).split(":")
			)
			end_hour, end_minute = (
				int(value) for value in str(slot_end).split(":")
			)
		except (TypeError, ValueError):
			return None
		if not (
			0 <= start_hour <= 23
			and 0 <= end_hour <= 23
			and 0 <= start_minute <= 59
			and 0 <= end_minute <= 59
		):
			return None
		planned_start = start.replace(
			hour=start_hour,
			minute=start_minute,
			second=0,
			microsecond=0,
		)
		planned_end = start.replace(
			hour=end_hour,
			minute=end_minute,
			second=0,
			microsecond=0,
		)
		if planned_end <= planned_start:
			return None
		return planned_start, planned_end
	return start, start + timedelta(minutes=job_estimated_duration_minutes(job))


def _normalized_skill_set(values) -> Optional[set[str]]:
	if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
		return None
	return {value.strip().casefold() for value in values if value.strip()}


def assignment_profile_errors(
	*,
	job: Job,
	technician: Technician,
	team: Optional[FieldTeam],
	sector_covered: bool,
) -> list[str]:
	"""Return hard assignment blockers backed by canonical profile data."""
	errors: list[str] = []
	if not technician.is_active:
		errors.append("Profil technicien inactif")
	if technician.status in {TechnicianStatus.ON_BREAK, TechnicianStatus.OFF_DUTY}:
		errors.append("Technicien indisponible")
	if job.sector_id is None:
		errors.append("Secteur réel de l'intervention non renseigné")
	if technician.team_id is None or team is None:
		errors.append("Technicien sans équipe opérationnelle")
	elif not team.is_active:
		errors.append("Équipe opérationnelle inactive")
	elif job.sector_id is not None and not sector_covered:
		errors.append("Secteur non couvert par l'équipe du technicien")

	required = _normalized_skill_set(job.required_skills)
	available = _normalized_skill_set(technician.skills)
	if required is None or available is None:
		errors.append("Référentiel de compétences invalide")
	elif required - available:
		errors.append(
			"Compétences manquantes : " + ", ".join(sorted(required - available))
		)
	return errors


async def validate_assignment_eligibility(
	db: AsyncSession,
	*,
	job: Job,
	technician: Technician,
) -> None:
	"""Enforce sector, skills and planning even when the UI is bypassed."""
	team = await db.get(FieldTeam, technician.team_id) if technician.team_id else None
	sector_covered = False
	if team is not None and job.sector_id is not None:
		sector_covered = bool(await db.scalar(
			select(FieldTeamSector.id).where(
				FieldTeamSector.team_id == team.id,
				FieldTeamSector.sector_id == job.sector_id,
			)
		))

	errors = assignment_profile_errors(
		job=job,
		technician=technician,
		team=team,
		sector_covered=sector_covered,
	)
	target_interval = _assignment_interval(job)
	if target_interval is None:
		errors.append(
			"Planning fiable obligatoire avant affectation (date avec fuseau et sans créneau ambigu)"
		)
	else:
		other_jobs = (
			await db.execute(
				select(Job)
				.join(Assignment, Assignment.job_id == Job.id)
				.where(
					Assignment.technician_id == technician.id,
					Assignment.ended_at.is_(None),
					Job.id != job.id,
					Job.deleted_at.is_(None),
				)
			)
		).scalars().all()
		active_jobs = [
			other for other in other_jobs
			if other.status not in _TERMINAL_ASSIGNMENT_STATUSES
		]
		for other in active_jobs:
			other_interval = _assignment_interval(other)
			if other_interval is None:
				errors.append(
					f"Planning incomplet pour l'affectation active {other.job_number or other.id}"
				)
				continue
			if (
				target_interval[0] < other_interval[1]
				and other_interval[0] < target_interval[1]
			):
				errors.append(
					f"Chevauchement avec {other.job_number or other.id}"
				)

		max_jobs = int(technician.max_jobs_per_day or 0)
		if max_jobs > 0:
			same_day_count = sum(
				1 for other in active_jobs
				if other.scheduled_date is not None
				and other.scheduled_date.date() == target_interval[0].date()
			)
			if same_day_count >= max_jobs:
				errors.append(
					f"Capacité journalière atteinte ({max_jobs})"
				)

	if errors:
		raise ValueError("Affectation refusée : " + " ; ".join(dict.fromkeys(errors)))


def estimate_assignment_route(
	origin_latitude: Optional[float],
	origin_longitude: Optional[float],
	destination_latitude: Optional[float],
	destination_longitude: Optional[float],
) -> tuple[Optional[float], Optional[int]]:
	"""Return route estimates only when both endpoints are known.

	An address-only intervention is a valid operational record. Assignment must
	not depend on geocoding having produced a trusted point, so missing planned
	coordinates yield unknown distance/travel time instead of a fabricated value
	or a Haversine error.
	"""
	coordinates = (
		origin_latitude,
		origin_longitude,
		destination_latitude,
		destination_longitude,
	)
	if any(coordinate is None for coordinate in coordinates):
		return None, None

	distance = haversine_distance(
		origin_latitude,
		origin_longitude,
		destination_latitude,
		destination_longitude,
	)
	return distance, calculate_travel_time(distance)


async def create_assignment(
	db: AsyncSession,
	job_id: int,
	technician_id: int,
	sequence: Optional[int] = None,
	*,
	now: Optional[datetime] = None,
	assigned_by_user_id: Optional[int] = None,
) -> Assignment:
	"""Create a new assignment linking a job to a technician"""
	job_result = await db.execute(
		select(Job).where(Job.id == job_id).with_for_update()
	)
	job = job_result.scalar_one_or_none()
	if not job:
		raise ValueError(f"Job {job_id} not found")

	existing_result = await db.execute(
		select(Assignment).where(
			Assignment.job_id == job_id,
			Assignment.ended_at.is_(None),
		).with_for_update()
	)
	existing = existing_result.scalar_one_or_none()
	if existing:
		raise ValueError(f"Job {job_id} is already assigned to technician {existing.technician_id}")

	tech_result = await db.execute(select(Technician).where(Technician.id == technician_id))
	tech = tech_result.scalar_one_or_none()

	if not tech:
		raise ValueError(f"Technician {technician_id} not found")
	if job.status in {JobStatus.COMPLETED, JobStatus.CANCELLED}:
		raise ValueError("Une intervention clôturée ne peut pas être réaffectée")
	await validate_assignment_eligibility(db, job=job, technician=tech)
	is_retry = job.status in {
		JobStatus.FAILED,
		JobStatus.POSTPONED,
		JobStatus.CLIENT_ABSENT,
		JobStatus.ON_HOLD,
		JobStatus.SUSPENDED,
	}
	if job.status == JobStatus.CLIENT_ABSENT:
		await WorkflowEngine(db).transition_job(
			job,
			JobStatus.PENDING,
			metadata={"extra": {"source": "assignment_retry"}},
		)
	if is_retry:
		reset_current_passage_projection(job)

	origin_lat = tech.current_latitude if tech.current_latitude is not None else tech.home_latitude
	origin_lon = tech.current_longitude if tech.current_longitude is not None else tech.home_longitude

	distance, travel_time = estimate_assignment_route(
		origin_lat,
		origin_lon,
		job.latitude,
		job.longitude,
	)

	assignment = Assignment(
		job_id=job_id,
		technician_id=technician_id,
		assigned_by_user_id=assigned_by_user_id,
		sequence=sequence,
		estimated_distance=distance,
		estimated_travel_time=travel_time,
		actual_duration_minutes=None,
		# Stamp ETA at assign time so the timeline shows the right slot
		# immediately, not after the loop's step-1 pass on the next tick.
		estimated_arrival=(
			now + timedelta(minutes=travel_time)
			if now is not None and travel_time is not None
			else None
		),
	)

	db.add(assignment)
	await db.flush()
	await WorkflowEngine(db).transition_job(
		job,
		JobStatus.ASSIGNED,
		technician_id=technician_id,
		metadata={"extra": {"source": "assignment"}},
	)
	# Mark tech busy so the strategy stops picking them on subsequent jobs.
	# Step 2 of the sim tick flips them to ON_JOB on arrival; step 3 back to AVAILABLE on complete.
	if tech.status == TechnicianStatus.AVAILABLE:
		tech.status = TechnicianStatus.EN_ROUTE

	await db.commit()
	await db.refresh(assignment)

	return assignment


async def get_assignment(db: AsyncSession, assignment_id: int) -> Optional[Assignment]:
	"""Get an assignment by ID"""
	result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
	return result.scalar_one_or_none()


async def get_assignments_for_technician(
	db: AsyncSession,
	technician_id: int,
) -> List[Assignment]:
	"""Get all assignments for a technician ordered by sequence"""
	result = await db.execute(
		select(Assignment)
		.where(
			Assignment.technician_id == technician_id,
			Assignment.ended_at.is_(None),
		)
		.order_by(Assignment.sequence)
	)
	return result.scalars().all()


async def get_assignments_for_job(db: AsyncSession, job_id: int) -> Optional[Assignment]:
	"""Get assignment for a job"""
	result = await db.execute(
		select(Assignment).where(
			Assignment.job_id == job_id,
			Assignment.ended_at.is_(None),
		)
	)
	return result.scalar_one_or_none()


async def get_assignment_history_for_job(
	db: AsyncSession, job_id: int
) -> List[Assignment]:
	"""Return every participation without changing the current-assignment API."""
	result = await db.execute(
		select(Assignment)
		.where(Assignment.job_id == job_id)
		.order_by(Assignment.assigned_at.asc(), Assignment.id.asc())
	)
	return result.scalars().all()


async def get_assignment_for_technician_job(
	db: AsyncSession,
	technician_id: int,
	job_id: int,
) -> Optional[Assignment]:
	"""Vérifie qu'un technicien spécifique est assigné à un job spécifique"""
	result = await db.execute(
		select(Assignment).where(
			Assignment.technician_id == technician_id,
			Assignment.job_id == job_id,
			Assignment.ended_at.is_(None),
		)
	)
	return result.scalar_one_or_none()


async def unassign_job(
	db: AsyncSession,
	job_id: int,
	*,
	ended_by_user_id: Optional[int] = None,
) -> bool:
	"""Remove assignment for a job and revert job status to pending"""
	job_result = await db.execute(
		select(Job).where(Job.id == job_id).with_for_update()
	)
	job = job_result.scalar_one_or_none()
	assignment_result = await db.execute(
		select(Assignment).where(
			Assignment.job_id == job_id,
			Assignment.ended_at.is_(None),
		).with_for_update()
	)
	assignment = assignment_result.scalar_one_or_none()
	if not assignment:
		return False

	if job:
		await WorkflowEngine(db).transition_job(
			job,
			JobStatus.PENDING,
			technician_id=assignment.technician_id,
			metadata={"extra": {"source": "unassignment"}},
		)

	if assignment.ended_at is None:
		assignment.ended_at = datetime.now(timezone.utc)
		assignment.end_reason = "unassigned"
	assignment.ended_by_user_id = ended_by_user_id
	await db.commit()

	return True


async def reassign_job(
	db: AsyncSession,
	job_id: int,
	new_technician_id: int,
	*,
	assigned_by_user_id: Optional[int] = None,
) -> Assignment:
	"""
	Reassign a job to a different technician.
	Runs as a single atomic transaction.
	"""
	job_result = await db.execute(
		select(Job).where(Job.id == job_id).with_for_update()
	)
	job = job_result.scalar_one_or_none()
	if not job:
		raise ValueError(f"Job {job_id} not found")

	assignment_result = await db.execute(
		select(Assignment).where(
			Assignment.job_id == job_id,
			Assignment.ended_at.is_(None),
		).with_for_update()
	)
	existing = assignment_result.scalar_one_or_none()

	if job.status in {JobStatus.COMPLETED, JobStatus.CANCELLED}:
		raise ValueError("Une intervention clôturée ne peut pas être réaffectée")
	if existing and existing.technician_id == new_technician_id:
		return existing

	tech_result = await db.execute(select(Technician).where(Technician.id == new_technician_id))
	tech = tech_result.scalar_one_or_none()
	if not tech:
		raise ValueError(f"Technician {new_technician_id} not found")
	await validate_assignment_eligibility(db, job=job, technician=tech)

	# A dispatch change closes the old participation instead of deleting it.
	# Returning to PENDING closes the current visit through WorkflowEngine.
	if job.status != JobStatus.PENDING:
		if JobStatus.PENDING not in get_valid_transitions(job.status):
			raise ValueError(
				"Terminez, reportez ou mettez en échec le passage terrain avant de réaffecter"
			)
		await WorkflowEngine(db).transition_job(
			job,
			JobStatus.PENDING,
			technician_id=existing.technician_id if existing else None,
			metadata={"extra": {"source": "reassignment"}},
		)
	if existing and existing.ended_at is None:
		await close_current_assignment(
			db,
			job_id=job_id,
			reason="reassigned",
			ended_by_user_id=assigned_by_user_id,
		)
	reset_current_passage_projection(job)

	origin_lat = tech.current_latitude if tech.current_latitude is not None else tech.home_latitude
	origin_lon = tech.current_longitude if tech.current_longitude is not None else tech.home_longitude

	distance, travel_time = estimate_assignment_route(
		origin_lat,
		origin_lon,
		job.latitude,
		job.longitude,
	)

	new_assignment = Assignment(
		job_id=job_id,
		technician_id=new_technician_id,
		assigned_by_user_id=assigned_by_user_id,
		estimated_distance=distance,
		estimated_travel_time=travel_time,
	)

	db.add(new_assignment)
	await db.flush()
	await WorkflowEngine(db).transition_job(
		job,
		JobStatus.ASSIGNED,
		technician_id=new_technician_id,
		metadata={"extra": {"source": "reassignment"}},
	)
	await db.commit()
	await db.refresh(new_assignment)

	return new_assignment


async def batch_assign(
	db: AsyncSession,
	job_ids: List[int],
	technician_id: int,
	*,
	assigned_by_user_id: Optional[int] = None,
) -> dict:
	"""
	Assign multiple jobs to a single technician in one transaction.
	Skips jobs that are already assigned (doesn't error).
	Returns count of successful assignments.
	"""
	unique_job_ids = list(dict.fromkeys(job_ids))
	jobs = (
		await db.execute(
			select(Job).where(Job.id.in_(unique_job_ids)).with_for_update()
		)
	).scalars().all()
	jobs_by_id = {job.id: job for job in jobs}
	sector_ids = {job.sector_id for job in jobs}
	if len(jobs) != len(unique_job_ids):
		missing = sorted(set(unique_job_ids) - set(jobs_by_id))
		raise ValueError(f"Interventions introuvables : {missing}")
	if len(sector_ids) != 1 or None in sector_ids:
		raise ValueError(
			"Affectation multiple refusée : sélectionnez des interventions d'un même secteur réel"
		)

	tech_result = await db.execute(select(Technician).where(Technician.id == technician_id))
	tech = tech_result.scalar_one_or_none()
	if not tech:
		raise ValueError(f"Technician {technician_id} not found")

	origin_lat = tech.current_latitude if tech.current_latitude is not None else tech.home_latitude
	origin_lon = tech.current_longitude if tech.current_longitude is not None else tech.home_longitude

	assigned = 0
	skipped = 0
	errors = []

	for job_id in unique_job_ids:
		try:
			job = jobs_by_id[job_id]
			await validate_assignment_eligibility(db, job=job, technician=tech)
			existing_result = await db.execute(
				select(Assignment).where(
					Assignment.job_id == job_id,
					Assignment.ended_at.is_(None),
				).with_for_update()
			)
			existing = existing_result.scalar_one_or_none()
			if existing and existing.technician_id == technician_id:
				skipped += 1
				continue

			if job.status in {JobStatus.COMPLETED, JobStatus.CANCELLED}:
				errors.append(f"Job {job_id} is closed")
				skipped += 1
				continue
			if job.status != JobStatus.PENDING:
				if JobStatus.PENDING not in get_valid_transitions(job.status):
					errors.append(f"Job {job_id} has an active field visit")
					skipped += 1
					continue
				await WorkflowEngine(db).transition_job(
					job,
					JobStatus.PENDING,
					technician_id=existing.technician_id if existing else None,
					metadata={"extra": {"source": "batch_reassignment"}},
				)
			if existing and existing.ended_at is None:
				await close_current_assignment(
					db,
					job_id=job_id,
					reason="reassigned",
					ended_by_user_id=assigned_by_user_id,
				)
			reset_current_passage_projection(job)

			distance, travel_time = estimate_assignment_route(
				origin_lat,
				origin_lon,
				job.latitude,
				job.longitude,
			)

			assignment = Assignment(
				job_id=job_id,
				technician_id=technician_id,
				assigned_by_user_id=assigned_by_user_id,
				estimated_distance=distance,
				estimated_travel_time=travel_time,
			)
			db.add(assignment)
			await db.flush()
			await WorkflowEngine(db).transition_job(
				job,
				JobStatus.ASSIGNED,
				technician_id=technician_id,
				metadata={"extra": {"source": "batch_assignment"}},
			)
			assigned += 1
		except Exception as e:
			errors.append(f"Job {job_id}: {str(e)}")
			skipped += 1

	await db.commit()
	return {"assigned": assigned, "skipped": skipped, "errors": errors}


async def batch_unassign(
	db: AsyncSession,
	job_ids: List[int],
	*,
	ended_by_user_id: Optional[int] = None,
) -> dict:
	"""
	Unassign multiple jobs in one transaction.
	Returns count of successful unassignments.
	"""
	unassigned = 0
	skipped = 0

	for job_id in job_ids:
		job_result = await db.execute(
			select(Job).where(Job.id == job_id).with_for_update()
		)
		job = job_result.scalar_one_or_none()
		assignment_result = await db.execute(
			select(Assignment).where(
				Assignment.job_id == job_id,
				Assignment.ended_at.is_(None),
			).with_for_update()
		)
		assignment = assignment_result.scalar_one_or_none()
		if not assignment:
			skipped += 1
			continue

		if job:
			try:
				await WorkflowEngine(db).transition_job(
					job,
					JobStatus.PENDING,
					technician_id=assignment.technician_id,
					metadata={"extra": {"source": "batch_unassignment"}},
				)
			except ValueError:
				skipped += 1
				continue

		if assignment.ended_at is None:
			assignment.ended_at = datetime.now(timezone.utc)
			assignment.end_reason = "unassigned"
		assignment.ended_by_user_id = ended_by_user_id
		unassigned += 1

	await db.commit()
	return {"unassigned": unassigned, "skipped": skipped}
