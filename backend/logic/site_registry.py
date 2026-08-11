"""Canonical site identity and explicit field-location resolution."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Job,
    JobSiteObservation,
    Site,
    SiteAttributeObservation,
    SiteMergeRecord,
    SiteResolvedAttribute,
    User,
    UserRole,
)
from backend.api.errors import BusinessAPIError


SITE_CORROBORATION_RADIUS_M = 20.0
SITE_RESOLUTION_STATUSES = {"unreviewed", "accepted", "conflict", "rejected"}
SITE_MERGE_SEARCH_LIMIT = 20


def _clean(value: str | None) -> str | None:
    cleaned = value.strip() if value else ""
    return cleaned or None


def _normalized(value: str | None) -> str | None:
    cleaned = _clean(value)
    return cleaned.casefold() if cleaned else None


def distance_metres(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    """Return a small-distance-safe haversine distance."""
    radius = 6_371_000.0
    lat_a = math.radians(latitude_a)
    lat_b = math.radians(latitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(longitude_b - longitude_a)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * radius * math.asin(min(1.0, math.sqrt(value)))


async def ensure_site_for_job(db: AsyncSession, *, job: Job) -> Site:
    """Link a job to a stable site without fuzzy address merging.

    Canonical PTO identifiers or a raw PTO inside the exact operator/client
    scope can reuse an existing site. Without PTO, a complete exact structured
    address can be reused only when it yields one candidate. Otherwise field
    work gets a new site container when a technician records a landmark.
    """
    if job.site_id is not None:
        existing = await db.scalar(select(Site).where(Site.id == job.site_id))
        if existing is not None:
            return existing

    existing = await find_existing_site_for_job(db, job=job)
    match_basis = "explicit_field_observation"
    match_confidence = "high"
    if job.pto_id is not None:
        match_basis = "pto_id"
    else:
        raw_pto = _clean(job.pto_raw)
        if raw_pto:
            match_basis = "pto_reference"

    if existing is None:
        existing = Site(
            public_id=str(uuid4()),
            client_organization_id=job.client_organization_id,
            operator=_clean(job.operator),
            pto_id=job.pto_id,
            pbo_id=job.pbo_id,
            pto_reference=_clean(job.pto_raw),
            pbo_reference=_clean(job.pbo_raw),
            address_snapshot=_clean(job.service_address),
            city_snapshot=_clean(job.service_city),
            zip_snapshot=_clean(job.service_zip),
            match_basis=match_basis,
            match_confidence=match_confidence,
        )
        db.add(existing)
        await db.flush()

    job.site_id = existing.id
    return existing


async def find_existing_site_for_job(
    db: AsyncSession, *, job: Job
) -> Site | None:
    """Find only an already-known strong identity; never create or fuzzy-match."""
    if job.site_id is not None:
        return await db.scalar(select(Site).where(Site.id == job.site_id))
    if job.pto_id is not None:
        return await db.scalar(select(Site).where(Site.pto_id == job.pto_id))
    raw_pto = _clean(job.pto_raw)
    if raw_pto:
        return await db.scalar(
            select(Site)
            .where(
                func.lower(func.trim(Site.pto_reference)) == raw_pto.lower(),
                func.coalesce(func.lower(Site.operator), "")
                == (job.operator or "").lower(),
                func.coalesce(Site.client_organization_id, 0)
                == (job.client_organization_id or 0),
            )
            .order_by(Site.pto_id.is_(None))
            .limit(1)
        )

    address = _clean(job.service_address)
    city = _clean(job.service_city)
    zip_code = _clean(job.service_zip)
    if not (address and city and zip_code):
        return None
    candidates = (
        await db.execute(
            select(Site)
            .where(
                func.lower(func.trim(Site.address_snapshot)) == address.lower(),
                func.lower(func.trim(Site.city_snapshot)) == city.lower(),
                Site.zip_snapshot == zip_code,
                func.coalesce(func.lower(Site.operator), "")
                == (job.operator or "").lower(),
                func.coalesce(Site.client_organization_id, 0)
                == (job.client_organization_id or 0),
            )
            .limit(2)
        )
    ).scalars().all()
    return candidates[0] if len(candidates) == 1 else None


def classify_site_location(site: Site, observation: JobSiteObservation) -> str:
    if site.canonical_latitude is None or site.canonical_longitude is None:
        return "accepted"
    distance = distance_metres(
        site.canonical_latitude,
        site.canonical_longitude,
        observation.latitude,
        observation.longitude,
    )
    tolerance = max(
        SITE_CORROBORATION_RADIUS_M,
        float(site.canonical_accuracy_m or 0) + float(observation.accuracy_m or 0),
    )
    return "accepted" if distance <= tolerance else "conflict"


def apply_site_resolution(
    *,
    site: Site,
    observation: JobSiteObservation,
    decision: str,
    current_user: User,
    resolved_at: datetime | None = None,
) -> None:
    if decision not in {"accepted", "rejected"}:
        raise ValueError("Unsupported site resolution decision")
    now = resolved_at or datetime.now(timezone.utc)
    observation.resolution_status = decision
    observation.resolved_at = now
    observation.resolved_by_user_id = current_user.id
    if decision == "accepted" and observation.observation_type == "site_location":
        site.canonical_latitude = observation.latitude
        site.canonical_longitude = observation.longitude
        site.canonical_accuracy_m = observation.accuracy_m
        site.location_source = "technician_confirmed"
        site.resolved_observation_id = observation.id
        site.resolved_by_user_id = current_user.id
        site.resolved_at = now
        site.revision += 1
        site.updated_at = now


async def attach_observation_to_site(
    db: AsyncSession,
    *,
    job: Job,
    observation: JobSiteObservation,
    current_user: User,
) -> Site:
    site = await ensure_site_for_job(db, job=job)
    observation.site_id = site.id
    if observation.observation_type == "site_location":
        has_canonical_location = (
            site.canonical_latitude is not None
            and site.canonical_longitude is not None
        )
        status = classify_site_location(site, observation)
        if status == "accepted" and not has_canonical_location:
            apply_site_resolution(
                site=site,
                observation=observation,
                decision="accepted",
                current_user=current_user,
                resolved_at=observation.occurred_at,
            )
        elif status == "accepted":
            observation.resolution_status = "accepted"
            observation.resolved_at = observation.occurred_at
            observation.resolved_by_user_id = current_user.id
        else:
            observation.resolution_status = "conflict"
    return site


async def resolve_site_observation(
    db: AsyncSession,
    *,
    job: Job,
    observation_id: int,
    decision: str,
    expected_revision: int | None,
    current_user: User,
) -> tuple[Site, JobSiteObservation]:
    observation = await db.scalar(
        select(JobSiteObservation).where(
            JobSiteObservation.id == observation_id,
            JobSiteObservation.job_id == job.id,
        )
    )
    if observation is None:
        raise BusinessAPIError(404, "site_observation_not_found", "Repère terrain introuvable")
    if observation.site_id is None:
        site = await ensure_site_for_job(db, job=job)
        observation.site_id = site.id
    else:
        site = await db.scalar(select(Site).where(Site.id == observation.site_id))
    if site is None:
        raise BusinessAPIError(409, "site_not_available", "Le site lié au repère est introuvable")
    if expected_revision is not None and site.revision != expected_revision:
        raise BusinessAPIError(
            409,
            "site_revision_conflict",
            "Le site a été modifié. Rechargez le dossier avant de résoudre ce repère.",
        )
    apply_site_resolution(
        site=site,
        observation=observation,
        decision=decision,
        current_user=current_user,
    )
    await db.flush()
    return site, observation


def site_merge_conflicts(
    source: Site,
    target: Site,
    *,
    source_attributes: list[SiteResolvedAttribute] | None = None,
    target_attributes: list[SiteResolvedAttribute] | None = None,
) -> list[dict]:
    """Describe unsafe canonical differences; never choose a winner silently."""
    conflicts: list[dict] = []

    if source.client_organization_id != target.client_organization_id:
        conflicts.append(
            {
                "field": "client_organization_id",
                "source": source.client_organization_id,
                "target": target.client_organization_id,
            }
        )
    source_operator = _normalized(source.operator)
    target_operator = _normalized(target.operator)
    if source_operator and target_operator and source_operator != target_operator:
        conflicts.append(
            {"field": "operator", "source": source.operator, "target": target.operator}
        )

    for field in ("pto_id", "pbo_id"):
        source_value = getattr(source, field, None)
        target_value = getattr(target, field, None)
        if source_value is not None and target_value is not None and source_value != target_value:
            conflicts.append(
                {"field": field, "source": source_value, "target": target_value}
            )
    for field in ("pto_reference", "pbo_reference"):
        source_value = getattr(source, field, None)
        target_value = getattr(target, field, None)
        if (
            _normalized(source_value)
            and _normalized(target_value)
            and _normalized(source_value) != _normalized(target_value)
        ):
            conflicts.append(
                {"field": field, "source": source_value, "target": target_value}
            )

    if (
        source.canonical_latitude is not None
        and source.canonical_longitude is not None
        and target.canonical_latitude is not None
        and target.canonical_longitude is not None
    ):
        distance = distance_metres(
            source.canonical_latitude,
            source.canonical_longitude,
            target.canonical_latitude,
            target.canonical_longitude,
        )
        tolerance = max(
            SITE_CORROBORATION_RADIUS_M,
            float(source.canonical_accuracy_m or 0)
            + float(target.canonical_accuracy_m or 0),
        )
        if distance > tolerance:
            conflicts.append(
                {
                    "field": "canonical_location",
                    "distance_m": round(distance, 1),
                    "tolerance_m": round(tolerance, 1),
                }
            )

    source_by_key = {
        item.attribute_key: item for item in (source_attributes or [])
    }
    target_by_key = {
        item.attribute_key: item for item in (target_attributes or [])
    }
    for key in sorted(source_by_key.keys() & target_by_key.keys()):
        source_value = source_by_key[key].normalized_value
        target_value = target_by_key[key].normalized_value
        if source_value != target_value:
            conflicts.append(
                {
                    "field": key,
                    "source": source_by_key[key].value_text,
                    "target": target_by_key[key].value_text,
                }
            )
    return conflicts


async def find_site_merge_candidates(
    db: AsyncSession,
    *,
    source: Site,
    current_user: User,
    search: str | None = None,
) -> list[tuple[Site, int]]:
    """Return only active sites in the caller's operational perimeter."""
    job_count = (
        select(func.count(Job.id))
        .where(Job.site_id == Site.id, Job.deleted_at.is_(None))
        .correlate(Site)
        .scalar_subquery()
    )
    statement = (
        select(Site, job_count.label("job_count"))
        .join(Job, Job.site_id == Site.id)
        .where(
            Site.id != source.id,
            Site.is_active.is_(True),
            Site.merged_into_site_id.is_(None),
            Job.deleted_at.is_(None),
            func.coalesce(Site.client_organization_id, 0)
            == (source.client_organization_id or 0),
        )
        .distinct()
        .order_by(Site.updated_at.desc(), Site.id.desc())
        .limit(SITE_MERGE_SEARCH_LIMIT)
    )
    if source.operator:
        statement = statement.where(
            or_(Site.operator.is_(None), func.lower(Site.operator) == source.operator.lower())
        )
    if current_user.role == UserRole.ORIENTEUR:
        statement = statement.where(Job.orienteur_id == current_user.orienteur_id)
    cleaned_search = _clean(search)
    if cleaned_search:
        pattern = f"%{cleaned_search}%"
        statement = statement.where(
            or_(
                Site.public_id.ilike(pattern),
                Site.address_snapshot.ilike(pattern),
                Site.city_snapshot.ilike(pattern),
                Site.pto_reference.ilike(pattern),
                Site.pbo_reference.ilike(pattern),
            )
        )
    rows = (await db.execute(statement)).all()
    return [(row[0], int(row[1] or 0)) for row in rows]


