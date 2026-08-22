from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes.sectors import (
    _ASSIGNMENT_QUERY,
    _assignment_orienteur_scope,
)
from backend.database.models import UserRole


def _user(role, orienteur_id=None):
    return SimpleNamespace(
        role=role,
        orienteur_id=orienteur_id,
    )


@pytest.mark.parametrize(
    "role",
    [UserRole.ADMIN, UserRole.CHEF_ORIENTEUR],
)
def test_assignment_scope_allows_global_supervision_roles(role):
    assert _assignment_orienteur_scope(_user(role)) is None


def test_assignment_scope_limits_orienteur_to_own_team():
    assert (
        _assignment_orienteur_scope(
            _user(UserRole.ORIENTEUR, orienteur_id=17),
        )
        == 17
    )


def test_assignment_scope_rejects_unaffiliated_orienteur():
    with pytest.raises(HTTPException) as exc_info:
        _assignment_orienteur_scope(_user(UserRole.ORIENTEUR))

    assert exc_info.value.status_code == 403


def test_assignment_scope_rejects_technician_global_read():
    with pytest.raises(HTTPException) as exc_info:
        _assignment_orienteur_scope(_user(UserRole.TECHNICIAN))

    assert exc_info.value.status_code == 403


def test_assignment_query_enforces_orienteur_scope_server_side():
    sql = str(_ASSIGNMENT_QUERY)

    assert "JOIN technicians AS t" in sql
    assert "t.orienteur_id = :orienteur_id" in sql
