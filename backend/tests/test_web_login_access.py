from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import auth
from backend.database.models import UserRole


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class LoginDb:
    def __init__(self, user, *, organization_active=True):
        self.user = user
        self.organization_active = organization_active
        self.scalar_calls = 0

    async def execute(self, *_args, **_kwargs):
        return ScalarResult(self.user)

    async def scalar(self, *_args, **_kwargs):
        self.scalar_calls += 1
        return self.organization_active


def make_user(role, *, organization_id=None):
    return SimpleNamespace(
        id=42,
        username="operator",
        email="operator@example.com",
        role=role,
        is_active=True,
        password_hash="stored-hash",
        client_organization_id=organization_id,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.TECHNICIAN, UserRole.CHEF_ORIENTEUR])
async def test_mobile_field_roles_are_rejected_by_web_login_before_password_check(
    monkeypatch,
    role,
):
    user = make_user(role)
    db = LoginDb(user)
    password_checked = False
    token_created = False

    def unexpected_password_check(*_args):
        nonlocal password_checked
        password_checked = True
        return True

    def unexpected_token(*_args, **_kwargs):
        nonlocal token_created
        token_created = True
        return "unexpected"

    monkeypatch.setattr(auth, "verify_password", unexpected_password_check)
    monkeypatch.setattr(auth, "create_access_token", unexpected_token)

    with pytest.raises(HTTPException) as error:
        await auth.login(
            SimpleNamespace(username="field-user", password="correct"),
            db,
        )

    assert error.value.status_code == 401
    assert password_checked is False
    assert token_created is False
    assert db.scalar_calls == 0


@pytest.mark.asyncio
async def test_disabled_client_organization_is_rejected_before_token_creation(monkeypatch):
    user = make_user(UserRole.CLIENT, organization_id=12)
    db = LoginDb(user, organization_active=False)
    token_created = False

    monkeypatch.setattr(auth, "verify_password", lambda *_args: True)

    def unexpected_token(*_args, **_kwargs):
        nonlocal token_created
        token_created = True
        return "unexpected"

    monkeypatch.setattr(auth, "create_access_token", unexpected_token)

    with pytest.raises(HTTPException) as error:
        await auth.login(
            SimpleNamespace(username="operator", password="correct"),
            db,
        )

    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}
    assert db.scalar_calls == 1
    assert token_created is False


@pytest.mark.asyncio
async def test_active_client_organization_can_receive_web_token(monkeypatch):
    user = make_user(UserRole.CLIENT, organization_id=12)
    db = LoginDb(user, organization_active=True)

    monkeypatch.setattr(auth, "verify_password", lambda *_args: True)
    monkeypatch.setattr(auth, "create_access_token", lambda **_kwargs: "token")

    response = await auth.login(
        SimpleNamespace(username="operator", password="correct"),
        db,
    )

    assert response["access_token"] == "token"
    assert response["user"]["client_organization_id"] == 12
    assert db.scalar_calls == 1


@pytest.mark.asyncio
async def test_internal_user_login_does_not_query_client_organization(monkeypatch):
    user = make_user(UserRole.ADMIN)
    db = LoginDb(user)

    monkeypatch.setattr(auth, "verify_password", lambda *_args: True)
    monkeypatch.setattr(auth, "create_access_token", lambda **_kwargs: "token")

    response = await auth.login(
        SimpleNamespace(username="operator", password="correct"),
        db,
    )

    assert response["access_token"] == "token"
    assert db.scalar_calls == 0
