"""RBAC contract for technician stock allocations."""

import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes.stock_v2_atomic import create_technician_allocation
from backend.api.routes.stock_v2_patch import validate_issue_to_technician_custody
from backend.database.models import UserRole
from backend.logic.stock_allocation_policy import enforce_technician_allocation_scope


def _user(role: UserRole, *, orienteur_id: int | None = None):
    return SimpleNamespace(role=role, orienteur_id=orienteur_id)


def _technician(*, orienteur_id: int | None = None):
    return SimpleNamespace(orienteur_id=orienteur_id)


def test_admin_can_allocate_to_any_active_technician():
    enforce_technician_allocation_scope(
        current_user=_user(UserRole.ADMIN, orienteur_id=11),
        technician=_technician(orienteur_id=99),
    )


def test_orienteur_can_allocate_to_own_technician():
    enforce_technician_allocation_scope(
        current_user=_user(UserRole.ORIENTEUR, orienteur_id=7),
        technician=_technician(orienteur_id=7),
    )


@pytest.mark.parametrize("user_scope, technician_scope", [(7, 9), (None, 7), (7, None)])
def test_orienteur_cannot_allocate_outside_scope(user_scope, technician_scope):
    with pytest.raises(HTTPException) as exc_info:
        enforce_technician_allocation_scope(
            current_user=_user(UserRole.ORIENTEUR, orienteur_id=user_scope),
            technician=_technician(orienteur_id=technician_scope),
        )

    assert exc_info.value.status_code == 403


@pytest.mark.parametrize("role", [UserRole.CHEF_ORIENTEUR, UserRole.TECHNICIAN])
def test_field_roles_fail_closed(role):
    with pytest.raises(HTTPException) as exc_info:
        enforce_technician_allocation_scope(
            current_user=_user(role, orienteur_id=7),
            technician=_technician(orienteur_id=7),
        )

    assert exc_info.value.status_code == 403


def test_both_allocation_entry_points_enforce_scope_before_destination_mutation():
    for endpoint in (
        create_technician_allocation,
        validate_issue_to_technician_custody,
    ):
        source = inspect.getsource(endpoint)
        guard_position = source.index("enforce_technician_allocation_scope(")
        destination_position = source.index("_technician_warehouse(")
        assert guard_position < destination_position
