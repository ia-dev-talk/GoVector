from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.api.main import app
from backend.api.routes import stock, stock_ftth
from backend.api.schemas.stock import (
    InventoryCountCreate,
    StockConsumptionCreate,
    StockReturnCreate,
)
from backend.auth.dependencies import require_internal_user
from backend.database.models import UserRole


def _dependency_names(route):
    return {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }


def _route(router, path, method):
    return next(
        route
        for route in router.routes
        if route.path == path and method in (route.methods or set())
    )


def test_stock_paths_are_unambiguous_and_keep_legacy_contract():
    legacy_gets = [
        route
        for route in app.routes
        if route.path == "/api/v1/stock"
        and "GET" in (route.methods or set())
    ]
    assert len(legacy_gets) == 1
    assert legacy_gets[0].endpoint is stock.get_stock

    ftth_lines = [
        route
        for route in app.routes
        if route.path == "/api/v1/stock/lines"
        and "GET" in (route.methods or set())
    ]
    assert len(ftth_lines) == 1
    assert ftth_lines[0].endpoint is stock_ftth.get_stock


def test_stock_reads_require_internal_identity_and_mutations_require_dispatch():
    assert "require_internal_user" in _dependency_names(
        _route(stock.router, "/stock", "GET")
    )
    assert "require_orienteur_or_above" in _dependency_names(
        _route(stock.router, "/stock", "POST")
    )
    assert "require_internal_user" in _dependency_names(
        _route(stock_ftth.router, "/api/v1/stock-ftth/warehouses", "GET")
    )
    assert "require_orienteur_or_above" in _dependency_names(
        _route(stock_ftth.router, "/api/v1/stock-ftth/returns", "POST")
    )
    assert "require_orienteur_or_above" in _dependency_names(
        _route(stock_ftth.simple_router, "/api/v1/stock/adjustment", "POST")
    )


@pytest.mark.asyncio
async def test_client_accounts_cannot_read_internal_stock():
    with pytest.raises(HTTPException) as denied:
        await require_internal_user(
            SimpleNamespace(role=UserRole.CLIENT)
        )
    assert denied.value.status_code == 403

    internal = SimpleNamespace(role=UserRole.TECHNICIAN)
    assert await require_internal_user(internal) is internal


@pytest.mark.parametrize(
    ("schema", "payload", "actor_field"),
    [
        (
            StockReturnCreate,
            {"warehouse_id": 1, "items": [{"item_id": 2, "quantity": 1}]},
            "returned_by",
        ),
        (
            StockConsumptionCreate,
            {"items": [{"item_id": 2, "quantity": 1}]},
            "created_by",
        ),
        (
            InventoryCountCreate,
            {"warehouse_id": 1},
            "counted_by",
        ),
    ],
)
def test_stock_actor_identity_cannot_be_supplied_by_clients(
    schema, payload, actor_field
):
    with pytest.raises(ValidationError):
        schema(**payload, **{actor_field: 999})


def test_stock_consumption_visit_identity_is_server_owned():
    with pytest.raises(ValidationError):
        StockConsumptionCreate(
            visit_id=999,
            items=[{"item_id": 2, "quantity": 1}],
        )


@pytest.mark.parametrize(
    "payload",
    ["not-json", "{}", "[]", '[{"item_id": 1}, 2]'],
)
def test_compatibility_stock_items_reject_invalid_shapes(payload):
    with pytest.raises(HTTPException) as invalid:
        stock_ftth._parse_stock_items(payload)
    assert invalid.value.status_code == 422


def test_compatibility_stock_items_accept_non_empty_object_array():
    assert stock_ftth._parse_stock_items(
        '[{"item_id": 1, "quantity": 2}]'
    ) == [{"item_id": 1, "quantity": 2}]
