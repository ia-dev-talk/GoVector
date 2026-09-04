"""Read-only, explainable operational assessment from canonical BlueVector facts."""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import raiseload

from backend.database.models import ApplicationSetting, Job, StockMovement
from backend.api.schemas.settings import OperationalSettingsValues, OrienteurObservationPolicy
from backend.logic.job_access import require_job_operations_access
from backend.logic.completion_policy import CompletionPolicy
from backend.logic.job_visits import get_current_assignment, get_current_visit
from backend.logic.workflow.capabilities import allowed_commands_for_job, status_capability


def assess_facts(*, job, assignment, visit, commands, material, now, policy=None, policy_revision=0):
    """Pure assessment. Suggestions are reviews, never executable approvals."""
    lifecycle = status_capability(job.status)
    policy = policy or OrienteurObservationPolicy()
    findings = []

    def finding(code, label, source, severity="warning"):
        findings.append(dict(code=code, label=label, source=source, severity=severity))

    if policy.flag_missing_sector and lifecycle["order_open"] and job.sector_id is None:
        finding("missing_sector", "Secteur opérationnel à préciser", "Job.sector_id")
    if lifecycle["field_active"]:
        if assignment is None or visit is None:
            finding("missing_current_passage", "Passage ou affectation courante manquant", "Assignment / JobVisit", "blocking")
        elif assignment.visit_id != visit.id or assignment.technician_id != visit.primary_technician_id:
            finding("inconsistent_current_passage", "Affectation et passage à réconcilier", "Assignment.visit_id / JobVisit.primary_technician_id", "blocking")
    elif visit is not None:
        finding("unexpected_open_passage", "Un passage reste ouvert hors activité terrain", "JobVisit.ended_at / Job.status", "blocking")
    if material["unlinked_visit_count"]:
        finding("material_without_visit", "Des mouvements historiques ne sont pas rattachés à un passage", "StockMovement.visit_id", "info")

    scheduled = job.scheduled_date
    if scheduled is not None:
        if scheduled.tzinfo is None:
            finding("schedule_timezone_unknown", "Fuseau du rendez-vous inconnu : retard non évalué", "Job.scheduled_date")
        elif lifecycle["order_open"] and not lifecycle["field_active"] and scheduled + timedelta(minutes=policy.appointment_grace_minutes) < now:
            finding("elapsed_appointment", "Créneau planifié dépassé : vérifier la suite du dossier", "Job.scheduled_date", "warning")

    blocked = any(item["severity"] == "blocking" for item in findings)
    if blocked:
        next_step = "Réconcilier les incohérences du passage avant toute décision."
    elif not lifecycle["order_open"]:
        next_step = "Consulter l’historique ; l’ordre est fermé."
    elif lifecycle["category"] == "awaiting_validation":
        next_step = "Examiner les preuves terrain avant la validation bureau."
    elif lifecycle["field_active"]:
        next_step = "Suivre le passage courant et traiter les besoins remontés du terrain."
    else:
        next_step = "Vérifier le créneau, les compétences et la disponibilité avant une affectation."

    return {
        "schema_version": 1,
        "policy_version": "observation-v1",
        "policy_revision": policy_revision,
        "policy": policy.model_dump(),
        "mode": "SIMULATION_ONLY",
        "execution_enabled": False,
        "approval_required": True,
        "generated_at": now,
        "job_id": job.id,
        "job_revision": job.updated_at,
        "lifecycle": lifecycle,
        "sector_id": job.sector_id,
        "scheduled_at": scheduled,
        "current_assignment": None if assignment is None else {
            "id": assignment.id, "technician_id": assignment.technician_id,
            "visit_id": assignment.visit_id,
        },
        "current_visit": None if visit is None else {
            "id": visit.id, "attempt_number": visit.attempt_number, "status": visit.status,
        },
        "material": material,
        "allowed_commands": commands,
        "findings": findings,
        "assessment_status": "BLOCKED" if blocked else "REVIEW",
        "next_step": next_step,
        "limitations": [
            "Disponibilité, trajet, compétences et stock requis des candidats non évalués.",
            "Aucune affectation proposée ; toute action nécessite une nouvelle vérification du workflow.",
        ],
    }


async def assess_job(db, *, job_id, current_user):
    job = await db.get(Job, job_id, options=[raiseload("*")])
    if job is None or job.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    require_job_operations_access(job=job, current_user=current_user)
    document = await db.scalar(select(ApplicationSetting).where(ApplicationSetting.namespace == "operational"))
    policy = OperationalSettingsValues.model_validate(document.values if document else {}).orienteur_observation
    assignment = await get_current_assignment(db, job_id, load_relationships=False)
    visit = await get_current_visit(db, job_id, load_relationships=False)
    commands = await allowed_commands_for_job(db, job=job, current_user=current_user)
    # Aggregate the journal itself, never a truncated page of browser results.
    total, unlinked = (await db.execute(
        select(
            func.count(StockMovement.id),
            func.count(StockMovement.id).filter(StockMovement.visit_id.is_(None)),
        ).where(StockMovement.job_id == job_id)
    )).one()
    result = assess_facts(
        job=job, assignment=assignment, visit=visit, commands=commands,
        material={"movement_count": total, "unlinked_visit_count": unlinked,
                  "source": "StockMovement.job_id / StockMovement.visit_id"},
        now=datetime.now(timezone.utc),
        policy=policy, policy_revision=document.revision if document else 0,
    )
    result["completion"] = None
    if result["lifecycle"]["order_open"]:
        result["completion"] = (await CompletionPolicy(db).evaluate(job)).as_dict()
    return result
