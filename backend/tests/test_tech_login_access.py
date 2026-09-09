from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import tech_auth
from backend.database.models import UserRole


class ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class TechLoginDb:
    def __init__(self, *values):
        self.values = list(values)
        self.execute_calls = 0
        self.scalar_calls = 0

    async def execute(self, *_args, **_kwargs):
        self.execute_calls += 1
        value = self.values.pop(0) if self.values else None
        return ScalarResult(value)

    async def scalar(self, *_args, **_kwargs):
        self.scalar_calls += 1
        return self.values.pop(0) if self.values else None


def make_user(role=UserRole.TECHNICIAN, **overrides):
    values = {
        "id": 42,
        "username": "field-user",
        "role": role,
        "is_active": True,
        "technician_id": 7 if role == UserRole.TECHNICIAN else None,
        "orienteur_id": 9 if role == UserRole.CHEF_ORIENTEUR else None,
        "password_hash": "stored-hash",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_technician(**overrides):
    values = {
        "id": 7,
        "name": "Technicien Terrain",
        "orienteur_id": 3,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_field_agent(**overrides):
    values = {
        "id": 9,
        "name": "Agent Terrain",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.asyncio
async def test_mobile_technician_login_preserves_role_and_technician_identity(monkeypatch):
    user = make_user(UserRole.TECHNICIAN)
    technician = make_technician()
    db = TechLoginDb(user, technician)
    token_payload = None

    monkeypatch.setattr(tech_auth, "verify_password", lambda *_args: True)

    def capture_token(*, data):
        nonlocal token_payload
        token_payload = data
        return "mobile-token"

    monkeypatch.setattr(tech_auth, "create_access_token", capture_token)

    response = await tech_auth.tech_login(
        tech_auth.TechLoginRequest(username="field-user", password="correct"),
        db,
    )

    assert response.access_token == "mobile-token"
    assert response.user_id == 42
    assert response.role == UserRole.TECHNICIAN.value
    assert response.technician_id == 7
    assert response.technician_name == "Technicien Terrain"
    assert response.orienteur_id == 3
    assert response.field_agent_name is None
    assert token_payload == {
        "sub": "42",
        "username": "field-user",
        "role": UserRole.TECHNICIAN.value,
        "type": "tech_mobile",
    }
    assert db.execute_calls == 1
    assert db.scalar_calls == 1


@pytest.mark.asyncio
async def test_mobile_field_agent_login_preserves_role_without_fake_technician(monkeypatch):
    user = make_user(UserRole.CHEF_ORIENTEUR)
    field_agent = make_field_agent()
    db = TechLoginDb(user, field_agent)
    token_payload = None

    monkeypatch.setattr(tech_auth, "verify_password", lambda *_args: True)

    def capture_token(*, data):
        nonlocal token_payload
        token_payload = data
        return "mobile-token"

    monkeypatch.setattr(tech_auth, "create_access_token", capture_token)

    response = await tech_auth.tech_login(
        tech_auth.TechLoginRequest(username="field-user", password="correct"),
        db,
    )

    assert response.access_token == "mobile-token"
    assert response.user_id == 42
    assert response.role == UserRole.CHEF_ORIENTEUR.value
    assert response.technician_id is None
    assert response.technician_name is None
    assert response.orienteur_id == 9
    assert response.field_agent_name == "Agent Terrain"
    assert token_payload == {
        "sub": "42",
        "username": "field-user",
        "role": UserRole.CHEF_ORIENTEUR.value,
        "type": "tech_mobile",
    }
    assert db.execute_calls == 1
    assert db.scalar_calls == 1


@pytest.mark.asyncio
async def test_mobile_login_rejects_non_field_role_before_password_check(monkeypatch):
    user = make_user(UserRole.ADMIN)
    db = TechLoginDb(user)
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

    monkeypatch.setattr(tech_auth, "verify_password", unexpected_password_check)
    monkeypatch.setattr(tech_auth, "create_access_token", unexpected_token)

    with pytest.raises(HTTPException) as error:
        await tech_auth.tech_login(
            tech_auth.TechLoginRequest(username="field-user", password="correct"),
            db,
        )

    assert error.value.status_code == 401
    assert error.value.detail == tech_auth.INVALID_CREDENTIALS
    assert password_checked is False
    assert token_created is False
    assert db.execute_calls == 1
    assert db.scalar_calls == 0


@pytest.mark.asyncio
async def test_missing_technician_profile_uses_generic_auth_failure(monkeypatch):
    user = make_user()
    db = TechLoginDb(user, None)
    token_created = False

    monkeypatch.setattr(tech_auth, "verify_password", lambda *_args: True)

    def unexpected_token(*_args, **_kwargs):
        nonlocal token_created
        token_created = True
        return "unexpected"

    monkeypatch.setattr(tech_auth, "create_access_token", unexpected_token)

    with pytest.raises(HTTPException) as error:
        await tech_auth.tech_login(
            tech_auth.TechLoginRequest(username="field-user", password="correct"),
            db,
        )

    assert error.value.status_code == 401
    assert error.value.detail == tech_auth.INVALID_CREDENTIALS
    assert token_created is False
    assert db.execute_calls == 1
    assert db.scalar_calls == 1


@pytest.mark.asyncio
async def test_missing_field_agent_profile_uses_generic_auth_failure(monkeypatch):
    user = make_user(UserRole.CHEF_ORIENTEUR)
    db = TechLoginDb(user, None)
    token_created = False

    monkeypatch.setattr(tech_auth, "verify_password", lambda *_args: True)

    def unexpected_token(*_args, **_kwargs):
        nonlocal token_created
        token_created = True
        return "unexpected"

    monkeypatch.setattr(tech_auth, "create_access_token", unexpected_token)

    with pytest.raises(HTTPException) as error:
        await tech_auth.tech_login(
            tech_auth.TechLoginRequest(username="field-user", password="correct"),
            db,
        )

    assert error.value.status_code == 401
    assert error.value.detail == tech_auth.INVALID_CREDENTIALS
    assert token_created is False
    assert db.execute_calls == 1
    assert db.scalar_calls == 1
