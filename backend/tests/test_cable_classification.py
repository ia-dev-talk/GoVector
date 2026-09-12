from types import SimpleNamespace

import pytest

from backend.logic.cable_classification import (
    is_cable_catalog_item,
    normalize_cable_capture_payload,
    normalize_installation_mode,
    normalize_pilot_cable_code,
)
from backend.logic.cable_drums import validate_consumption_marks
from backend.logic import cable_drums
from backend.logic.technician_jobs import TechnicianJobMutationError


def _item(**overrides):
    values = {"reference": "FO16", "label": "Câble FO16", "equipment_type": "CABLE_FTTH", "unit": "m"}
    values.update(overrides)
    return SimpleNamespace(**values)


def test_cable_catalog_item_accepts_cable_type_or_meter_unit():
    assert is_cable_catalog_item(_item(equipment_type="CABLE_FTTH", unit="unité"))
    assert is_cable_catalog_item(_item(equipment_type="CONSOMMABLE", unit="mètre"))
    assert not is_cable_catalog_item(_item(equipment_type="ROUTEUR", unit="unité"))


@pytest.mark.parametrize(("raw", "expected"), [
    ("SP", ("SP", "SP — Sous PEHD / conduite / souterrain")),
    ("PEHD", ("SP", "SP — Sous PEHD / conduite / souterrain")),
    ("TR", ("TR", "TR — Travée / Tronçon / aérien")),
    ("aérien", ("TR", "TR — Travée / Tronçon / aérien")),
    ("FSD", ("FSD", "FSD — Façade / Sous-Dalle / immeuble")),
    ("façade", ("FSD", "FSD — Façade / Sous-Dalle / immeuble")),
])
def test_installation_mode_is_normalized(raw, expected):
    assert normalize_installation_mode(raw) == expected


@pytest.mark.parametrize("raw", ["AUTRE", "inconnu"])
def test_unknown_installation_mode_fails_closed(raw):
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        normalize_installation_mode(raw)
    assert exc_info.value.code == "invalid_installation_mode"


def test_only_fo16_and_fo64_are_accepted():
    assert normalize_pilot_cable_code("FO16") == "FO16"
    assert normalize_pilot_cable_code("fo64") == "FO64"
    with pytest.raises(TechnicianJobMutationError):
        normalize_pilot_cable_code("FO96")


def test_decreasing_counter_calculates_consumption():
    assert validate_consumption_marks(2003, 1921) == (2003.0, 1921.0, 82.0)
    assert validate_consumption_marks(1921, 1771) == (1921.0, 1771.0, 150.0)
    assert validate_consumption_marks(1320, 1264) == (1320.0, 1264.0, 56.0)


@pytest.mark.parametrize("start,end", [(100, 101), (100, 100), (-1, 0)])
def test_negative_or_zero_consumption_is_rejected(start, end):
    with pytest.raises(TechnicianJobMutationError):
        validate_consumption_marks(start, end)


class _Db:
    def __init__(self, drum):
        self.drum = drum

    async def scalar(self, _statement):
        return self.drum


@pytest.mark.asyncio
async def test_capture_uses_assigned_physical_code_and_exact_mode():
    drum = SimpleNamespace(id=4, code="4475", cable_type="FO16", current_mark_m=2003.0, status="ACTIVE", assigned_technician_id=7)
    payload = {"cable_code": "4475", "cable_type_code": "FO16", "installation_mode_code": "SP", "meter_mark_m": 2003}
    await normalize_cable_capture_payload(_Db(drum), payload=payload, current_user=SimpleNamespace(technician_id=7), event_type="cable_entry")
    assert payload["cable_capture_schema"] == 4
    assert payload["cable_reference"] == "4475"
    assert payload["cable_type_code"] == "FO16"
    assert payload["installation_mode_code"] == "SP"
    assert payload["stock_reconciliation_required"] is False


@pytest.mark.asyncio
async def test_capture_blocks_another_technician():
    drum = SimpleNamespace(id=4, code="4475", cable_type="FO16", current_mark_m=2003.0, status="ACTIVE", assigned_technician_id=8)
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await normalize_cable_capture_payload(
            _Db(drum), payload={"cable_code": "4475", "cable_type_code": "FO16", "installation_mode_code": "SP", "meter_mark_m": 2003},
            current_user=SimpleNamespace(technician_id=7), event_type="cable_entry",
        )
    assert exc_info.value.code == "cable_not_assigned"


@pytest.mark.asyncio
async def test_continuity_mismatch_requires_justification():
    drum = SimpleNamespace(id=4, code="4475", cable_type="FO16", current_mark_m=1921.0, status="ACTIVE", assigned_technician_id=7)
    payload = {"cable_code": "4475", "cable_type_code": "FO16", "installation_mode_code": "TR", "meter_mark_m": 1900}
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await normalize_cable_capture_payload(_Db(drum), payload=payload, current_user=SimpleNamespace(technician_id=7), event_type="cable_entry")
    assert exc_info.value.code == "cable_continuity_mismatch"
    payload["continuity_justification"] = "Repère corrigé après contrôle physique"
    await normalize_cable_capture_payload(_Db(drum), payload=payload, current_user=SimpleNamespace(technician_id=7), event_type="cable_entry")


class _ConsumptionDb:
    def __init__(self, drum):
        self.drum = drum
        self.added = []
        self._scalar_calls = 0

    async def scalar(self, _statement):
        self._scalar_calls += 1
        # Per call: idempotency lookup, then locked drum lookup.
        return None if self._scalar_calls % 2 == 1 else self.drum

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        return None


@pytest.mark.asyncio
async def test_code_4475_two_consumptions_keep_remainder_and_total(monkeypatch):
    async def fake_visit(*_args, **_kwargs):
        return SimpleNamespace(id=91)

    monkeypatch.setattr(cable_drums, "resolve_visit_for_technician", fake_visit)
    drum = SimpleNamespace(id=4, code="4475", cable_type="FO16", current_mark_m=2003.0, status="ACTIVE", assigned_technician_id=7)
    db = _ConsumptionDb(drum)
    common = {"cable_code": "4475", "cable_type_code": "FO16", "installation_mode_code": "SP"}
    first = await cable_drums.record_consumption(db, event_id="event-1", job_id=10, technician_id=7, payload={**common, "cable_entry_meter_m": 2003, "cable_exit_meter_m": 1921}, occurred_at=None)
    second = await cable_drums.record_consumption(db, event_id="event-2", job_id=11, technician_id=7, payload={**common, "cable_entry_meter_m": 1921, "cable_exit_meter_m": 1771}, occurred_at=None)
    assert first.quantity_m == 82
    assert second.quantity_m == 150
    assert first.quantity_m + second.quantity_m == 232
    assert drum.current_mark_m == 1771


@pytest.mark.asyncio
async def test_code_9281_consumes_56_meters(monkeypatch):
    async def fake_visit(*_args, **_kwargs):
        return None

    monkeypatch.setattr(cable_drums, "resolve_visit_for_technician", fake_visit)
    drum = SimpleNamespace(id=5, code="9281", cable_type="FO64", current_mark_m=1320.0, status="ACTIVE", assigned_technician_id=8)
    item = await cable_drums.record_consumption(
        _ConsumptionDb(drum), event_id="event-9281", job_id=12, technician_id=8,
        payload={"cable_code": "9281", "cable_type_code": "FO64", "installation_mode_code": "TR", "cable_entry_meter_m": 1320, "cable_exit_meter_m": 1264},
        occurred_at=None,
    )
    assert item.quantity_m == 56
    assert drum.current_mark_m == 1264
