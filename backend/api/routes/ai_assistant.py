"""
AI Assistant API Routes — FieldOpt
Assistant intelligent pour le pilotage FTTH.
Utilise uniquement les modèles existants dans models.py.
"""
import logging
import re
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database.connection import get_db
from backend.database.models import (
    Assignment,
    Job,
    JobSiteObservation,
    JobStatus,
    Technician,
    TechnicianFieldAction,
    TechnicianStatus,
    UserRole,
)
from backend.auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI Assistant"])


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", value))


def _intent(message: str, aliases: list[str]) -> bool:
    normalized = _normalize(message)
    if any(_normalize(alias) in normalized for alias in aliases):
        return True
    words = normalized.split()
    for alias in aliases:
        for target in _normalize(alias).split():
            if len(target) < 4:
                continue
            if any(SequenceMatcher(None, word, target).ratio() >= 0.78 for word in words):
                return True
    return False


def _jobs_query(current_user):
    query = select(Job).where(Job.deleted_at.is_(None))
    if current_user.role == UserRole.ADMIN:
        return query
    if current_user.role == UserRole.ORIENTEUR:
        return query.where(Job.orienteur_id == current_user.orienteur_id)
    if current_user.role == UserRole.TECHNICIAN:
        return query.join(Assignment).where(
            Assignment.technician_id == current_user.technician_id,
            Assignment.ended_at.is_(None),
        )
    if current_user.role == UserRole.CLIENT:
        if current_user.client_organization_id is None:
            return query.where(Job.id == -1)
        return query.where(
            Job.client_organization_id == current_user.client_organization_id
        )
    return query.where(Job.id == -1)


def _technicians_query(current_user):
    query = select(Technician)
    if current_user.role == UserRole.ADMIN:
        return query
    if current_user.role == UserRole.ORIENTEUR:
        return query.where(Technician.orienteur_id == current_user.orienteur_id)
    if current_user.role == UserRole.TECHNICIAN:
        return query.where(Technician.id == current_user.technician_id)
    return query.where(Technician.id == -1)


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    response: str
    data: Optional[dict] = None
    confidence: float


