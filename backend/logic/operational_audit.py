"""Safe append-only audit helpers for privileged business mutations."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import OperationalAuditEvent, User


_SENSITIVE_KEYS = {
    "authorization",
    "password",
    "password_hash",
    "secret",
    "token",
    "access_token",
    "refresh_token",
}


def _sensitive_key(value: object) -> bool:
    key = str(value).lower()
    return (
        key in _SENSITIVE_KEYS
        or key.endswith("_password")
        or key.endswith("_token")
        or key.endswith("_secret")
    )


def safe_audit_value(value: Any) -> Any:
    """Make JSON-safe snapshots while refusing credential material recursively."""
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _sensitive_key(key) else safe_audit_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [safe_audit_value(item) for item in value]
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def record_operational_audit(
    db: AsyncSession,
    *,
    current_user: User,
    action: str,
    entity_type: str,
    entity_id: str | int | None,
    before: dict | None = None,
    after: dict | None = None,
    context: dict | None = None,
) -> OperationalAuditEvent:
    event = OperationalAuditEvent(
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        actor_role=getattr(current_user.role, "value", str(current_user.role)),
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        changes=safe_audit_value({"before": before, "after": after}),
        context=safe_audit_value(context or {}),
    )
    db.add(event)
    return event
