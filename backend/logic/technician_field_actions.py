from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Job,
    TechnicianFieldAction,
    TechnicianMedia,
    JobSiteObservation,
    User,
)
from backend.logic.activity_log import log_job_activity
from backend.api.errors import BusinessAPIError
from backend.logic.job_access import require_job_collaboration_access
from backend.logic.job_visits import resolve_visit_for_technician
from backend.logic.site_registry import attach_observation_to_site
from backend.logic.site_attributes import record_site_attribute_observation
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    require_assigned_job,
)


SUPPORTED_FIELD_ACTION_TYPES = {
    "intervention_photo",
    "intervention_video",
    "intervention_document",
    "intervention_comment",
    "custom_intervention_action",
    "equipment_scan",
    "client_signature",
    "field_measurement",
    "otdr_measurement",
    "incident_report",
    "installation_work",
    "network_reference",
    "material_used",
    "gps_position",
    "site_location",
    "cable_entry",
    "cable_exit",
    "client_call",
}

_MEDIA_ACTION_TYPES = {
    "intervention_photo",
    "intervention_video",
    "intervention_document",
    "client_signature",
}

_ACTION_LABELS = {
    "intervention_photo": "Photo ajoutée",
    "intervention_video": "Vidéo ajoutée",
    "intervention_document": "Document ajouté",
    "intervention_comment": "Commentaire",
    "custom_intervention_action": "Action terrain",
    "equipment_scan": "Équipement scanné",
    "client_signature": "Signature client ajoutée",
    "field_measurement": "Mesure ajoutée",
    "otdr_measurement": "Mesure OTDR ajoutée",
    "incident_report": "Incident / anomalie",
    "installation_work": "Travaux enregistrés",
    "network_reference": "Référence réseau ajoutée",
    "material_used": "Matériel utilisé",
    "gps_position": "Position GPS enregistrée",
    "site_location": "Position exacte du site signalée",
    "cable_entry": "Entrée de câble signalée",
    "cable_exit": "Sortie de câble signalée",
    "client_call": "Appel client enregistré",
}

# Read-only source for the governed presentation catalog. Business support is
# still enforced by SUPPORTED_FIELD_ACTION_TYPES, not by a client-side list.
FIELD_ACTION_LABELS = dict(_ACTION_LABELS)


def _non_empty(payload: dict[str, Any], *keys: str) -> Any | None:
    for key in keys:
        value = payload.get(key)
        if value is not None and (not isinstance(value, str) or value.strip()):
            return value
    return None


async def _validate_payload(
    db: AsyncSession,
    *,
    job_id: int,
    event_type: str,
    payload: dict[str, Any],
    current_user: User,
) -> None:
    if event_type in _MEDIA_ACTION_TYPES:
        media_id = _non_empty(payload, "media_id")
        if media_id is None:
            raise TechnicianJobMutationError(
                "retryable",
                "media_not_uploaded",
                "Le média doit être téléversé avant son événement métier",
            )
        result = await db.execute(
            select(TechnicianMedia).where(
                TechnicianMedia.media_id == str(media_id),
                TechnicianMedia.job_id == job_id,
                TechnicianMedia.user_id == current_user.id,
                TechnicianMedia.technician_id == current_user.technician_id,
            )
        )
        if result.scalar_one_or_none() is None:
            raise TechnicianJobMutationError(
                "retryable",
                "media_not_uploaded",
                "Média introuvable pour ce technicien et cette intervention",
            )
        return

    if event_type in {"field_measurement", "otdr_measurement"}:
        if _non_empty(payload, "measurement_type", "type") is None or _non_empty(
            payload, "value"
        ) is None:
            raise TechnicianJobMutationError(
                "rejected",
                "invalid_payload",
                "Une mesure doit contenir un type et une valeur",
            )
        return

    if event_type in {"gps_position", "site_location", "cable_entry", "cable_exit"}:
        if not isinstance(payload.get("latitude"), (int, float)) or not isinstance(
            payload.get("longitude"), (int, float)
        ):
            raise TechnicianJobMutationError(
                "rejected",
                "invalid_payload",
                "Latitude et longitude sont obligatoires",
            )
        if not -90 <= float(payload["latitude"]) <= 90 or not -180 <= float(
            payload["longitude"]
        ) <= 180:
            raise TechnicianJobMutationError(
                "rejected", "invalid_payload", "Coordonnées GPS invalides"
            )
        accuracy = payload.get("accuracy")
        if accuracy is not None and (
            not isinstance(accuracy, (int, float)) or float(accuracy) < 0
        ):
            raise TechnicianJobMutationError(
                "rejected", "invalid_payload", "Précision GPS invalide"
            )
        return

    required_keys = {
        "intervention_comment": ("value", "comment"),
        "custom_intervention_action": ("value", "comment", "note"),
        "equipment_scan": ("code", "value", "reference"),
        "incident_report": ("value", "comment", "note", "incident_type"),
        "installation_work": ("value", "comment", "note", "work_type"),
        "network_reference": ("value", "reference", "note"),
        "material_used": ("value", "article", "reference"),
        "client_call": ("value", "comment", "outcome"),
    }.get(event_type, ())
    if required_keys and _non_empty(payload, *required_keys) is None:
        raise TechnicianJobMutationError(
            "rejected",
            "invalid_payload",
            "L'action ne contient aucune donnée exploitable",
        )


