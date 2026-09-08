from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.qfield import service


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeDb:
    def __init__(self, *, dataset=None, rows=None):
        self.dataset = dataset
        self.rows = rows or []
        self.added = []
        self.commits = 0
        self.flushes = 0

    async def get(self, model, key):
        return self.dataset

    async def scalar(self, statement):
        return self.dataset

    async def execute(self, statement):
        return FakeResult(self.rows)

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        self.flushes += 1

    async def commit(self):
        self.commits += 1


def feature_obj(**overrides):
    values = {
        "id": 9,
        "public_id": "feature-public-9",
        "layer_id": 3,
        "name": "PBO 9",
        "asset_type": "PBO",
        "status": "ACTIVE",
        "attributes_json": {"capacity": 8},
        "geometry_geojson": {"type": "Point", "coordinates": [-7.62, 33.59]},
        "geometry_type": "Point",
        "bbox_json": {"bounds": [-7.62, 33.59, -7.62, 33.59]},
        "bbox_min_longitude": -7.62,
        "bbox_min_latitude": 33.59,
        "bbox_max_longitude": -7.62,
        "bbox_max_latitude": 33.59,
        "centroid_longitude": None,
        "centroid_latitude": None,
        "provenance_json": {},
        "revision": 2,
        "updated_at": datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc),
        "updated_by_user_id": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def layer_obj():
    return SimpleNamespace(id=3, public_id="layer-public-3", dataset_id=5)


def dataset_obj():
    return SimpleNamespace(
        id=5,
        public_id="dataset-public-5",
        status="PUBLISHED",
        revision=7,
        bbox_json={"bounds": [-7.62, 33.59, -7.62, 33.59]},
        updated_at=datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc),
    )


def test_business_properties_keep_core_and_user_attributes_separate():
    feature = feature_obj(
        attributes_json={
            "capacity": 8,
            "name": "must-not-override-core",
            "_bv_revision": 999,
        }
    )
    props = service._business_properties(feature)
    assert props == {
        "name": "PBO 9",
        "asset_type": "PBO",
        "status": "ACTIVE",
        "capacity": 8,
    }


def test_split_properties_does_not_persist_sync_metadata():
    name, asset_type, status, attributes = service._split_properties(
        {
            "name": "PBO modifié",
            "asset_type": "PBO",
            "status": "ACTIVE",
            "capacity": 16,
            "_bv_uuid": "ignored",
        }
    )
    assert name == "PBO modifié"
    assert asset_type == "PBO"
    assert status == "ACTIVE"
    assert attributes == {"capacity": 16}


def test_normalize_incoming_reuses_hardened_geojson_validation():
    incoming = {
        "type": "Feature",
        "id": "x",
        "geometry": {"type": "LineString", "coordinates": [[-7.62, 33.59], [-7.61, 33.60]]},
        "properties": {"name": "route", "_bv_uuid": "metadata-is-data-here"},
    }
    geometry, properties = service._normalize_incoming_feature(incoming)
    assert geometry["type"] == "LineString"
    assert properties == {"name": "route"}


@pytest.mark.asyncio
async def test_export_dataset_emits_revision_safe_contract():
    feature = feature_obj()
    layer = layer_obj()
    db = FakeDb(dataset=dataset_obj(), rows=[(feature, layer)])

    result = await service.export_dataset(db, dataset_id=5)

    assert result["bluevector"]["contract"] == "qfield-sync-v1"
    assert result["bluevector"]["dataset_revision"] == 7
    exported = result["features"][0]
    assert exported["properties"]["_bv_revision"] == 2
    assert exported["properties"]["_bv_layer"] == "geo-layer:layer-public-3"
    assert exported["properties"]["capacity"] == 8


@pytest.mark.asyncio
async def test_apply_is_all_or_nothing_when_one_feature_conflicts(monkeypatch):
    db = FakeDb(dataset=dataset_obj())
    incoming = {"fake": True}
    feature = feature_obj()
    layer = layer_obj()

    monkeypatch.setattr(service, "_validate_collection", lambda collection: [incoming])

    async def inspect(*args, **kwargs):
        return feature, layer, "conflict_source_changed"

    monkeypatch.setattr(service, "_inspect_one", inspect)

    with pytest.raises(service.QFieldSyncError) as error:
        await service.apply_changes(
            db,
            dataset_id=5,
            collection={"type": "FeatureCollection", "features": []},
            user=SimpleNamespace(id=4),
        )

    assert error.value.status_code == 409
    assert error.value.code == "sync_conflict"
    assert db.commits == 0
    assert feature.revision == 2


@pytest.mark.asyncio
async def test_apply_clean_feature_increments_feature_and_dataset_revision(monkeypatch):
    dataset = dataset_obj()
    db = FakeDb(dataset=dataset)
    incoming = {"fake": True}
    feature = feature_obj()
    layer = layer_obj()

    monkeypatch.setattr(service, "_validate_collection", lambda collection: [incoming])

    async def inspect(*args, **kwargs):
        return feature, layer, "apply"

    async def refresh_bounds(db_arg, *, dataset):
        dataset.bbox_json = {"bounds": [-7.6, 33.61, -7.6, 33.61]}

    monkeypatch.setattr(service, "_inspect_one", inspect)
    monkeypatch.setattr(service, "_refresh_dataset_bounds", refresh_bounds)
    monkeypatch.setattr(
        service,
        "_normalize_incoming_feature",
        lambda value: (
            {"type": "Point", "coordinates": [-7.60, 33.61]},
            {
                "name": "PBO terrain",
                "asset_type": "PBO",
                "status": "ACTIVE",
                "capacity": 16,
            },
        ),
    )

    result = await service.apply_changes(
        db,
        dataset_id=5,
        collection={"type": "FeatureCollection", "features": []},
        user=SimpleNamespace(id=4),
    )

    assert result["status"] == "applied"
    assert result["applied_count"] == 1
    assert feature.revision == 3
    assert dataset.revision == 8
    assert dataset.bbox_json == {"bounds": [-7.6, 33.61, -7.6, 33.61]}
    assert feature.name == "PBO terrain"
    assert feature.attributes_json == {"capacity": 16}
    assert feature.bbox_json["bounds"] == [-7.6, 33.61, -7.6, 33.61]
    assert feature.updated_by_user_id == 4
    assert db.flushes == 1
    assert db.commits == 1
    assert len(db.added) == 1