def _site_snapshot(site: Site) -> dict:
    return {
        "id": site.id,
        "public_id": site.public_id,
        "revision": site.revision,
        "client_organization_id": site.client_organization_id,
        "operator": site.operator,
        "pto_id": site.pto_id,
        "pbo_id": site.pbo_id,
        "pto_reference": site.pto_reference,
        "pbo_reference": site.pbo_reference,
        "address_snapshot": site.address_snapshot,
        "city_snapshot": site.city_snapshot,
        "zip_snapshot": site.zip_snapshot,
        "canonical_latitude": site.canonical_latitude,
        "canonical_longitude": site.canonical_longitude,
        "canonical_accuracy_m": site.canonical_accuracy_m,
        "location_source": site.location_source,
    }


async def merge_sites(
    db: AsyncSession,
    *,
    source_site_id: int,
    target_site_id: int,
    expected_source_revision: int,
    expected_target_revision: int,
    reason: str,
    current_user: User,
) -> tuple[Site, SiteMergeRecord, list[int]]:
    """Merge an explicitly verified duplicate site without deleting its audit row."""
    if source_site_id == target_site_id:
        raise BusinessAPIError(422, "site_merge_same_site", "Choisissez un autre site cible")

    sites = (
        await db.execute(
            select(Site)
            .where(Site.id.in_([source_site_id, target_site_id]))
            .with_for_update()
        )
    ).scalars().all()
    by_id = {site.id: site for site in sites}
    source = by_id.get(source_site_id)
    target = by_id.get(target_site_id)
    if source is None or target is None:
        raise BusinessAPIError(404, "site_not_found", "Site source ou cible introuvable")
    if not source.is_active or source.merged_into_site_id is not None:
        raise BusinessAPIError(409, "site_already_merged", "Le site source a déjà été fusionné")
    if not target.is_active or target.merged_into_site_id is not None:
        raise BusinessAPIError(409, "site_target_unavailable", "Le site cible n'est plus actif")
    if source.revision != expected_source_revision or target.revision != expected_target_revision:
        raise BusinessAPIError(
            409,
            "site_revision_conflict",
            "Un des sites a changé. Rechargez les données avant de confirmer.",
        )

    attributes = (
        await db.execute(
            select(SiteResolvedAttribute).where(
                SiteResolvedAttribute.site_id.in_([source.id, target.id])
            )
        )
    ).scalars().all()
    source_attributes = [item for item in attributes if item.site_id == source.id]
    target_attributes = [item for item in attributes if item.site_id == target.id]
    conflicts = site_merge_conflicts(
        source,
        target,
        source_attributes=source_attributes,
        target_attributes=target_attributes,
    )
    if conflicts:
        raise BusinessAPIError(
            409,
            "site_merge_conflict",
            "La fusion est bloquée par des données canoniques incompatibles.",
            details={"conflicts": conflicts},
        )

    now = datetime.now(timezone.utc)
    source_snapshot = _site_snapshot(source)
    target_snapshot = _site_snapshot(target)
    target_revision_before = target.revision
    target_keys = {item.attribute_key for item in target_attributes}
    moved_attribute_ids: list[int] = []
    for item in source_attributes:
        if item.attribute_key not in target_keys:
            item.site_id = target.id
            moved_attribute_ids.append(item.id)

    jobs = (
        await db.execute(select(Job).where(Job.site_id == source.id).with_for_update())
    ).scalars().all()
    moved_job_ids = [job.id for job in jobs]
    for job in jobs:
        job.site_id = target.id

    observations = (
        await db.execute(
            select(JobSiteObservation).where(JobSiteObservation.site_id == source.id)
        )
    ).scalars().all()
    for observation in observations:
        observation.site_id = target.id
    attribute_observations = (
        await db.execute(
            select(SiteAttributeObservation).where(
                SiteAttributeObservation.site_id == source.id
            )
        )
    ).scalars().all()
    for observation in attribute_observations:
        observation.site_id = target.id

    # Promote only missing facts. Compatible target facts always remain authoritative.
    for field in (
        "client_organization_id",
        "operator",
        "pbo_id",
        "pto_reference",
        "pbo_reference",
        "address_snapshot",
        "city_snapshot",
        "zip_snapshot",
    ):
        if getattr(target, field) is None and getattr(source, field) is not None:
            setattr(target, field, getattr(source, field))
    if target.pto_id is None and source.pto_id is not None:
        source_pto_id = source.pto_id
        source.pto_id = None  # Preserve the database-wide canonical PTO uniqueness.
        await db.flush()
        target.pto_id = source_pto_id
    if target.canonical_latitude is None and source.canonical_latitude is not None:
        target.canonical_latitude = source.canonical_latitude
        target.canonical_longitude = source.canonical_longitude
        target.canonical_accuracy_m = source.canonical_accuracy_m
        target.location_source = source.location_source
        target.resolved_observation_id = source.resolved_observation_id
        target.resolved_by_user_id = source.resolved_by_user_id
        target.resolved_at = source.resolved_at

    target.revision += 1
    target.updated_at = now
    source.revision += 1
    source.is_active = False
    source.merged_into_site_id = target.id
    source.merged_at = now
    source.merged_by_user_id = current_user.id
    source.merge_reason = reason
    source.updated_at = now

    record = SiteMergeRecord(
        source_site_id=source.id,
        target_site_id=target.id,
        merged_by_user_id=current_user.id,
        reason=reason,
        source_revision=expected_source_revision,
        target_revision_before=target_revision_before,
        target_revision_after=target.revision,
        snapshot={
            "source": source_snapshot,
            "target_before": target_snapshot,
            "moved_job_ids": moved_job_ids,
            "moved_location_observation_ids": [item.id for item in observations],
            "moved_attribute_observation_ids": [item.id for item in attribute_observations],
            "moved_resolved_attribute_ids": moved_attribute_ids,
        },
    )
    db.add(record)
    await db.flush()
    return target, record, moved_job_ids


def site_dict(site: Site | None) -> dict | None:
    if site is None:
        return None
    return {
        "id": site.id,
        "public_id": site.public_id,
        "revision": site.revision,
        "match_basis": site.match_basis,
        "match_confidence": site.match_confidence,
        "is_active": site.is_active,
        "merged_into_site_id": site.merged_into_site_id,
        "merged_at": site.merged_at,
        "operator": site.operator,
        "pto_id": site.pto_id,
        "pto_reference": site.pto_reference,
        "pbo_id": site.pbo_id,
        "pbo_reference": site.pbo_reference,
        "address_snapshot": site.address_snapshot,
        "city_snapshot": site.city_snapshot,
        "zip_snapshot": site.zip_snapshot,
        "canonical_location": (
            {
                "latitude": site.canonical_latitude,
                "longitude": site.canonical_longitude,
                "accuracy_m": site.canonical_accuracy_m,
                "source": site.location_source,
                "resolved_observation_id": site.resolved_observation_id,
                "resolved_by_user_id": site.resolved_by_user_id,
                "resolved_at": site.resolved_at,
            }
            if site.canonical_latitude is not None and site.canonical_longitude is not None
            else None
        ),
    }
