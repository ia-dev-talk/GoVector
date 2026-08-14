"""Structured planned/observed/resolved facts for canonical sites."""

from __future__ import annotations

import unicodedata
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.errors import BusinessAPIError
from backend.database.models import (
    Job,
    Site,
    SiteAttributeObservation,
    SiteResolvedAttribute,
    TechnicianFieldAction,
    User,
)
from backend.logic.site_registry import ensure_site_for_job


NETWORK_REFERENCE_KEYS = {
    "pto": "pto_reference",
    "pbo": "pbo_reference",
    "pm": "pm_reference",
}

EQUIPMENT_CATEGORY_KEYS = {
    "ont": "ont_serial",
    "routeur": "router_serial",
    "router": "router_serial",
    "boitierwifi": "wifi_box_serial",
    "boitier_wifi": "wifi_box_serial",
    "wifi_box": "wifi_box_serial",
    "pto": "pto_reference",
    "splitter": "splitter_reference",
    "autre": "equipment_reference",
    "other": "equipment_reference",
}

ATTRIBUTE_LABELS = {
    "pto_reference": "Référence PTO",
    "pbo_reference": "Référence PBO",
    "pm_reference": "Référence PM / SRO",
    "ont_serial": "Numéro de série ONT",
    "router_serial": "Numéro de série routeur",
    "wifi_box_serial": "Numéro de série boîtier WiFi",
    "splitter_reference": "Référence splitter",
    "equipment_reference": "Référence équipement",
}

JOB_PLANNED_FIELDS = {
    "pto_reference": "pto_raw",
    "pbo_reference": "pbo_raw",
    "pm_reference": "sro_raw",
    "ont_serial": "ont_serial",
    "router_serial": "router_serial",
    "wifi_box_serial": "wifi_box_serial",
    "splitter_reference": "splitter_raw",
}


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_attribute_value(value: str) -> str:
    """Normalize for exact comparison without inventing spelling corrections."""
    return " ".join(unicodedata.normalize("NFKC", value).upper().split())


def extract_structured_attribute(
    *, action_type: str, payload: dict[str, Any]
) -> tuple[str, str, dict[str, Any]] | None:
    """Return a deliberately typed attribute or None for an unstructured note."""
    if action_type == "network_reference":
        raw_type = clean_text(payload.get("reference_type") or payload.get("type"))
        value = clean_text(payload.get("value") or payload.get("reference"))
        if raw_type is None or value is None:
            return None
        key = NETWORK_REFERENCE_KEYS.get(raw_type.lower())
        if key is None:
            return None
        return key, value, {"reference_type": raw_type.lower()}

    if action_type == "equipment_scan":
        value = clean_text(payload.get("code") or payload.get("reference"))
        category = clean_text(payload.get("category")) or "autre"
        if value is None:
            return None
        key = EQUIPMENT_CATEGORY_KEYS.get(category.lower(), "equipment_reference")
        return key, value, {
            "category": category,
            "label": clean_text(payload.get("label")),
        }

    return None


def planned_value_for_job(job: Job, attribute_key: str) -> str | None:
    field_name = JOB_PLANNED_FIELDS.get(attribute_key)
    return clean_text(getattr(job, field_name, None)) if field_name else None


def classify_attribute_observation(
    *,
    observed_value: str,
    resolved_value: str | None,
    planned_value: str | None,
) -> str:
    observed = normalize_attribute_value(observed_value)
    if resolved_value is not None:
        return (
            "accepted"
            if observed == normalize_attribute_value(resolved_value)
            else "conflict"
        )
    if planned_value is not None:
        return (
            "accepted"
            if observed == normalize_attribute_value(planned_value)
            else "conflict"
        )
    return "unreviewed"


def _sync_site_projection(site: Site, *, attribute_key: str, value: str) -> None:
    if attribute_key == "pto_reference":
        site.pto_reference = value
    elif attribute_key == "pbo_reference":
        site.pbo_reference = value


async def _assert_identity_not_owned_elsewhere(
    db: AsyncSession,
    *,
    current_site: Site,
    attribute_key: str,
    normalized_value: str,
) -> None:
    if attribute_key != "pto_reference":
        return
    other = await db.scalar(
        select(SiteResolvedAttribute)
        .join(Site, Site.id == SiteResolvedAttribute.site_id)
        .where(
            SiteResolvedAttribute.attribute_key == attribute_key,
            SiteResolvedAttribute.normalized_value == normalized_value,
            SiteResolvedAttribute.site_id != current_site.id,
            func.coalesce(Site.client_organization_id, 0)
            == (current_site.client_organization_id or 0),
            func.coalesce(func.lower(Site.operator), "")
            == (current_site.operator or "").lower(),
        )
        .limit(1)
    )
    if other is not None:
        raise BusinessAPIError(
            status_code=409,
            code="site_identity_conflict",
            message=(
                "Cette référence PTO appartient déjà à un autre site. "
                "Vérifiez les deux dossiers avant toute liaison ou fusion."
            ),
        )


