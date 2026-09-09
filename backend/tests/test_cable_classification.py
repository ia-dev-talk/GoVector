from types import SimpleNamespace

import pytest

from backend.logic import cable_classification
from backend.logic.cable_classification import (
    is_cable_catalog_item,
    normalize_cable_capture_payload,
    normalize_installation_mode,
)
from backend.logic.technician_jobs import TechnicianJobMutationError


def _item(**overrides):
    values = {
        "id": 12,
        "reference": "CABLE-FO-2F",
        "label": "Câble fibre 2FO",
        "equipment_type": "CABLE_FTTH",
        "unit": "m",
        "is_active": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_cable_catalog_item_accepts_cable_type_or_meter_unit():
    assert is_cable_catalog_item(_item(equipment_type="CABLE_FTTH", unit="unité"))
    assert is_cable_catalog_item(_item(equipment_type="CONSOMMABLE", unit="mètre"))
    assert not is_cable_catalog_item(_item(equipment_type="ROUTEUR", unit="unité"))


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("façade", ("FACADE", "Façade / immeuble")),
        ("FACADE", ("FACADE", "Façade / immeuble")),
        ("immeuble", ("FACADE", "Façade / immeuble")),
        ("aérien", ("AERIEN", "Aérien")),
        ("PEHD", ("CONDUITE_PEHD", "Conduite / sous PEHD")),
        ("conduite / sous PEHD", ("CONDUITE_PEHD", "Conduite / sous PEHD")),
        ("AUTRE", ("AUTRE", "Autre")),
    ],
)
def test_installation_mode_is_normalized(raw, expected):
    assert normalize_installation_mode(raw) == expected


def test_unknown_installation_mode_fails_closed():
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        normalize_installation_mode("souterrain-invente")
    assert exc_info.value.code == "invalid_installation_mode"


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _Scalars(self._rows)


class _Db:
    def __init__(self, item, available=120):
        self.item = item
        self.available = available

    async def get(self, model, item_id):
        return self.item if item_id == self.item.id else None

    async def execute(self, statement):
        rows = [] if self.available is None else [SimpleNamespace(available_quantity=self.available)]
        return _Result(rows)


@pytest.mark.asyncio
async def test_capture_is_rebuilt_from_authoritative_catalogue_and_custody(monkeypatch):
    async def fake_warehouse(db, *, technician_id):
        assert technician_id == 7
        return SimpleNamespace(id=99)

    monkeypatch.setattr(
        cable_classification,
        "get_technician_warehouse",
        fake_warehouse,
    )
    db = _Db(_item(), available=87)
    payload = {
        "cable_item_id": 12,
        "cable_reference": "FORGED",
        "cable_type_label": "FORGED",
        "installation_mode_code": "façade",
    }

    await normalize_cable_capture_payload(
        db,
        payload=payload,
        current_user=SimpleNamespace(technician_id=7),
    )

    assert payload["cable_capture_schema"] == 2
    assert payload["cable_reference"] == "CABLE-FO-2F"
    assert payload["cable_type_code"] == "CABLE-FO-2F"
    assert payload["cable_type_label"] == "Câble fibre 2FO"
    assert payload["installation_mode_code"] == "FACADE"
    assert payload["installation_mode_label"] == "Façade / immeuble"
    assert payload["cable_stock_available"] == 87
    assert payload["cable_stock_known"] is True
    assert payload["cable_type_source"] == "technician_custody"


@pytest.mark.asyncio
async def test_capture_rejects_non_cable_stock_item(monkeypatch):
    async def fake_warehouse(db, *, technician_id):
        return SimpleNamespace(id=99)

    monkeypatch.setattr(
        cable_classification,
        "get_technician_warehouse",
        fake_warehouse,
    )
    db = _Db(_item(equipment_type="ROUTEUR", unit="unité"))

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await normalize_cable_capture_payload(
            db,
            payload={
                "cable_item_id": 12,
                "installation_mode_code": "AERIEN",
            },
            current_user=SimpleNamespace(technician_id=7),
        )

    assert exc_info.value.code == "stock_item_not_cable"


@pytest.mark.asyncio
async def test_capture_allows_governed_cable_when_technician_stock_is_zero(monkeypatch):
    async def fake_warehouse(db, *, technician_id):
        return SimpleNamespace(id=99)

    monkeypatch.setattr(
        cable_classification,
        "get_technician_warehouse",
        fake_warehouse,
    )
    db = _Db(_item(), available=0)
    payload = {
        "cable_item_id": 12,
        "installation_mode_code": "AERIEN",
    }

    await normalize_cable_capture_payload(
        db,
        payload=payload,
        current_user=SimpleNamespace(technician_id=7),
    )

    assert payload["cable_stock_available"] == 0
    assert payload["cable_stock_known"] is False
    assert payload["cable_type_source"] == "catalogue_observed"


@pytest.mark.asyncio
async def test_capture_allows_governed_cable_without_initialized_technician_warehouse(monkeypatch):
    async def fake_warehouse(db, *, technician_id):
        return None

    monkeypatch.setattr(
        cable_classification,
        "get_technician_warehouse",
        fake_warehouse,
    )
    db = _Db(_item(), available=None)
    payload = {
        "cable_item_id": 12,
        "installation_mode_code": "CONDUITE_PEHD",
    }

    await normalize_cable_capture_payload(
        db,
        payload=payload,
        current_user=SimpleNamespace(technician_id=7),
    )

    assert payload["cable_stock_available"] == 0
    assert payload["cable_stock_registered"] is False
    assert payload["cable_stock_known"] is False
