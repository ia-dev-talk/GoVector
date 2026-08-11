from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.database.models import JobSiteObservation, Site
from backend.logic.site_registry import (
    apply_site_resolution,
    classify_site_location,
    distance_metres,
    find_existing_site_for_job,
    attach_observation_to_site,
)


def _site(**values):
    defaults = {
        "public_id": "site-test",
        "match_basis": "explicit_field_observation",
        "match_confidence": "high",
        "revision": 0,
        "canonical_latitude": None,
        "canonical_longitude": None,
        "canonical_accuracy_m": None,
    }
    defaults.update(values)
    return Site(**defaults)


def _observation(latitude, longitude, *, accuracy=3.0):
    return JobSiteObservation(
        id=12,
        job_id=8,
        observation_type="site_location",
        latitude=latitude,
        longitude=longitude,
        accuracy_m=accuracy,
        user_id=3,
        technician_id=3,
        source="mobile",
        occurred_at=datetime(2026, 8, 11, 10, 0, tzinfo=timezone.utc),
    )


def test_first_explicit_site_fix_becomes_canonical_with_provenance():
    site = _site()
    observation = _observation(33.54789, -7.59582)
    user = SimpleNamespace(id=9)

    assert classify_site_location(site, observation) == "accepted"
    apply_site_resolution(
        site=site,
        observation=observation,
        decision="accepted",
        current_user=user,
        resolved_at=observation.occurred_at,
    )

    assert site.canonical_latitude == pytest.approx(33.54789)
    assert site.resolved_observation_id == observation.id
    assert site.resolved_by_user_id == user.id
    assert site.revision == 1
    assert observation.resolution_status == "accepted"


def test_distant_site_fix_is_a_conflict_and_does_not_overwrite_reference():
    site = _site(
        canonical_latitude=33.54789,
        canonical_longitude=-7.59582,
        canonical_accuracy_m=3.0,
        revision=1,
    )
    nearby = _observation(33.54790, -7.59581)
    distant = _observation(33.55000, -7.59000)

    assert distance_metres(33.54789, -7.59582, 33.54790, -7.59581) < 20
    assert classify_site_location(site, nearby) == "accepted"
    assert classify_site_location(site, distant) == "conflict"
    assert site.canonical_latitude == pytest.approx(33.54789)


class _Candidates:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class _Db:
    def __init__(self, values):
        self.values = values
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Candidates(self.values)


class _ExistingSiteDb:
    def __init__(self, site):
        self.site = site

    async def scalar(self, _statement):
        return self.site


@pytest.mark.asyncio
async def test_exact_structured_address_links_only_one_scoped_candidate():
    candidate = _site(id=44)
    job = SimpleNamespace(
        site_id=None,
        pto_id=None,
        pto_raw=None,
        service_address="Résidence Yahya, appartement 9",
        service_city="Casablanca",
        service_zip="20000",
        operator="Orange",
        client_organization_id=7,
    )
    unique_db = _Db([candidate])
    assert await find_existing_site_for_job(unique_db, job=job) is candidate
    compiled = str(unique_db.statement.compile(compile_kwargs={"literal_binds": True}))
    assert "résidence yahya, appartement 9" in compiled.lower()
    assert "casablanca" in compiled.lower()
    assert "20000" in compiled

    ambiguous_db = _Db([candidate, _site(id=45, public_id="site-other")])
    assert await find_existing_site_for_job(ambiguous_db, job=job) is None


@pytest.mark.asyncio
async def test_nearby_corroboration_does_not_move_canonical_site():
    site = _site(
        id=44,
        canonical_latitude=33.54789,
        canonical_longitude=-7.59582,
        canonical_accuracy_m=3.0,
        revision=1,
        resolved_observation_id=8,
    )
    job = SimpleNamespace(site_id=site.id)
    observation = _observation(33.54790, -7.59581)
    await attach_observation_to_site(
        _ExistingSiteDb(site),
        job=job,
        observation=observation,
        current_user=SimpleNamespace(id=3),
    )

    assert observation.resolution_status == "accepted"
    assert site.canonical_latitude == pytest.approx(33.54789)
    assert site.resolved_observation_id == 8
    assert site.revision == 1
