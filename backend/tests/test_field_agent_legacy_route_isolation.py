from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from backend.api.routes import ai_assistant, assignments, realtime, sectors, technicians
from backend.database.models import UserRole


def _agent():
    return SimpleNamespace(
        id=9,
        role=UserRole.CHEF_ORIENTEUR,
        orienteur_id=7,
        technician_id=None,
        client_organization_id=None,
    )


@pytest.mark.asyncio
async def test_field_agent_cannot_use_legacy_assignment_or_technician_routes():
    agent = _agent()
    db = AsyncMock()

    with pytest.raises(HTTPException) as assignment_scope:
        await assignments._check_orienteur_scope(agent, db, technician_id=3)
    assert assignment_scope.value.status_code == 403

    with pytest.raises(HTTPException) as assignment_read:
        await assignments.get_technician_assignments(3, db=db, current_user=agent)
    assert assignment_read.value.status_code == 403

    with pytest.raises(HTTPException) as technician_read:
        await technicians.get_technicians(skip=0, limit=100, db=db, current_user=agent)
    assert technician_read.value.status_code == 403


def test_field_agent_cannot_read_global_sector_assignments():
    with pytest.raises(HTTPException) as denied:
        sectors._assignment_orienteur_scope(_agent())
    assert denied.value.status_code == 403


def test_field_agent_ai_queries_fail_closed_instead_of_becoming_global():
    jobs_sql = str(ai_assistant._jobs_query(_agent()).compile())
    technicians_sql = str(ai_assistant._technicians_query(_agent()).compile())

    assert "jobs.id =" in jobs_sql
    assert "technicians.id =" in technicians_sql


def test_field_agent_cannot_join_office_realtime_rooms():
    for room in [None, "dashboard", "dispatch", "admin", "supervision"]:
        assert realtime.can_join_room(UserRole.CHEF_ORIENTEUR, room) is False

    assert realtime.can_join_room(UserRole.ADMIN, "admin") is True
    assert realtime.can_join_room(UserRole.ORIENTEUR, "dispatch") is True
