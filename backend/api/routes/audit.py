"""Authenticated audit views backed only by persisted business activity."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_admin, require_chef_orienteur
from backend.database.connection import get_db
from backend.database.integration_models import IntegrationExchange
from backend.database.models import JobActivityLog, User
from backend.integrations.exchange_state import ACTIONABLE_EXCHANGE_STATUSES
from backend.integrations.praxedo.client import PraxedoClient, PraxedoConfig, PraxedoError
from backend.integrations.praxedo.readiness import inspect_praxedo_readiness
from backend.integrations.praxedo.smoke import PraxedoSmokeError, smoke_read


router = APIRouter(tags=["Audit & Security"])


class PraxedoSmokeReadRequest(BaseModel):
    """One explicitly requested, read-only Praxedo sandbox probe."""

    model_config = ConfigDict(extra="forbid")

    operation: str = Field(min_length=1, max_length=80)
    path_params: dict[str, Any] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)


@router.get("/audit/log")
async def get_audit_log(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    rows = (
        await db.execute(
            select(JobActivityLog)
            .order_by(JobActivityLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return {
        "available": bool(rows),
        "items": [
            {
                "id": row.id,
                "event": row.action,
                "job_id": row.job_id,
                "technician_id": row.technician_id,
                "old_status": row.old_status,
                "new_status": row.new_status,
                "description": row.description,
                "timestamp": row.created_at,
            }
            for row in rows
        ],
    }


@router.get("/audit/summary")
async def get_audit_summary(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    total = (
        await db.execute(select(func.count(JobActivityLog.id)))
    ).scalar_one()
    grouped = (
        await db.execute(
            select(JobActivityLog.action, func.count(JobActivityLog.id))
            .group_by(JobActivityLog.action)
            .order_by(func.count(JobActivityLog.id).desc())
            .limit(10)
        )
    ).all()
    return {
        "available": total > 0,
        "total": total,
        "issues": None,
        "top_events": [
            {"event": action, "count": count}
            for action, count in grouped
        ],
    }


@router.get("/audit/integrations/readiness/praxedo")
async def get_praxedo_integration_readiness(
    _current_user: User = Depends(require_admin),
):
    """Return configuration readiness without tenant URLs or credentials."""

    return inspect_praxedo_readiness()


@router.post("/audit/integrations/praxedo/smoke-read")
async def run_praxedo_sandbox_read_smoke(
    payload: PraxedoSmokeReadRequest,
    _current_user: User = Depends(require_admin),
):
    """Prove one documented Praxedo GET works without returning business values."""

    try:
        config = PraxedoConfig.from_env()
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "praxedo_config_invalid", "message": str(exc)},
        ) from exc

    try:
        async with PraxedoClient(config) as client:
            return await smoke_read(
                client,
                operation=payload.operation,
                path_params=payload.path_params,
                params=payload.params,
            )
    except PraxedoSmokeError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except PraxedoError as exc:
        status_code = 409 if exc.code in {
            "operation_not_configured",
            "endpoint_parameter_missing",
            "unsafe_endpoint",
        } else 502
        raise HTTPException(
            status_code=status_code,
            detail={
                "code": exc.code,
                "message": exc.message,
                "upstream_status": exc.status_code,
            },
        ) from exc


@router.get("/audit/integrations")
async def get_integration_exchange_journal(
    system: str | None = Query(default=None, max_length=32),
    direction: str | None = Query(default=None, pattern="^(inbound|outbound)$"),
    exchange_status: str | None = Query(
        default=None,
        alias="status",
        pattern="^(pending|sending|acknowledged|retryable|rejected|indeterminate)$",
    ),
    operation: str | None = Query(default=None, max_length=80),
    entity_type: str | None = Query(default=None, max_length=64),
    local_entity_id: int | None = Query(default=None, gt=0),
    after_id: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    include_payload: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    """Inspect Praxedo/QField receipts without exposing request bodies by default."""

    filters = [IntegrationExchange.id > after_id]
    if system and system.strip():
        filters.append(IntegrationExchange.system == system.strip().lower())
    if direction:
        filters.append(IntegrationExchange.direction == direction)
    if exchange_status:
        filters.append(IntegrationExchange.status == exchange_status)
    if operation and operation.strip():
        filters.append(IntegrationExchange.operation == operation.strip())
    if entity_type and entity_type.strip():
        filters.append(IntegrationExchange.entity_type == entity_type.strip().lower())
    if local_entity_id is not None:
        filters.append(IntegrationExchange.local_entity_id == local_entity_id)

    rows = (
        await db.execute(
            select(IntegrationExchange)
            .where(*filters)
            .order_by(IntegrationExchange.id.asc())
            .limit(limit + 1)
        )
    ).scalars().all()
    page = rows[:limit]
    items = []
    for row in page:
        item = {
            "id": row.id,
            "system": row.system,
            "direction": row.direction,
            "operation": row.operation,
            "idempotency_key": row.idempotency_key,
            "entity_type": row.entity_type,
            "local_entity_id": row.local_entity_id,
            "external_id": row.external_id,
            "request_hash": row.request_hash,
            "status": row.status,
            "attempts": row.attempts,
            "last_http_status": row.last_http_status,
            "last_error": row.last_error,
            "response_meta": row.response_meta,
            "occurred_at": row.occurred_at,
            "next_attempt_at": row.next_attempt_at,
            "processed_at": row.processed_at,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        if include_payload:
            item["payload"] = row.payload
        items.append(item)

    return {
        "items": items,
        "next_after_id": page[-1].id if len(rows) > limit and page else None,
    }


@router.get("/audit/integrations/summary")
async def get_integration_exchange_summary(
    system: str | None = Query(default=None, max_length=32),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    filters = []
    if system and system.strip():
        filters.append(IntegrationExchange.system == system.strip().lower())

    rows = (
        await db.execute(
            select(
                IntegrationExchange.system,
                IntegrationExchange.direction,
                IntegrationExchange.status,
                func.count(IntegrationExchange.id),
            )
            .where(*filters)
            .group_by(
                IntegrationExchange.system,
                IntegrationExchange.direction,
                IntegrationExchange.status,
            )
            .order_by(
                IntegrationExchange.system,
                IntegrationExchange.direction,
                IntegrationExchange.status,
            )
        )
    ).all()
    total = sum(int(count) for _system, _direction, _status, count in rows)
    actionable = sum(
        int(count)
        for _system, _direction, status_value, count in rows
        if status_value in ACTIONABLE_EXCHANGE_STATUSES
    )
    return {
        "total": total,
        "actionable": actionable,
        "groups": [
            {
                "system": system_value,
                "direction": direction_value,
                "status": status_value,
                "count": int(count),
            }
            for system_value, direction_value, status_value, count in rows
        ],
    }