def _description(event_type: str, payload: dict[str, Any]) -> str:
    detail = _non_empty(
        payload,
        "value",
        "comment",
        "note",
        "reference",
        "code",
        "measurement_type",
        "type",
        "label",
    )
    label = _ACTION_LABELS[event_type]
    return f"{label} — {detail}" if detail is not None else label


async def record_technician_field_action(
    db: AsyncSession,
    *,
    event_id: str,
    occurred_at: datetime,
    job_id: int,
    event_type: str,
    payload: dict[str, Any],
    current_user: User,
) -> TechnicianFieldAction:
    if event_type not in SUPPORTED_FIELD_ACTION_TYPES:
        raise TechnicianJobMutationError(
            "rejected",
            "unsupported_action",
            f"Le type d'action '{event_type}' n'est pas supporté par sync v1",
        )

    try:
        job = await require_assigned_job(
            db,
            job_id=job_id,
            current_user=current_user,
        )
    except TechnicianJobMutationError:
        job = await db.scalar(select(Job).where(Job.id == job_id))
        if job is None:
            raise
        try:
            await require_job_collaboration_access(
                db, job=job, current_user=current_user
            )
        except BusinessAPIError as exc:
            raise TechnicianJobMutationError(
                "rejected", exc.code, exc.message
            ) from exc
    await _validate_payload(
        db,
        job_id=job_id,
        event_type=event_type,
        payload=payload,
        current_user=current_user,
    )

    visit = await resolve_visit_for_technician(
        db,
        job_id=job_id,
        technician_id=current_user.technician_id,
    )
    action = TechnicianFieldAction(
        event_id=event_id,
        user_id=current_user.id,
        technician_id=current_user.technician_id,
        job_id=job_id,
        visit_id=visit.id if visit is not None else None,
        action_type=event_type,
        payload=payload,
        occurred_at=occurred_at,
    )
    db.add(action)
    await db.flush()
    if event_type in {"site_location", "cable_entry", "cable_exit"}:
        observation = JobSiteObservation(
                job_id=job_id,
                visit_id=visit.id if visit is not None else None,
                field_action_id=action.id,
                observation_type=event_type,
                latitude=float(payload["latitude"]),
                longitude=float(payload["longitude"]),
                accuracy_m=(
                    float(payload["accuracy"])
                    if isinstance(payload.get("accuracy"), (int, float))
                    else None
                ),
                label=_non_empty(payload, "label"),
                note=_non_empty(payload, "note", "comment", "value"),
                user_id=current_user.id,
                technician_id=current_user.technician_id,
                source="mobile",
                occurred_at=occurred_at,
            )
        db.add(observation)
        if isinstance(db, AsyncSession):
            await db.flush()
            await attach_observation_to_site(
                db,
                job=job,
                observation=observation,
                current_user=current_user,
            )
    if event_type in {"network_reference", "equipment_scan"} and isinstance(
        db, AsyncSession
    ):
        await record_site_attribute_observation(
            db,
            job=job,
            action=action,
            current_user=current_user,
        )
    await log_job_activity(
        db=db,
        job_id=job_id,
        visit_id=visit.id if visit is not None else None,
        technician_id=current_user.technician_id,
        action=event_type,
        description=_description(event_type, payload),
        latitude=payload.get("latitude"),
        longitude=payload.get("longitude"),
        metadata={
            "source": "technician_outbox",
            "event_id": event_id,
            "field_action_id": action.id,
        },
    )
    return action
