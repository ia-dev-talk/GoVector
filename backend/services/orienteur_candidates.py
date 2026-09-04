"""Bounded, read-only candidate review; never an assignment or a ranking."""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import raiseload

from backend.database.models import Assignment, FieldTeam, FieldTeamSector, Job, Technician, UserRole
from backend.logic.job_access import require_job_operations_access
from backend.logic.job_planning import job_estimated_duration_minutes
from backend.logic.workflow.capabilities import allowed_commands_for_job, status_capability

MAX_CANDIDATES = 100


def planned_interval(job):
    """Use dated planning and the canonical duration, never guessed local time."""
    start = job.scheduled_date
    if start is None or start.tzinfo is None or start.utcoffset() is None:
        return None
    # Imported date + local HH:MM slots cannot be compared to UTC timestamps
    # without a governed business timezone. Do not turn midnight into a visit.
    if getattr(job, "time_slot_start", None) or getattr(job, "time_slot_end", None):
        return None
    return start, start + timedelta(minutes=job_estimated_duration_minutes(job))


def review_candidate(*, job, technician, team, sector_ids, assigned_jobs):
    checks = []

    def check(code, state, label, source, **facts):
        checks.append(dict(code=code, state=state, label=label, source=source, **facts))

    check("active", "PASS" if technician.is_active else "FAIL",
          "Profil technicien actif" if technician.is_active else "Profil technicien inactif", "Technician.is_active")
    required = job.required_skills
    skills = technician.skills
    if (not isinstance(required, list) or not isinstance(skills, list)
            or any(not isinstance(value, str) for value in required + skills)):
        check("skills", "UNKNOWN", "Compétences non renseignées", "Job.required_skills / Technician.skills")
    else:
        missing = sorted(set(required) - set(skills))
        check("skills", "FAIL" if missing else "PASS",
              "Compétences requises manquantes" if missing else "Compétences déclarées compatibles",
              "Job.required_skills / Technician.skills", missing_skills=missing, required_skills=required)
    if team is None or job.sector_id is None:
        check("sector", "UNKNOWN", "Équipe ou secteur non renseigné", "Job.sector_id / Technician.team_id")
    elif not team.is_active:
        check("sector", "FAIL", "Équipe inactive", "FieldTeam.is_active")
    else:
        covered = job.sector_id in sector_ids
        check("sector", "PASS" if covered else "FAIL",
              "Secteur couvert par l’équipe" if covered else "Secteur absent de la couverture de l’équipe",
              "Job.sector_id / FieldTeamSector", team_id=team.id, sector_id=job.sector_id)

    target_interval = planned_interval(job)
    conflicts = 0
    undated = 0
    for other in assigned_jobs:
        if other.id == job.id or not status_capability(other.status)["field_active"]:
            continue
        interval = planned_interval(other)
        if interval is None:
            undated += 1
        elif target_interval and target_interval[0] < interval[1] and interval[0] < target_interval[1]:
            conflicts += 1
    check("planning", "FAIL" if conflicts else "UNKNOWN" if target_interval is None or undated else "PASS",
          "Chevauchement planifié détecté" if conflicts else "Planning incomplet" if target_interval is None or undated else "Aucun chevauchement dans les affectations courantes datées",
          "Assignment.ended_at / Job.scheduled_date / canonical_estimated_duration_minutes",
          overlapping_assignment_count=conflicts, undated_assignment_count=undated)
    check("shift", "UNKNOWN", "Horaires, absences et capacité journalière à confirmer", "Technician.shift_start / shift_end : aucun fuseau ou calendrier d’absence canonique")
    check("client_authorization", "UNKNOWN", "Habilitation client et opérateur à confirmer", "Aucune habilitation client-technicien vérifiée")
    check("travel_and_stock", "UNKNOWN", "Trajet et matériel requis non évalués", "Aucun moteur de trajet ni besoin matériel évalué")
    return {
        "technician_id": technician.id, "name": technician.name,
        "status": "EXCLUDED" if any(c["state"] == "FAIL" for c in checks) else "REVIEW",
        "ready_for_assignment": False, "checks": checks,
        "unknowns": [c["code"] for c in checks if c["state"] == "UNKNOWN"],
        "exclusions": [c["code"] for c in checks if c["state"] == "FAIL"],
    }


async def assess_candidates(db, job_id, current_user):
    job = await db.get(Job, job_id, options=[raiseload("*")])
    if job is None or job.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)
    commands = await allowed_commands_for_job(db, job=job, current_user=current_user)
    result = {
        "schema_version": 1, "mode": "SIMULATION_ONLY", "execution_enabled": False,
        "approval_required": True, "job_id": job.id,
        "job_revision": job.updated_at.isoformat() if job.updated_at else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "allowed_commands": commands, "candidates": [], "total_candidates": 0,
        "truncated": False, "candidate_limit": MAX_CANDIDATES,
        "ordering": "technician_id_ascending_no_ranking",
        "limitations": [
            "Les profils à examiner ne constituent pas une recommandation d’affectation.",
            "Les durées sont celles du planning canonique ; elles ne prouvent pas la disponibilité réelle.",
            "Les créneaux horaires textuels sans fuseau métier ne sont pas comparés : planning inconnu.",
            "Absences, horaires, trajet, habilitations client et stock restent à vérifier.",
            "Les couvertures et compétences sont déclaratives, sans contrôle de certification.",
        ],
    }
    if "reassign" not in commands:
        result["assessment_status"] = "NOT_APPLICABLE"
        return result

    scope = []
    if current_user.role == UserRole.ORIENTEUR:
        # Team membership is authoritative; only unteamed legacy profiles use the projection.
        scope.append(or_(FieldTeam.orienteur_id == current_user.orienteur_id,
                         and_(Technician.team_id.is_(None), Technician.orienteur_id == current_user.orienteur_id)))
    base = select(Technician, FieldTeam).outerjoin(FieldTeam, Technician.team_id == FieldTeam.id).where(*scope)
    result["total_candidates"] = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = (await db.execute(base.options(raiseload("*")).order_by(Technician.id).limit(MAX_CANDIDATES))).all()
    result["truncated"] = result["total_candidates"] > MAX_CANDIDATES
    team_ids = {tech.team_id for tech, _ in rows if tech.team_id is not None}
    coverage = {}
    if team_ids:
        for team_id, sector_id in (await db.execute(select(FieldTeamSector.team_id, FieldTeamSector.sector_id).where(FieldTeamSector.team_id.in_(team_ids)))).all():
            coverage.setdefault(team_id, set()).add(sector_id)
    schedules = {}
    if rows:
        planning = select(Assignment.technician_id, Job).join(Job, Assignment.job_id == Job.id).where(
            Assignment.technician_id.in_([tech.id for tech, _ in rows]), Assignment.ended_at.is_(None), Job.deleted_at.is_(None)
        ).options(raiseload("*"))
        for technician_id, other in (await db.execute(planning)).all():
            schedules.setdefault(technician_id, []).append(other)
    result["candidates"] = [review_candidate(job=job, technician=tech, team=team,
        sector_ids=coverage.get(tech.team_id, set()), assigned_jobs=schedules.get(tech.id, [])) for tech, team in rows]
    result["assessment_status"] = "REVIEW"
    return result
