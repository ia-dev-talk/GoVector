from types import SimpleNamespace

import pytest

from backend.database.models import EquipmentInventory
from backend.logic import technician_serialized_custody as custody


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


class _FakeDb:
    def __init__(self, rows):
        self.rows = rows

    async def execute(self, _statement):
        return _Result(self.rows)


def _inventory(*, inventory_id, serial, warehouse=None, vehicle=None, status="STOCK", job_id=None):
    return EquipmentInventory(
        id=inventory_id,
        serial_number=serial,
        mac_address=f"AA:BB:CC:DD:EE:{inventory_id:02d}",
        operator="IAM",
        equipment_type="ONT",
        model="TEST",
        status=status,
        warehouse=warehouse,
        vehicle=vehicle,
        assigned_job_id=job_id,
    )


@pytest.mark.asyncio
async def test_serialized_custody_returns_only_exact_authenticated_markers(monkeypatch):
    warehouse = SimpleNamespace(id=44, code="TECH-7", name="Technicien 7 · Demo")

    async def fake_warehouse(_db, *, technician_id, lock=False):
        assert technician_id == 7
        return warehouse

    monkeypatch.setattr(custody, "get_technician_warehouse", fake_warehouse)
    rows = [
        _inventory(inventory_id=1, serial="OWN-CODE", warehouse="TECH-7"),
        _inventory(inventory_id=2, serial="OWN-NAME", vehicle="Technicien 7 · Demo", status="IN_USE", job_id=91),
        _inventory(inventory_id=3, serial="OTHER", warehouse="TECH-8"),
        _inventory(inventory_id=4, serial="SIMILAR-NOT-EXACT", warehouse="TECH-70"),
    ]

    payload = await custody.technician_serialized_custody_payload(
        _FakeDb(rows), technician_id=7
    )

    assert [row["serial_number"] for row in payload] == ["OWN-CODE", "OWN-NAME"]
    assert payload[0]["custody_verified"] is True
    assert payload[0]["custody_warehouse_code"] == "TECH-7"
    assert payload[1]["assigned_job_id"] == 91


@pytest.mark.asyncio
async def test_serialized_custody_supports_legacy_numeric_marker(monkeypatch):
    async def fake_warehouse(_db, *, technician_id, lock=False):
        return None

    monkeypatch.setattr(custody, "get_technician_warehouse", fake_warehouse)
    payload = await custody.technician_serialized_custody_payload(
        _FakeDb([_inventory(inventory_id=5, serial="LEGACY", vehicle="7")]),
        technician_id=7,
    )

    assert len(payload) == 1
    assert payload[0]["serial_number"] == "LEGACY"
    assert payload[0]["custody_warehouse_id"] is None
