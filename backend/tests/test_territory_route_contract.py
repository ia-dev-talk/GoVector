from backend.api.main import app


def _methods(path: str) -> set[str]:
    return {
        method
        for route in app.routes
        if route.path == path
        for method in (route.methods or set())
    }


def test_territory_hierarchy_is_mounted_at_frontend_contract_paths():
    assert {"GET", "POST"}.issubset(_methods("/api/v1/territories"))
    assert {"PUT", "DELETE"}.issubset(
        _methods("/api/v1/territories/{territory_id}")
    )
    assert "GET" in _methods("/api/v1/territories/geojson")
    assert "POST" in _methods("/api/v1/territories/import-geojson")


def test_territory_routes_are_not_hidden_below_legacy_sectors_prefix():
    assert not any(
        route.path.startswith("/api/v1/sectors/territories")
        for route in app.routes
    )
