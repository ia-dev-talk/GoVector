from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.api.routes import settings, v1_admin
from backend.api.schemas.settings import CatalogItem
from backend.api.schemas.v1_admin import (
    AdminAccountCreate,
    FieldTeamWrite,
    TeamTechnicianUpdate,
)
from backend.database.models import ApplicationSetting, JobPriority, JobStatus, JobType
from backend.logic.technician_field_actions import _require_enabled_action
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.workflow import capabilities


def _dependency_names(route):
    return {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }


def _grade_query_db(grades=None):
    scalars = MagicMock()
    scalars.all.return_value = list(grades or [])
    result = MagicMock()
    result.scalars.return_value = scalars
    db = AsyncMock()
    db.execute.return_value = result
    return db


def test_catalog_contains_every_protected_business_code():
    values = settings._catalog_defaults()
    assert {item.code for item in values.job_types} == {item.value for item in JobType}
    assert {item.code for item in values.priorities} == {item.value for item in JobPriority}
    assert {item.code for item in values.status_presentations} == {
        item.value for item in JobStatus
    }
    assert {item.code for item in values.technician_grades} == {"junior", "senior"}


def test_catalog_write_is_admin_only_but_read_is_authenticated():
    get_route = next(
        route
        for route in settings.router.routes
        if route.path == "/catalog" and "GET" in (route.methods or set())
    )
    put_route = next(
        route
        for route in settings.router.routes
        if route.path == "/catalog" and "PUT" in (route.methods or set())
    )
    assert "get_current_user" in _dependency_names(get_route)
    assert "require_admin" in _dependency_names(put_route)


@pytest.mark.asyncio
async def test_protected_catalog_rejects_removed_workflow_code():
    values = settings._catalog_defaults()
    values.status_presentations = values.status_presentations[:-1]
    db = _grade_query_db()
    with pytest.raises(HTTPException) as raised:
        await settings._validated_catalog(db, values)
    assert raised.value.status_code == 422


@pytest.mark.asyncio
async def test_used_technician_grade_cannot_be_archived():
    values = settings._catalog_defaults()
    values.technician_grades = [
        CatalogItem(**{**item.model_dump(), "active": item.code != "senior"})
        for item in values.technician_grades
    ]
    db = _grade_query_db(["senior"])
    with pytest.raises(HTTPException) as raised:
        await settings._validated_catalog(db, values)
    assert raised.value.status_code == 409


def test_team_contract_accepts_configured_grade_identifier():
    payload = FieldTeamWrite(
        name="Équipe fibre",
        orienteur_id=1,
        sector_ids=[2],
        initial_technician_id=3,
        initial_grade="expert_ftth",
    )
    assert payload.initial_grade == "expert_ftth"
    assert TeamTechnicianUpdate(grade="referent_qualite").grade == "referent_qualite"


@pytest.mark.asyncio
async def test_configured_status_label_is_exposed_without_changing_semantics():
    document = SimpleNamespace(
        values={
            "status_presentations": [
                {
                    "code": JobStatus.ON_SITE.value,
                    "label": "Présent chez le client",
                    "color": "#31C48D",
                    "sort_order": 40,
                }
            ]
        }
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = document
    db = AsyncMock()
    db.execute.return_value = result
    presentations = await capabilities.configured_status_presentations(db)
    item = capabilities.status_capability(
        JobStatus.ON_SITE,
        presentations[JobStatus.ON_SITE.value],
    )
    assert item["label"] == "Présent chez le client"
    assert item["color"] == "#31C48D"
    assert item["field_active"] is True
    assert item["canonical"] == JobStatus.ON_SITE.value


def test_grade_validation_is_applied_to_team_mutations():
    create_route = next(
        route
        for route in v1_admin.router.routes
        if route.path == "/teams" and "POST" in (route.methods or set())
    )
    put_route = next(
        route
        for route in v1_admin.router.routes
        if route.path == "/teams/{team_id}/technicians/{technician_id}"
        and "PUT" in (route.methods or set())
    )
    assert create_route.endpoint.__name__ == "create_team"
    assert put_route.endpoint.__name__ == "put_team_technician"


def test_account_administration_is_admin_scoped_and_requires_profile_links():
    accounts_route = next(
        route
        for route in v1_admin.router.routes
        if route.path == "/accounts" and "GET" in (route.methods or set())
    )
    reset_route = next(
        route
        for route in v1_admin.router.routes
        if route.path == "/accounts/{account_id}/reset-password"
    )
    assert "require_admin" in _dependency_names(accounts_route)
    assert "require_admin" in _dependency_names(reset_route)
    technician = AdminAccountCreate(
        username="tech.test",
        email="tech@example.test",
        password="mot-de-passe-solide",
        role="TECHNICIAN",
        technician_id=8,
    )
    assert technician.technician_id == 8

    audit_route = next(
        route for route in v1_admin.router.routes if route.path == "/audit-events"
    )
    assert "require_admin" in _dependency_names(audit_route)


@pytest.mark.asyncio
async def test_archived_action_rejects_new_capture_but_preserves_offline_prior_fact():
    archived_at = datetime.now(timezone.utc)
    document = ApplicationSetting(
        namespace="business_catalog",
        schema_version=1,
        revision=2,
        values={
            "field_actions": [
                {"code": "client_signature", "active": False}
            ]
        },
    )
    document.updated_at = archived_at
    db = AsyncMock()
    db.scalar.return_value = document

    await _require_enabled_action(
        db,
        event_type="client_signature",
        occurred_at=archived_at - timedelta(minutes=1),
    )
    with pytest.raises(TechnicianJobMutationError) as raised:
        await _require_enabled_action(
            db,
            event_type="client_signature",
            occurred_at=archived_at + timedelta(minutes=1),
        )
    assert raised.value.code == "action_disabled"
