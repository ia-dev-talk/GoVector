from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.database.models import (
    Job,
    JobSiteObservation,
    Site,
    SiteAttributeObservation,
    SiteMergeRecord,
    SiteResolvedAttribute,
)
from backend.logic.site_registry import merge_sites, site_merge_conflicts


def _site(site_id: int, **values) -> Site:
    defaults = {
        "id": site_id,
        "public_id": f"site-{site_id}",
        "revision": 2,
        "match_basis": "manual_verified",
        "match_confidence": "high",
        "is_active": True,
        "merged_into_site_id": None,
        "client_organization_id": 7,
        "operator": "Orange",
        "canonical_latitude": 33.54789,
        "canonical_longitude": -7.59582,
        "canonical_accuracy_m": 4.0,
    }
    defaults.update(values)
    return Site(**defaults)


def test_site_merge_preflight_blocks_canonical_disagreement():
    source = _site(10, pto_reference="PTO-A")
    target = _site(
        20,
        pto_reference="PTO-B",
        canonical_latitude=33.55789,
        canonical_longitude=-7.58582,
    )
    source_attribute = SiteResolvedAttribute(
        id=1,
        site_id=source.id,
        attribute_key="ont_serial",
        value_text="ONT-A",
        normalized_value="ONT-A",
        resolved_at=datetime.now(timezone.utc),
    )
    target_attribute = SiteResolvedAttribute(
        id=2,
        site_id=target.id,
        attribute_key="ont_serial",
        value_text="ONT-B",
        normalized_value="ONT-B",
        resolved_at=datetime.now(timezone.utc),
    )

    conflicts = site_merge_conflicts(
        source,
        target,
        source_attributes=[source_attribute],
        target_attributes=[target_attribute],
    )

    assert {item["field"] for item in conflicts} == {
        "pto_reference",
        "canonical_location",
        "ont_serial",
    }


def test_site_merge_preflight_accepts_missing_or_corroborating_values():
    source = _site(10, pto_reference=" pto-a ")
    target = _site(
        20,
        pto_reference="PTO-A",
        canonical_latitude=33.54790,
        canonical_longitude=-7.59581,
        operator=None,
    )
    assert site_merge_conflicts(source, target) == []


class _Rows:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return list(self.values)


class _MergeDb:
    def __init__(self, result_sets):
        self.result_sets = list(result_sets)
        self.added = []
        self.flush = AsyncMock()

    async def execute(self, _statement):
        return _Rows(self.result_sets.pop(0))

    def add(self, value):
        self.added.append(value)


@pytest.mark.asyncio
async def test_manual_merge_moves_business_links_and_preserves_source_audit():
    source = _site(
        10,
        pto_id=31,
        pto_reference="PTO-A",
        address_snapshot="Ancienne fiche terrain",
    )
    target = _site(
        20,
        revision=5,
        pto_id=None,
        pto_reference="PTO-A",
        address_snapshot="Adresse bureau vérifiée",
    )
    job = Job(id=8, site_id=source.id)
    location = JobSiteObservation(
        id=41,
        job_id=job.id,
        site_id=source.id,
        observation_type="site_location",
        latitude=33.54789,
        longitude=-7.59582,
        user_id=3,
        technician_id=3,
        occurred_at=datetime.now(timezone.utc),
    )
    attribute_observation = SiteAttributeObservation(
        id=51,
        site_id=source.id,
        job_id=job.id,
        field_action_id=61,
        attribute_key="ont_serial",
        value_text="ONT-1",
        normalized_value="ONT-1",
        user_id=3,
        technician_id=3,
        base_site_revision=2,
        occurred_at=datetime.now(timezone.utc),
    )
    resolved_attribute = SiteResolvedAttribute(
        id=71,
        site_id=source.id,
        attribute_key="ont_serial",
        value_text="ONT-1",
        normalized_value="ONT-1",
        resolved_at=datetime.now(timezone.utc),
    )
    db = _MergeDb(
        [
            [source, target],
            [resolved_attribute],
            [job],
            [location],
            [attribute_observation],
        ]
    )

    merged, record, moved_job_ids = await merge_sites(
        db,
        source_site_id=source.id,
        target_site_id=target.id,
        expected_source_revision=2,
        expected_target_revision=5,
        reason="Même PTO vérifié par l'orienteur",
        current_user=SimpleNamespace(id=9),
    )

    assert merged is target
    assert moved_job_ids == [job.id]
    assert job.site_id == target.id
    assert location.site_id == target.id
    assert attribute_observation.site_id == target.id
    assert resolved_attribute.site_id == target.id
    assert target.pto_id == 31
    assert source.pto_id is None
    assert source.is_active is False
    assert source.merged_into_site_id == target.id
    assert source.merge_reason == "Même PTO vérifié par l'orienteur"
    assert target.revision == 6
    assert isinstance(record, SiteMergeRecord)
    assert record.snapshot["source"]["pto_id"] == 31
    assert record.snapshot["moved_job_ids"] == [job.id]
    assert db.added == [record]
