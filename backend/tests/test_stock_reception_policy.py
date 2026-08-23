"""Contract tests for direct stock reception warehouse policy."""

import inspect
from types import SimpleNamespace

import pytest

from backend.api.routes.stock_ftth import (
    _ensure_direct_reception_warehouse,
    add_reception,
)


def _warehouse(*, warehouse_type="ENTREPOT", is_active=True):
    return SimpleNamespace(
        id=12,
        type=warehouse_type,
        is_active=is_active,
    )


def test_active_non_technician_warehouse_can_receive_direct_reception():
    warehouse = _warehouse(warehouse_type="ENTREPOT", is_active=True)
    assert _ensure_direct_reception_warehouse(warehouse, 12) is warehouse


@pytest.mark.parametrize("warehouse_type", ["TECHNICIEN", "technicien", " TECHNICIEN "])
def test_technician_warehouse_cannot_receive_direct_reception(warehouse_type):
    with pytest.raises(ValueError, match="technician allocation"):
        _ensure_direct_reception_warehouse(
            _warehouse(warehouse_type=warehouse_type),
            12,
        )


def test_inactive_warehouse_cannot_receive_direct_reception():
    with pytest.raises(ValueError, match="inactive"):
        _ensure_direct_reception_warehouse(
            _warehouse(is_active=False),
            12,
        )


def test_missing_warehouse_is_rejected():
    with pytest.raises(ValueError, match="not found"):
        _ensure_direct_reception_warehouse(None, 99)


def test_reception_guard_runs_before_stock_mutation():
    source = inspect.getsource(add_reception)
    guard_position = source.index("_ensure_direct_reception_warehouse(")
    mutation_position = source.index(".add_stock(")
    assert guard_position < mutation_position
