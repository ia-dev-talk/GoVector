"""Canonical site identity and explicit field-location resolution."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Job, JobSiteObservation, Site, User
from backend.api.errors import BusinessAPIError


SITE_CORROBORATION_RADIUS_M = 20.0
SITE_RESOLUTION_STATUSES = {"unreviewed", "accepted", "conflict", "rejected"}


def _clean(value: str | None) -> str | None:
    cleaned = value.strip() if value else ""
    return cleaned or None


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


def site_dict(site: Site | None) -> dict | None:
    if site is None:
        return None
    return {
        "id": site.id,
        "public_id": site.public_id,
        "revision": site.revision,
        "match_basis": site.match_basis,
        "match_confidence": site.match_confidence,
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
