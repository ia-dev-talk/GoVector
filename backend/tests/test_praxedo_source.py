from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.praxedo import source


class FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalars(self):
        return FakeScalars(self._rows)


class FakeDb:
    def __init__(self, *, job=None, scalar_value=None, rows=None):
        self.job = job
        self.scalar_value = scalar_value
        self.rows = rows or []

    async def get(self, model, key):
        return self.job

    async def scalar(self, statement):
        return self.scalar_value

    async def execute(self, statement):
        return FakeResult(self.rows)


def test_stock_rows_use_available_quantity_only():
    rows = [
        {
            "item_id": 7,
            "reference": "CAB-7",
            "available_quantity": 12,
            "quantity": 20,
            "reserved_quantity": 8,
            "unit": "m",
        }
    ]
    assert source.stock_rows_to_canonical_items(rows, external_ids={7: "PX-CAB-7"}) == [
        {
            "local_item_id": 7,
            "external_id": "PX-CAB-7",
            "sku": "CAB-7",
            "quantity": 12,
            "unit": "m",
        }
    ]


def test_legacy_naive_timestamp_is_treated_as_utc():
    value = datetime(2026, 9, 8, 12, 30)
    normalized = source._aware_utc(value, field="legacy")
    assert normalized.tzinfo == timezone.utc
    assert normalized.hour == 12


@pytest.mark.asyncio
async def test_technician_snapshot_reads_authoritative_custody(monkeypatch):
    async def stock_payload(db, *, technician_id):
        assert technician_id == 4
        return [
            {
                "item_id": 10,
                "reference": "ONT-X",
                "available_quantity": 2,
                "unit": "piece",
            }
        ]

    async def item_refs(db, item_ids):
        assert list(item_ids) == [10]
        return {10: "PX-ITEM-10"}

    async def external_ref(db, **kwargs):
        assert kwargs["entity_type"] == "technician"
        return SimpleNamespace(external_id="PX-TECH-4")

    monkeypatch.setattr(source, "technician_stock_payload", stock_payload)
    monkeypatch.setattr(source, "_item_external_ids", item_refs)
    monkeypatch.setattr(source, "find_external_reference", external_ref)

    payload = await source.build_technician_stock_snapshot(
        FakeDb(),
        technician_id=4,
        captured_at=datetime(2026, 9, 8, 13, 0, tzinfo=timezone.utc),
    )

    assert payload["operation"] == "technician_stock_snapshot"
    assert payload["entity"]["external_id"] == "PX-TECH-4"
    assert payload["body"]["items"][0]["quantity"] == 2
    assert payload["body"]["items"][0]["external_id"] == "PX-ITEM-10"


@pytest.mark.asyncio
async def test_intervention_snapshot_contains_canonical_cable_length(monkeypatch):
    job = SimpleNamespace(
        id=42,
        started_by=4,
        status=SimpleNamespace(value="completed"),
        job_number="BV-42",
        updated_at=datetime(2026, 9, 8, 13, 0, tzinfo=timezone.utc),
        cable_length_m=137,
    )

    async def external_ref(db, **kwargs):
        if kwargs["entity_type"] == "intervention":
            return SimpleNamespace(external_id="PX-JOB-42")
        if kwargs["entity_type"] == "technician":
            return SimpleNamespace(external_id="PX-TECH-4")
        return None

    monkeypatch.setattr(source, "find_external_reference", external_ref)
    payload = await source.build_intervention_snapshot(FakeDb(job=job), job_id=42)

    assert payload["body"]["cable_length_m"] == 137
    assert payload["body"]["technician"]["external_id"] == "PX-TECH-4"
    assert payload["entity"]["external_id"] == "PX-JOB-42"


@pytest.mark.asyncio
async def test_work_report_aggregates_validated_consumption_lines(monkeypatch):
    job = SimpleNamespace(
        id=42,
        started_by=4,
        completed_at=datetime(2026, 9, 8, 14, 0, tzinfo=timezone.utc),
        cable_length_m=137,
    )
    item = SimpleNamespace(id=10, reference="CAB-10", unit="m")
    rows = [
        (SimpleNamespace(id=1, quantity=20), item),
        (SimpleNamespace(id=2, quantity=17), item),
    ]

    async def item_refs(db, item_ids):
        assert set(item_ids) == {10}
        return {10: "PX-CAB-10"}

    async def external_ref(db, **kwargs):
        return SimpleNamespace(external_id="PX-JOB-42")

    monkeypatch.setattr(source, "_item_external_ids", item_refs)
    monkeypatch.setattr(source, "find_external_reference", external_ref)

    payload = await source.build_work_report(FakeDb(job=job, rows=rows), job_id=42)

    assert payload["operation"] == "work_report"
    assert payload["body"]["consumed_items"] == [
        {
            "local_item_id": "10",
            "external_id": "PX-CAB-10",
            "sku": "CAB-10",
            "quantity": 37,
            "unit": "m",
        }
    ]
    assert payload["body"]["cable_length_m"] == 137
