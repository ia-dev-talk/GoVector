from datetime import datetime, timezone
from types import SimpleNamespace

from backend.database.models import OperationalAuditEvent, UserRole
from backend.logic.operational_audit import record_operational_audit, safe_audit_value


class _Db:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)


def test_audit_snapshot_recursively_redacts_credentials():
    value = safe_audit_value(
        {
            "username": "admin",
            "password": "never-store-me",
            "nested": {
                "access_token": "token",
                "temporary_password": "temporary",
                "when": datetime(2026, 8, 11, tzinfo=timezone.utc),
            },
        }
    )

    assert value["username"] == "admin"
    assert value["password"] == "[REDACTED]"
    assert value["nested"]["access_token"] == "[REDACTED]"
    assert value["nested"]["temporary_password"] == "[REDACTED]"
    assert value["nested"]["when"] == "2026-08-11T00:00:00+00:00"


def test_audit_event_keeps_actor_snapshot_and_never_needs_a_commit():
    db = _Db()
    user = SimpleNamespace(id=9, username="admin", role=UserRole.ADMIN)

    event = record_operational_audit(
        db,
        current_user=user,
        action="account.password_reset",
        entity_type="user_account",
        entity_id=12,
        before={"password_hash": "old"},
        after={"password": "new"},
    )

    assert isinstance(event, OperationalAuditEvent)
    assert event.actor_user_id == 9
    assert event.actor_username == "admin"
    assert event.actor_role == "ADMIN"
    assert event.entity_id == "12"
    assert event.changes["before"]["password_hash"] == "[REDACTED]"
    assert event.changes["after"]["password"] == "[REDACTED]"
    assert db.added == [event]
