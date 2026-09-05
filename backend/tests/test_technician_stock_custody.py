"""Regression coverage for serialized equipment custody checks."""

import asyncio

import pytest

from backend.database.models import EquipmentInventory
from backend.logic import technician_stock
from backend.logic.technician_jobs import TechnicianJobMutationError


def _serialized_equipment(*, warehouse: str) -> EquipmentInventory:
    return EquipmentInventory(
        serial_number=f"SN-{warehouse}",
        equipment_type="ROUTEUR",
        operator="ORANGE",
        status="STOCK",
        warehouse=warehouse,
    )


def test_custody_match_does_not_confuse_technician_id_prefixes():
    inventory = _serialized_equipment(warehouse="TECH-10")

    assert technician_stock._inventory_custody_matches(
        inventory,
        technician_id=1,
        warehouse=None,
    ) is False


def test_custody_match_accepts_exact_technician_warehouse():
    inventory = _serialized_equipment(warehouse="TECH-1")

    assert technician_stock._inventory_custody_matches(
        inventory,
        technician_id=1,
        warehouse=None,
    ) is True


async def _exercise_direct_apply_rejection(monkeypatch):
    async def fake_resolve_equipment_scan(*args, **kwargs):
        return {
            "confidence": "verified",
            "operator_match": True,
            "in_technician_stock": False,
            "operator": "ORANGE",
            "job_operator": "ORANGE",
            "inventory_id": 123,
            "serial_number": "OUTSIDE-CUSTODY-1",
        }

    class MutationMustNotOccur:
        async def get(self, *args, **kwargs):
            pytest.fail("inventory mutation must not be reached")

        async def flush(self):
            pytest.fail("flush must not be reached")

    monkeypatch.setattr(
        technician_stock,
        "resolve_equipment_scan",
        fake_resolve_equipment_scan,
    )

    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_stock.apply_equipment_scan(
            MutationMustNotOccur(),
            job_id=77,
            payload={"code": "SN=OUTSIDE-CUSTODY-1"},
            current_user=object(),
        )

    assert exc_info.value.status == "conflict"
    assert exc_info.value.code == "equipment_not_in_technician_stock"


def test_direct_apply_rejects_verified_equipment_outside_technician_stock(monkeypatch):
    asyncio.run(_exercise_direct_apply_rejection(monkeypatch))
