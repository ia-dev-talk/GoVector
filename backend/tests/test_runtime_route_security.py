from collections import defaultdict
from io import BytesIO

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from backend.api.main import app
from backend.api.routes import tech_ocr
from backend.services.ocr.router_sn_scanner import RouterSNScanner


AUTH_DEPENDENCIES = {
    "get_current_user",
    "require_admin",
    "require_chef_orienteur",
    "require_client",
    "require_internal_user",
    "require_orienteur",
    "require_orienteur_or_above",
    "require_technician",
}
PUBLIC_API_ROUTES = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/tech/login"),
}


def _dependency_names(dependant):
    names = set()
    for dependency in getattr(dependant, "dependencies", []):
        if dependency.call is not None:
            names.add(
                getattr(
                    dependency.call,
                    "__name__",
                    dependency.call.__class__.__name__,
                )
            )
        names.update(_dependency_names(dependency))
    return names


def test_api_runtime_has_no_duplicate_method_path_contracts():
    routes_by_contract = defaultdict(list)
    for route in app.routes:
        for method in getattr(route, "methods", None) or set():
            if method not in {"HEAD", "OPTIONS"}:
                routes_by_contract[(method, route.path)].append(route.name)

    duplicates = {
        contract: names
        for contract, names in routes_by_contract.items()
        if len(names) > 1
    }
    assert duplicates == {}


def test_every_runtime_api_route_is_authenticated_unless_explicitly_public():
    unsecured = []
    for route in app.routes:
        methods = (getattr(route, "methods", None) or set()) - {
            "HEAD",
            "OPTIONS",
        }
        if not methods or not route.path.startswith("/api/v1"):
            continue
        dependencies = _dependency_names(route.dependant)
        for method in methods:
            if (method, route.path) in PUBLIC_API_ROUTES:
                continue
            if not dependencies.intersection(AUTH_DEPENDENCIES):
                unsecured.append((method, route.path, route.name))

    assert unsecured == []


def test_technician_ocr_route_is_role_scoped():
    route = next(
        route
        for route in tech_ocr.router.routes
        if route.path == "/scan-router-sn"
    )
    assert "require_technician" in _dependency_names(route.dependant)


@pytest.mark.asyncio
async def test_ocr_never_fabricates_a_serial_when_nothing_is_read(monkeypatch):
    monkeypatch.setattr(
        RouterSNScanner,
        "scan_image",
        classmethod(lambda cls, image_data: ""),
    )
    upload = UploadFile(
        BytesIO(b"real-image-content"),
        filename="router.jpg",
        headers=Headers({"content-type": "image/jpeg"}),
    )

    result = await tech_ocr.scan_router_sn(upload)

    assert result.serial_number is None
    assert result.confidence == 0.0
    assert "pas pu être détecté" in result.message
