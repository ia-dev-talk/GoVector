from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.qfield import service


class ScalarRows:
    def __init__(self, rows):
        self.rows = rows

    def scalars(self):
        return self

    def all(self):
        return self.rows


class RouteProjectionDb:
    def __init__(self, job, *, physical_payloads=None):
        self.job = job
        self.physical_payloads = physical_payloads or []

    async def scalar(self, statement):
        return self.job

    async def execute(self, statement):
        return ScalarRows(self.physical_payloads)


@pytest.mark.asyncio
async def test_explicit_cable_route_projects_geometry_when_no_physical_measurement():
    job = SimpleNamespace(id=42, cable_length_m=None)
    db = RouteProjectionDb(job)
    feature = SimpleNamespace(job_id=42)
    now = datetime(2026, 9, 8, 12, 30, tzinfo=timezone.utc)

    provenance = await service._route_provenance_and_projection(
        db,
        feature=feature,
        geometry={
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [0.001, 0.0]],
        },
        previous_provenance={"bluevector_role": "cable_route"},
        now=now,
    )

    assert provenance["geometry_length_m"] == pytest.approx(111.319, abs=0.2)
    assert provenance["cable_length_projection_state"] == "projected"
    assert provenance["cable_length_projected_job_value_m"] == 111
    assert job.cable_length_m == 111


@pytest.mark.asyncio
async def test_physical_meter_measurement_always_beats_route_geometry():
    job = SimpleNamespace(id=42, cable_length_m=150)
    db = RouteProjectionDb(
        job,
        physical_payloads=[
            {
                "calculation": "absolute_meter_delta",
                "computed_length_m": 150.0,
            }
        ],
    )
    feature = SimpleNamespace(job_id=42)

    provenance = await service._route_provenance_and_projection(
        db,
        feature=feature,
        geometry={
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [0.001, 0.0]],
        },
        previous_provenance={
            "bluevector_role": "cable_route",
            "cable_length_projected_job_value_m": 111,
        },
        now=datetime(2026, 9, 8, 12, 30, tzinfo=timezone.utc),
    )

    assert provenance["cable_length_projection_state"] == "skipped_physical_meter_authoritative"
    assert provenance["cable_length_projection_candidate_m"] == 111
    assert job.cable_length_m == 150


@pytest.mark.asyncio
async def test_existing_non_route_job_value_is_not_overwritten():
    job = SimpleNamespace(id=42, cable_length_m=180)
    db = RouteProjectionDb(job)
    feature = SimpleNamespace(job_id=42)

    provenance = await service._route_provenance_and_projection(
        db,
        feature=feature,
        geometry={
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [0.001, 0.0]],
        },
        previous_provenance={"bluevector_role": "cable_route"},
        now=datetime(2026, 9, 8, 12, 30, tzinfo=timezone.utc),
    )

    assert provenance["cable_length_projection_state"] == "skipped_higher_priority_job_value"
    assert job.cable_length_m == 180


class DesignationDb:
    def __init__(self, *, dataset, feature, layer, job):
        self.scalar_values = [dataset, feature, job, job]
        self.layer = layer
        self.added = []
        self.commits = 0

    async def scalar(self, statement):
        return self.scalar_values.pop(0)

    async def get(self, model, key):
        return self.layer

    async def execute(self, statement):
        return ScalarRows([])

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_admin_designation_links_feature_and_projects_length():
    dataset = SimpleNamespace(
        id=5,
        status="PUBLISHED",
        revision=7,
        updated_at=datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc),
    )
    feature = SimpleNamespace(
        id=9,
        public_id="feature-public-9",
        layer_id=3,
        job_id=None,
        revision=2,
        name="Route câble",
        asset_type="CABLE",
        status="ACTIVE",
        attributes_json={},
        geometry_geojson={
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [0.001, 0.0]],
        },
        geometry_type="LineString",
        provenance_json={},
        updated_by_user_id=None,
        updated_at=datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc),
    )
    layer = SimpleNamespace(id=3, dataset_id=5)
    job = SimpleNamespace(id=42, cable_length_m=None)
    db = DesignationDb(dataset=dataset, feature=feature, layer=layer, job=job)
    user = SimpleNamespace(id=4, username="admin", role="admin")

    result = await service.designate_cable_route(
        db,
        dataset_id=5,
        feature_id=9,
        job_id=42,
        expected_feature_revision=2,
        user=user,
    )

    assert feature.job_id == 42
    assert feature.provenance_json["bluevector_role"] == "cable_route"
    assert feature.revision == 3
    assert dataset.revision == 8
    assert job.cable_length_m == 111
    assert result["projection_state"] == "projected"
    assert result["geometry_length_m"] == pytest.approx(111.319, abs=0.2)
    assert db.commits == 1
    # One GeoFeatureRevision + one OperationalAuditEvent.
    assert len(db.added) == 2
