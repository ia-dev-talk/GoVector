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
from backend.api.errors import BusinessAPIError
from backend.database.models import Job, TechnicianSyncEvent, User
from backend.logic.cable_classification import normalize_cable_capture_payload
from backend.logic.cable_measurements import apply_cable_endpoint_projection
from backend.logic.technician_field_actions import (
    SUPPORTED_FIELD_ACTION_TYPES,
    record_technician_field_action,
)
from backend.logic.technician_jobs import (
    TechnicianJobMutationError,
    terminate_technician_job,
)
from backend.logic.technician_measurements import apply_measurement_projection
from backend.logic.technician_stock import (
    apply_equipment_scan,
    consume_technician_material,
)
from backend.logic.job_communications import create_job_communication
from backend.logic.job_access import require_job_collaboration_access


SUPPORTED_SYNC_EVENT_TYPES = SUPPORTED_FIELD_ACTION_TYPES | {"job_communication"}


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

    if event.type == "job_communication":
        job = await db.scalar(select(Job).where(Job.id == event.job_id))
        if job is None:
            raise TechnicianJobMutationError(
                "rejected", "job_not_found", "Intervention introuvable"
            )
        try:
            await require_job_collaboration_access(
                db, job=job, current_user=current_user
            )
        except BusinessAPIError as exc:
            raise TechnicianJobMutationError(
                "rejected", "permission_denied", str(exc.message)
            ) from exc
        await create_job_communication(
            db,
            job_id=event.job_id,
            message_type=str(event.payload.get("message_type") or "reply"),
            body=event.payload.get("body") or event.payload.get("value"),
            current_user=current_user,
            source="mobile_outbox",
            audience="office",
            parent_id=event.payload.get("parent_id"),
            event_id=str(event.event_id),
            occurred_at=event.occurred_at,
            asset_refs=(
                [
                    {
                        "asset_type": "technician_media",
                        "asset_id": str(event.payload["media_id"]),
                        "role": str(event.payload.get("asset_role") or "attachment"),
                        **(
                            {"annotation_of": event.payload["annotation_of"]}
                            if isinstance(event.payload.get("annotation_of"), dict)
                            else {}
                        ),
                    }
                ]
                if event.payload.get("media_id")
                else event.payload.get("attachments") or []
            ),
        )
        return

    if event.type in SUPPORTED_FIELD_ACTION_TYPES:
        # Business effects happen inside the same savepoint as the idempotency
        # receipt. Replaying an acknowledged mobile event therefore cannot
        # consume stock twice, rebind serialized equipment inconsistently, or
        # project the same typed measurement twice with divergent values.
        field_payload = dict(event.payload)
        if event.type == "material_used":
            await consume_technician_material(
                db,
                job_id=event.job_id,
                payload=field_payload,
                current_user=current_user,
                event_id=str(event.event_id),
                occurred_at=event.occurred_at,
            )
        elif event.type == "equipment_scan" and isinstance(db, AsyncSession):
            resolved = await apply_equipment_scan(
                db,
                job_id=event.job_id,
                payload=field_payload,
                current_user=current_user,
            )
            field_payload.update(resolved)
        elif event.type in {"field_measurement", "otdr_measurement"} and isinstance(
            db, AsyncSession
        ):
            await apply_measurement_projection(
                db,
                job_id=event.job_id,
                payload=field_payload,
                current_user=current_user,
            )
        elif event.type in {"cable_entry", "cable_exit"} and isinstance(
            db, AsyncSession
        ):
            await normalize_cable_capture_payload(
                db,
                payload=field_payload,
                current_user=current_user,
                event_type=event.type,
            )
            await apply_cable_endpoint_projection(
                db,
                job_id=event.job_id,
                event_id=str(event.event_id),
                event_type=event.type,
                payload=field_payload,
                current_user=current_user,
                occurred_at=event.occurred_at,
            )

        await record_technician_field_action(
            db,
            event_id=str(event.event_id),
            occurred_at=event.occurred_at,
            job_id=event.job_id,
            event_type=event.type,
            payload=field_payload,
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
            and event.type in SUPPORTED_SYNC_EVENT_TYPES
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
