from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes.sectors import router
from backend.auth.dependencies import require_chef_orienteur
from backend.database.models import UserRole


def _route(path: str):
    return next(route for route in router.routes if route.path == path)


def _dependency_calls(path: str):
    return {dependency.call for dependency in _route(path).dependant.dependencies}


def test_sector_stats_routes_keep_legacy_dependency_name_for_office_guard():
    assert require_chef_orienteur in _dependency_calls('/{sector_id}/stats')
    assert require_chef_orienteur in _dependency_calls('/stats/global')


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'role',
    [UserRole.CHEF_ORIENTEUR, UserRole.TECHNICIAN, UserRole.CLIENT],
)
async def test_sector_stats_guard_rejects_field_agent_and_non_office_roles(role):
    with pytest.raises(HTTPException) as exc_info:
        await require_chef_orienteur(SimpleNamespace(role=role))

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize('role', [UserRole.ORIENTEUR, UserRole.ADMIN])
async def test_sector_stats_guard_allows_office_orienteur_and_admin(role):
    user = SimpleNamespace(role=role)
    assert await require_chef_orienteur(user) is user