async def _upsert_resolved_attribute(
    db: AsyncSession,
    *,
    site: Site,
    observation: SiteAttributeObservation,
    current_user: User,
    resolved_at: datetime,
) -> SiteResolvedAttribute:
    await _assert_identity_not_owned_elsewhere(
        db,
        current_site=site,
        attribute_key=observation.attribute_key,
        normalized_value=observation.normalized_value,
    )
    resolved = await db.scalar(
        select(SiteResolvedAttribute).where(
            SiteResolvedAttribute.site_id == site.id,
            SiteResolvedAttribute.attribute_key == observation.attribute_key,
        )
    )
    if resolved is None:
        resolved = SiteResolvedAttribute(
            site_id=site.id,
            attribute_key=observation.attribute_key,
            value_text=observation.value_text,
            normalized_value=observation.normalized_value,
            value_json=observation.value_json,
            source_observation_id=observation.id,
            resolved_by_user_id=current_user.id,
            resolved_at=resolved_at,
            revision=1,
        )
        db.add(resolved)
    else:
        changed = resolved.normalized_value != observation.normalized_value
        resolved.value_text = observation.value_text
        resolved.normalized_value = observation.normalized_value
        resolved.value_json = observation.value_json
        resolved.source_observation_id = observation.id
        resolved.resolved_by_user_id = current_user.id
        resolved.resolved_at = resolved_at
        if changed:
            resolved.revision += 1
    _sync_site_projection(
        site,
        attribute_key=observation.attribute_key,
        value=observation.value_text,
    )
    return resolved


async def record_site_attribute_observation(
    db: AsyncSession,
    *,
    job: Job,
    action: TechnicianFieldAction,
    current_user: User,
) -> SiteAttributeObservation | None:
    extracted = extract_structured_attribute(
        action_type=action.action_type, payload=action.payload or {}
    )
    if extracted is None:
        return None
    attribute_key, value, extra = extracted
    site = await ensure_site_for_job(db, job=job)
    resolved = await db.scalar(
        select(SiteResolvedAttribute).where(
            SiteResolvedAttribute.site_id == site.id,
            SiteResolvedAttribute.attribute_key == attribute_key,
        )
    )
    status = classify_attribute_observation(
        observed_value=value,
        resolved_value=resolved.value_text if resolved is not None else None,
        planned_value=planned_value_for_job(job, attribute_key),
    )
    now = datetime.now(timezone.utc)
    observation = SiteAttributeObservation(
        site_id=site.id,
        job_id=job.id,
        visit_id=action.visit_id,
        field_action_id=action.id,
        attribute_key=attribute_key,
        value_text=value,
        normalized_value=normalize_attribute_value(value),
        value_json=extra,
        source="mobile",
        user_id=current_user.id,
        technician_id=current_user.technician_id,
        base_site_revision=site.revision,
        resolution_status=status,
        occurred_at=action.occurred_at,
    )
    db.add(observation)
    await db.flush()
    if status == "accepted" and resolved is None:
        await _upsert_resolved_attribute(
            db,
            site=site,
            observation=observation,
            current_user=current_user,
            resolved_at=now,
        )
        observation.resolved_at = now
        observation.resolved_by_user_id = current_user.id
        site.revision += 1
    elif status == "accepted":
        observation.resolved_at = now
        observation.resolved_by_user_id = current_user.id
    return observation


async def resolve_site_attribute_observation(
    db: AsyncSession,
    *,
    job: Job,
    observation_id: int,
    decision: str,
    expected_revision: int | None,
    current_user: User,
    note: str | None = None,
) -> tuple[Site, SiteAttributeObservation, SiteResolvedAttribute | None]:
    if decision not in {"accepted", "rejected"}:
        raise BusinessAPIError(
            status_code=422,
            code="invalid_resolution",
            message="La décision doit être accepted ou rejected.",
        )
    observation = await db.scalar(
        select(SiteAttributeObservation).where(
            SiteAttributeObservation.id == observation_id,
            SiteAttributeObservation.job_id == job.id,
        )
    )
    if observation is None:
        raise BusinessAPIError(
            status_code=404,
            code="observation_not_found",
            message="Observation structurée introuvable.",
        )
    site = await db.scalar(select(Site).where(Site.id == observation.site_id))
    if site is None or job.site_id != site.id:
        raise BusinessAPIError(
            status_code=409,
            code="site_link_changed",
            message="Le rattachement au site a changé. Rechargez le dossier.",
        )
    if expected_revision is not None and expected_revision != site.revision:
        raise BusinessAPIError(
            status_code=409,
            code="site_revision_conflict",
            message="Le site a été modifié. Rechargez avant de décider.",
        )
    now = datetime.now(timezone.utc)
    observation.resolution_status = decision
    observation.resolved_at = now
    observation.resolved_by_user_id = current_user.id
    observation.resolution_note = clean_text(note)
    resolved = None
    if decision == "accepted":
        resolved = await _upsert_resolved_attribute(
            db,
            site=site,
            observation=observation,
            current_user=current_user,
            resolved_at=now,
        )
        site.revision += 1
    return site, observation, resolved


def resolved_attribute_dict(item: SiteResolvedAttribute) -> dict[str, Any]:
    return {
        "id": item.id,
        "key": item.attribute_key,
        "label": ATTRIBUTE_LABELS.get(item.attribute_key, item.attribute_key),
        "value": item.value_text,
        "metadata": item.value_json or {},
        "source_observation_id": item.source_observation_id,
        "resolved_by_user_id": item.resolved_by_user_id,
        "resolved_at": item.resolved_at,
        "revision": item.revision,
    }


def attribute_observation_dict(item: SiteAttributeObservation) -> dict[str, Any]:
    return {
        "id": item.id,
        "site_id": item.site_id,
        "job_id": item.job_id,
        "visit_id": item.visit_id,
        "field_action_id": item.field_action_id,
        "key": item.attribute_key,
        "label": ATTRIBUTE_LABELS.get(item.attribute_key, item.attribute_key),
        "value": item.value_text,
        "metadata": item.value_json or {},
        "source": item.source,
        "technician_id": item.technician_id,
        "base_site_revision": item.base_site_revision,
        "resolution_status": item.resolution_status,
        "resolved_at": item.resolved_at,
        "resolved_by_user_id": item.resolved_by_user_id,
        "resolution_note": item.resolution_note,
        "occurred_at": item.occurred_at,
    }
