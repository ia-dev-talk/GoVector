import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.tech_sync import (
    TechnicianSyncEventRequest,
    TechnicianSyncEventResult,
)
from backend.database.models import TechnicianSyncEvent, User
from backend.logic.technician_field_actions import (
    SUPPORTED_FIELD_ACTION_TYPES,
    record_technician_field_action,
)
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    terminate_technician_job,
)


def _request_hash(event: TechnicianSyncEventRequest) -> str:
    canonical = json.dumps(
        event.model_dump(mode="json"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _result(
    event_id,
    status: str,
    code: str | None = None,
    error: str | None = None,
) -> TechnicianSyncEventResult:
    return TechnicianSyncEventResult(
        event_id=event_id,
        status=status,
        code=code,
        error=error,
    )


def _stored_result(receipt: TechnicianSyncEvent) -> TechnicianSyncEventResult:
    return _result(
        receipt.event_id,
        receipt.status,
        receipt.code,
        receipt.error,
    )


async def _find_receipt(
    db: AsyncSession,
    *,
    technician_id: int,
    event_id: str,
) -> TechnicianSyncEvent | None:
    result = await db.execute(
        select(TechnicianSyncEvent).where(
            TechnicianSyncEvent.technician_id == technician_id,
            TechnicianSyncEvent.event_id == event_id,
        )
    )
    return result.scalar_one_or_none()


async def _dispatch(
    db: AsyncSession,
    *,
    event: TechnicianSyncEventRequest,
    current_user: User,
) -> None:
    if event.type == "complete_job":
        await terminate_technician_job(
            db,
            job_id=event.job_id,
            payload=event.payload,
            current_user=current_user,
        )
        return

    if event.type in SUPPORTED_FIELD_ACTION_TYPES:
        await record_technician_field_action(
            db,
            event_id=str(event.event_id),
            occurred_at=event.occurred_at,
            job_id=event.job_id,
            event_type=event.type,
            payload=event.payload,
            current_user=current_user,
        )
        return

    raise TechnicianJobMutationError(
        "rejected",
        "unsupported_action",
        f"Le type d'action '{event.type}' n'est pas supporté par sync v1",
    )


async def _persist_failure(
    db: AsyncSession,
    *,
    event: TechnicianSyncEventRequest,
    request_hash: str,
    current_user: User,
    status: str,
    code: str,
    error: str,
    existing: TechnicianSyncEvent | None,
) -> TechnicianSyncEventResult:
    now = datetime.now(timezone.utc)
    async with db.begin_nested():
        receipt = existing
        if receipt is None:
            receipt = TechnicianSyncEvent(
                event_id=str(event.event_id),
                schema_version=event.schema_version,
                user_id=current_user.id,
                technician_id=current_user.technician_id,
                job_id=event.job_id,
                event_type=event.type,
                payload=event.payload,
                occurred_at=event.occurred_at,
                request_hash=request_hash,
                status=status,
                code=code,
                error=error,
                processed_at=now,
            )
            db.add(receipt)
        else:
            receipt.status = status
            receipt.code = code
            receipt.error = error
            receipt.updated_at = now
            receipt.processed_at = now
        await db.flush()

    return _result(event.event_id, status, code, error)


async def process_technician_sync_event(
    db: AsyncSession,
    *,
    event: TechnicianSyncEventRequest,
    current_user: User,
) -> TechnicianSyncEventResult:
    """Process one event in a savepoint and persist its individual receipt."""

    technician_id = current_user.technician_id
    event_id = str(event.event_id)
    request_hash = _request_hash(event)
    existing = await _find_receipt(
        db,
        technician_id=technician_id,
        event_id=event_id,
    )

    if existing is not None:
        if existing.request_hash != request_hash:
            return _result(
                event.event_id,
                "conflict",
                "event_id_reused",
                "Cet event_id existe déjà avec un contenu différent",
            )
        newly_supported_retry = (
            existing.status == "rejected"
            and existing.code == "unsupported_action"
            and event.type in SUPPORTED_FIELD_ACTION_TYPES
        )
        if existing.status != "retryable" and not newly_supported_retry:
            return _stored_result(existing)

    now = datetime.now(timezone.utc)
    receipt = existing
    try:
        async with db.begin_nested():
            if receipt is None:
                receipt = TechnicianSyncEvent(
                    event_id=event_id,
                    schema_version=event.schema_version,
                    user_id=current_user.id,
                    technician_id=technician_id,
                    job_id=event.job_id,
                    event_type=event.type,
                    payload=event.payload,
                    occurred_at=event.occurred_at,
                    request_hash=request_hash,
                    status="retryable",
                )
                db.add(receipt)
                # The unique receipt is flushed before the business effect.
                await db.flush()

            await _dispatch(
                db,
                event=event,
                current_user=current_user,
            )
            receipt.status = "acknowledged"
            receipt.code = None
            receipt.error = None
            receipt.updated_at = now
            receipt.processed_at = now
            await db.flush()
    except TechnicianJobMutationError as exc:
        return await _persist_failure(
            db,
            event=event,
            request_hash=request_hash,
            current_user=current_user,
            status=exc.status,
            code=exc.code,
            error=exc.message,
            existing=existing,
        )
    except IntegrityError:
        concurrent = await _find_receipt(
            db,
            technician_id=technician_id,
            event_id=event_id,
        )
        if concurrent is not None and concurrent.request_hash == request_hash:
            return _stored_result(concurrent)
        return _result(
            event.event_id,
            "retryable",
            "idempotency_race",
            "Réception concurrente, réessayer l'événement",
        )
    except Exception as exc:
        return await _persist_failure(
            db,
            event=event,
            request_hash=request_hash,
            current_user=current_user,
            status="retryable",
            code="processing_error",
            error=str(exc),
            existing=existing,
        )

    return _result(event.event_id, "acknowledged")
