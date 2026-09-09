from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import orienteur_agent
from backend.auth.dependencies import (
    require_chef_orienteur,
    require_field_agent,
    require_orienteur,
    require_technician,
)
from backend.database.models import UserRole
from backend.logic.field_agent_access import subject_user_for_field_agent


def _user(role, *, user_id=1, orienteur_id=None, technician_id=None):
    return SimpleNamespace(
        id=user_id,
        role=role,
        orienteur_id=orienteur_id,
        technician_id=technician_id,
        username=f"user-{user_id}",
        email=f"user-{user_id}@example.invalid",
    )


@pytest.mark.asyncio
async def test_legacy_chef_role_is_field_agent_not_office_dispatch_anymore():
    agent = _user(UserRole.CHEF_ORIENTEUR, orienteur_id=7)

    assert await require_field_agent(agent) is agent

    with pytest.raises(HTTPException) as denied_office:
        await require_orienteur(agent)
    assert denied_office.value.status_code == 403

    with pytest.raises(HTTPException) as denied_technician:
        await require_technician(agent)
    assert denied_technician.value.status_code == 403


@pytest.mark.asyncio
async def test_office_orienteur_keeps_dispatch_and_legacy_admin_dependency():
    office = _user(UserRole.ORIENTEUR)

    assert await require_orienteur(office) is office
    assert await require_chef_orienteur(office) is office

    with pytest.raises(HTTPException) as denied_field:
        await require_field_agent(office)
    assert denied_field.value.status_code == 403


@pytest.mark.asyncio
async def test_field_agent_requires_team_identity():
    agent_without_team = _user(UserRole.CHEF_ORIENTEUR, orienteur_id=None)

    with pytest.raises(HTTPException) as denied:
        await require_field_agent(agent_without_team)
    assert denied.value.status_code == 403
    assert "équipe" in denied.value.detail.lower()


def test_field_agent_scope_excludes_stock_consumption_and_equipment_binding():
    allowed = orienteur_agent._FIELD_AGENT_ALLOWED_EVENT_TYPES

    assert {
        "intervention_photo",
        "field_measurement",
        "cable_entry",
        "cable_exit",
        "complete_job",
    }.issubset(allowed)
    assert "material_used" not in allowed
    assert "equipment_scan" not in allowed


def test_field_agent_subject_keeps_real_actor_user_and_server_assigned_technician():
    agent = _user(
        UserRole.CHEF_ORIENTEUR,
        user_id=42,
        orienteur_id=9,
        technician_id=None,
    )

    subject = subject_user_for_field_agent(
        field_agent=agent,
        assigned_technician_id=123,
    )

    assert subject.id == 42
    assert subject.technician_id == 123
    assert subject.orienteur_id == 9
    assert subject.role == UserRole.TECHNICIAN
