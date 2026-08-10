from types import SimpleNamespace

from backend.api.routes import ai_assistant, client_portal, geocoding, v1_admin
from backend.api.schemas.jobs import JobCreate
from backend.database.models import Job, UserRole
from backend.services.excel.validator import ExcelValidator


def _dependency_names(route):
    return {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }


def test_address_only_job_contract_preserves_unknown_values():
    payload = JobCreate(
        job_type="INSTALLATION",
        customer_name=None,
        service_address=None,
        latitude=None,
        longitude=None,
    )

    assert payload.customer_name is None
    assert payload.service_address is None
    assert payload.latitude is None
    assert payload.longitude is None
    assert Job.__table__.c.customer_name.nullable is True
    assert Job.__table__.c.service_address.nullable is True
    assert Job.__table__.c.latitude.nullable is True
    assert Job.__table__.c.longitude.nullable is True


def test_incomplete_excel_context_is_visible_but_not_blocking():
    result = ExcelValidator(
        [
            {
                "job_type": "INSTALLATION",
                "customer_name": None,
                "service_address": None,
                "gps_source": None,
            }
        ]
    ).validate()

    assert result["valid"] == 1
    assert result["invalid"] == 0
    warnings = result["jobs"][0]["_warnings"]
    assert "soft:customer_name" in warnings
    assert "soft:service_address" in warnings
    assert "soft:gps_coordinates" in warnings


def test_client_and_administration_routes_are_role_scoped():
    assert UserRole.CLIENT.value == "CLIENT"

    client_route = next(
        route for route in client_portal.router.routes if route.path == "/overview"
    )
    assert "require_client" in _dependency_names(client_route)

    clients_route = next(
        route
        for route in v1_admin.router.routes
        if route.path == "/clients" and "GET" in (route.methods or set())
    )
    assert "require_admin" in _dependency_names(clients_route)

    teams_route = next(
        route
        for route in v1_admin.router.routes
        if route.path == "/teams" and "GET" in (route.methods or set())
    )
    assert "require_chef_orienteur" in _dependency_names(teams_route)


def test_office_geocoding_never_exposes_an_unscoped_endpoint():
    route = next(route for route in geocoding.router.routes if route.path == "/resolve")
    assert "require_orienteur" in _dependency_names(route)


def test_assistant_is_typo_tolerant_and_client_query_is_organization_scoped():
    assert ai_assistant._intent("intervantion phto cable", ["intervention", "photo"])
    client = SimpleNamespace(
        role=UserRole.CLIENT,
        client_organization_id=12,
        technician_id=None,
        orienteur_id=None,
    )
    jobs_sql = str(
        ai_assistant._jobs_query(client).compile(
            compile_kwargs={"literal_binds": True}
        )
    )
    technicians_sql = str(
        ai_assistant._technicians_query(client).compile(
            compile_kwargs={"literal_binds": True}
        )
    )
    assert "jobs.client_organization_id = 12" in jobs_sql
    assert "technicians.id = -1" in technicians_sql

    unscoped_client = SimpleNamespace(
        role=UserRole.CLIENT,
        client_organization_id=None,
        technician_id=None,
        orienteur_id=None,
    )
    unscoped_sql = str(
        ai_assistant._jobs_query(unscoped_client).compile(
            compile_kwargs={"literal_binds": True}
        )
    )
    assert "jobs.id = -1" in unscoped_sql