@router.post("/ai/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Assistant IA conscient des données temps réel.
    """
    message = request.message.strip()

    try:
        if _intent(message, ["qui est en pause", "hors service", "disponible", "technicien"]):
            if current_user.role == UserRole.CLIENT:
                return ChatResponse(
                    response="Les positions et états individuels des techniciens ne font pas partie de votre accès entreprise.",
                    confidence=1.0,
                )
            return await _handle_rh_status(message, db, current_user)

        elif _intent(message, ["combien interventions", "combien jobs", "combien aujourd hui", "production", "operations"]):
            return await _handle_production_count(message, db, current_user)

        elif _intent(message, ["ou est", "localise", "position technicien"]):
            if current_user.role == UserRole.CLIENT:
                return ChatResponse(
                    response="La géolocalisation nominative des techniciens n’est pas exposée aux comptes entreprise.",
                    confidence=1.0,
                )
            return await _handle_where_is(message, db, current_user)

        elif _intent(message, ["statistique", "kpi", "performance", "bilan"]):
            return await _handle_statistics(db, current_user)

        elif _intent(message, ["intervention", "dossier", "adresse", "client", "site", "pto", "pbo", "cable", "mesure", "commentaire", "photo"]):
            return await _handle_job_search(message, db, current_user)

        else:
            return ChatResponse(
                response=(
                    "Je peux vous aider avec :\n"
                    "• 📍 **Localisation** : « Où est Amine ? »\n"
                    "• 👥 **RH** : « Qui est en pause ? », « Qui est disponible ? »\n"
                    "• 📋 **Production** : « Combien d'interventions aujourd'hui ? »\n"
                    "• 📈 **Statistiques** : « Donne les KPI »\n"
                    "Je réponds uniquement avec les données autorisées pour votre rôle. Vous pouvez aussi rechercher une intervention par numéro, client, adresse, PBO ou PTO."
                ),
                confidence=0.5,
            )

    except Exception as e:
        logger.exception(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail="Erreur du service IA")


async def _handle_rh_status(
    message: str, db: AsyncSession, current_user
) -> ChatResponse:
    """Gère les requêtes RH : qui est en pause, disponible, etc."""
    normalized = _normalize(message)
    is_on_break = _intent(normalized, ["pause", "repos"])
    is_off_duty = _intent(normalized, ["hors service"])
    is_available = _intent(normalized, ["disponible", "libre"])
    show_all = not (is_on_break or is_off_duty or is_available)

    query = _technicians_query(current_user)
    result = await db.execute(query)
    techs = result.scalars().all()

    if show_all:
        on_break = [t for t in techs if t.status == TechnicianStatus.ON_BREAK]
        off_duty = [t for t in techs if t.status == TechnicianStatus.OFF_DUTY]
        available = [t for t in techs if t.status == TechnicianStatus.AVAILABLE]
        on_job = [t for t in techs if t.status in (TechnicianStatus.ON_JOB, TechnicianStatus.EN_ROUTE)]

        lines = ["**État des techniciens :**"]
        if available:
            lines.append(f"✅ Disponibles ({len(available)}) : {', '.join(t.name for t in available)}")
        if on_job:
            lines.append(f"🔧 En intervention ({len(on_job)}) : {', '.join(t.name for t in on_job)}")
        if on_break:
            lines.append(f"☕ En pause ({len(on_break)}) : {', '.join(t.name for t in on_break)}")
        if off_duty:
            lines.append(f"❌ Hors service ({len(off_duty)}) : {', '.join(t.name for t in off_duty)}")

        return ChatResponse(
            response="\n".join(lines),
            data={"total": len(techs), "available": len(available), "on_job": len(on_job),
                  "on_break": len(on_break), "off_duty": len(off_duty)},
            confidence=0.9,
        )

    target_status = None
    if is_on_break:
        target_status = TechnicianStatus.ON_BREAK
    elif is_off_duty:
        target_status = TechnicianStatus.OFF_DUTY
    elif is_available:
        target_status = TechnicianStatus.AVAILABLE

    if target_status:
        filtered = [t for t in techs if t.status == target_status]
        label = target_status.value
        if filtered:
            return ChatResponse(
                response=f"Techniciens {label} ({len(filtered)}) : {', '.join(t.name for t in filtered)}.",
                data={"status": target_status.value, "count": len(filtered)},
                confidence=0.9,
            )
        return ChatResponse(
            response=f"Aucun technicien {label} actuellement.",
            data={"status": target_status.value, "count": 0},
            confidence=0.8,
        )

    return ChatResponse(
        response="Précisez : « Qui est en pause ? », « Qui est disponible ? »",
        confidence=0.4,
    )


async def _handle_production_count(
    message: str, db: AsyncSession, current_user
) -> ChatResponse:
    """Compte les interventions."""
    today = datetime.utcnow().date()
    start = datetime.combine(today, datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    result = await db.execute(_jobs_query(current_user).where(Job.created_at >= start, Job.created_at <= end))
    jobs = result.scalars().all()
    total = len(jobs)
    pending = sum(1 for job in jobs if job.status == JobStatus.PENDING)
    in_progress = sum(1 for job in jobs if job.status in {JobStatus.IN_PROGRESS, JobStatus.WORK_IN_PROGRESS})
    completed = sum(1 for job in jobs if job.status == JobStatus.COMPLETED)

    return ChatResponse(
        response=f"**Récap du jour** ({today.strftime('%d/%m/%Y')}) :\n"
                 f"📋 Total : {total}\n⏳ En attente : {pending}\n🔧 En cours : {in_progress}\n✅ Terminées : {completed}",
        data={"total": total, "pending": pending, "in_progress": in_progress, "completed": completed},
        confidence=0.9,
    )


async def _handle_where_is(
    message: str, db: AsyncSession, current_user
) -> ChatResponse:
    """Localise un technicien."""
    words = message.split()
    name = None
    for word in words:
        if word not in ["où", "est", "ou", "where", "is", "?", "!", ".", "le", "la", "les", "localise"]:
            name = word
            break

    if not name:
        return ChatResponse(response="Quel technicien cherchez-vous ?", confidence=0.3)

    result = await db.execute(_technicians_query(current_user))
    candidates = result.scalars().all()
    normalized_name = _normalize(name)
    tech = next((item for item in candidates if normalized_name in _normalize(item.name)), None)
    if tech is None and candidates:
        tech = max(candidates, key=lambda item: SequenceMatcher(None, normalized_name, _normalize(item.name)).ratio())
        if SequenceMatcher(None, normalized_name, _normalize(tech.name)).ratio() < 0.55:
            tech = None

    if not tech:
        return ChatResponse(response=f"Technicien '{name}' introuvable.", confidence=0.4)

    if tech.current_latitude and tech.current_longitude:
        return ChatResponse(
            response=f"**{tech.name}** est à `{tech.current_latitude}, {tech.current_longitude}` (statut: {tech.status.value}).",
            data={"name": tech.name, "lat": tech.current_latitude, "lng": tech.current_longitude, "status": tech.status.value},
            confidence=0.9,
        )
    return ChatResponse(
        response=f"**{tech.name}** — position GPS non disponible. Statut : {tech.status.value}.",
        data={"name": tech.name, "status": tech.status.value},
        confidence=0.7,
    )


async def _handle_statistics(
    db: AsyncSession, current_user
) -> ChatResponse:
    """Génère des statistiques KPI."""
    total_jobs = len((await db.execute(_jobs_query(current_user))).scalars().all())
    total_techs = 0
    if current_user.role != UserRole.CLIENT:
        total_techs = len((await db.execute(_technicians_query(current_user).where(Technician.is_active.is_(True)))).scalars().all())

    return ChatResponse(
        response=f"**Statistiques :**\n📋 Total interventions : {total_jobs}\n👥 Techniciens actifs : {total_techs}",
        data={"total_jobs": total_jobs, "total_technicians": total_techs},
        confidence=0.9,
    )


async def _handle_job_search(message: str, db: AsyncSession, current_user) -> ChatResponse:
    jobs = (await db.execute(_jobs_query(current_user).order_by(Job.updated_at.desc()).limit(250))).scalars().all()
    normalized = _normalize(message)
    numeric_ids = {int(value) for value in re.findall(r"\b\d+\b", normalized) if value.isdigit()}
    tokens = [token for token in normalized.split() if len(token) >= 3]

    def score(job: Job) -> int:
        if job.id in numeric_ids:
            return 100
        haystack = _normalize(" ".join(str(value or "") for value in (
            job.job_number, job.customer_name, job.service_address, job.service_city,
            job.pbo_raw, job.pto_raw, job.operator,
        )))
        return sum(1 for token in tokens if token in haystack)

    ranked = sorted(((score(job), job) for job in jobs), key=lambda item: item[0], reverse=True)
    matches = [job for value, job in ranked if value > 0][:5]
    if not matches:
        return ChatResponse(response="Je n’ai trouvé aucune intervention correspondante dans votre périmètre.", confidence=0.7)
    lines = ["**Interventions trouvées :**"]
    for job in matches:
        lines.append(
            f"• #{job.job_number or job.id} — {job.customer_name or 'Client non renseigné'} — "
            f"{job.service_address or 'Adresse non renseignée'} — {job.status.value}"
        )
    primary = matches[0]
    observations = (
        await db.execute(
            select(JobSiteObservation)
            .where(JobSiteObservation.job_id == primary.id)
            .order_by(JobSiteObservation.occurred_at.desc())
            .limit(20)
        )
    ).scalars().all()
    actions = (
        await db.execute(
            select(TechnicianFieldAction)
            .where(TechnicianFieldAction.job_id == primary.id)
            .order_by(TechnicianFieldAction.occurred_at.desc())
            .limit(30)
        )
    ).scalars().all()
    site = next(
        (item for item in observations if item.observation_type == "site_location"),
        None,
    )
    if len(matches) == 1:
        if site is not None:
            lines.append(
                f"📍 Position terrain confirmée : {site.latitude}, {site.longitude}"
                + (f" (±{round(site.accuracy_m)} m)" if site.accuracy_m is not None else "")
            )
        if actions:
            lines.append(f"🧾 {len(actions)} action(s) terrain récente(s) consultable(s) sur ce dossier.")
    return ChatResponse(
        response="\n".join(lines),
        data={
            "job_ids": [job.id for job in matches],
            "primary_job": {
                "id": primary.id,
                "site_location": (
                    {"latitude": site.latitude, "longitude": site.longitude, "accuracy_m": site.accuracy_m}
                    if site is not None
                    else None
                ),
                "field_action_types": [item.action_type for item in actions],
            },
        },
        confidence=0.85,
    )
