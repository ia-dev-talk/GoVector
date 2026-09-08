from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.praxedo.client import PraxedoError
from backend.integrations.praxedo import executor


class FakeDb:
    def __init__(self):
        self.flushes = 0

    async def flush(self):
        self.flushes += 1


class FakeClient:
    RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}

    def __init__(self, *, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def post(self, operation, **kwargs):
        self.calls.append(("POST", operation, kwargs))
        if self.error:
            raise self.error
        return self.response

    async def patch(self, operation, **kwargs):
        self.calls.append(("PATCH", operation, kwargs))
        if self.error:
            raise self.error
        return self.response


def exchange(**overrides):
    values = {
        "status": "pending",
        "attempts": 0,
        "next_attempt_at": None,
        "last_http_status": None,
        "last_error": None,
        "response_meta": {},
        "processed_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


async def fake_mark(db, receipt, *, status, http_status=None, error=None, response_meta=None, next_attempt_at=None):
    receipt.attempts += 1
    receipt.status = status
    receipt.last_http_status = http_status
    receipt.last_error = error
    receipt.response_meta = response_meta or {}
    receipt.next_attempt_at = next_attempt_at if status == "retryable" else None
    if status in {"acknowledged", "rejected"}:
        receipt.processed_at = datetime.now(timezone.utc)
    await db.flush()
    return receipt


def test_retry_delay_is_exponential_and_bounded():
    assert executor.retry_delay(1) == timedelta(seconds=30)
    assert executor.retry_delay(2) == timedelta(seconds=60)
    assert executor.retry_delay(99) == timedelta(minutes=15)


def test_error_outcome_distinguishes_transient_and_terminal():
    assert executor.error_outcome(PraxedoError("transport_error", "down")) == "retryable"
    assert executor.error_outcome(PraxedoError("http_error", "busy", status_code=503)) == "retryable"
    assert executor.error_outcome(PraxedoError("http_error", "bad", status_code=400)) == "rejected"
    assert executor.error_outcome(PraxedoError("operation_not_configured", "missing")) == "rejected"


def test_safe_response_meta_does_not_persist_remote_business_payload():
    assert executor.safe_response_meta({"id": "secret-value", "status": "ok"}) == {
        "kind": "json_object",
        "keys": ["id", "status"],
    }
    assert executor.safe_response_meta([1, 2, 3]) == {"kind": "json_array", "length": 3}


@pytest.mark.asyncio
async def test_dispatch_acknowledges_one_mapped_post(monkeypatch):
    receipt = exchange()

    async def reserve(*args, **kwargs):
        assert kwargs["payload"]["body"] == {"tenantField": "value"}
        assert kwargs["payload"]["endpoint_operation"] == "work_report_write"
        return receipt, True

    monkeypatch.setattr(executor, "reserve_exchange", reserve)
    monkeypatch.setattr(executor, "mark_exchange_result", fake_mark)
    client = FakeClient(response={"id": "PX-42", "status": "ok"})
    db = FakeDb()

    result = await executor.dispatch_outbound(
        db,
        client,
        endpoint_operation="work_report_write",
        idempotency_key="work-report:42:v1",
        mapped_payload={"tenantField": "value"},
        entity_type="intervention",
        local_entity_id=42,
    )

    assert result.status == "acknowledged"
    assert result.attempts == 1
    assert len(client.calls) == 1
    assert client.calls[0][2]["idempotency_key"] == "work-report:42:v1"
    assert result.response_meta == {"kind": "json_object", "keys": ["id", "status"]}


@pytest.mark.asyncio
async def test_retryable_failure_sets_next_attempt(monkeypatch):
    receipt = exchange()

    async def reserve(*args, **kwargs):
        return receipt, True

    monkeypatch.setattr(executor, "reserve_exchange", reserve)
    monkeypatch.setattr(executor, "mark_exchange_result", fake_mark)
    client = FakeClient(error=PraxedoError("transport_error", "network unavailable"))
    db = FakeDb()
    now = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)

    result = await executor.dispatch_outbound(
        db,
        client,
        endpoint_operation="stock_movement_write",
        idempotency_key="movement:99",
        mapped_payload={"quantity": 5},
        now=now,
    )

    assert result.status == "retryable"
    assert result.attempts == 1
    assert result.next_attempt_at == now + timedelta(seconds=30)
    assert result.response_meta == {"error_code": "transport_error"}


@pytest.mark.asyncio
async def test_terminal_receipt_is_never_sent_again(monkeypatch):
    receipt = exchange(status="acknowledged", attempts=1)

    async def reserve(*args, **kwargs):
        return receipt, False

    monkeypatch.setattr(executor, "reserve_exchange", reserve)
    client = FakeClient(response={"unexpected": True})

    result = await executor.dispatch_outbound(
        FakeDb(),
        client,
        endpoint_operation="work_report_write",
        idempotency_key="work-report:42:v1",
        mapped_payload={"tenantField": "value"},
    )

    assert result is receipt
    assert client.calls == []


@pytest.mark.asyncio
async def test_retryable_receipt_waits_until_due(monkeypatch):
    now = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)
    receipt = exchange(
        status="retryable",
        attempts=1,
        next_attempt_at=now + timedelta(minutes=2),
    )

    async def reserve(*args, **kwargs):
        return receipt, False

    monkeypatch.setattr(executor, "reserve_exchange", reserve)
    client = FakeClient(response={"unexpected": True})

    result = await executor.dispatch_outbound(
        FakeDb(),
        client,
        endpoint_operation="stock_movement_write",
        idempotency_key="movement:99",
        mapped_payload={"quantity": 5},
        now=now,
    )

    assert result.status == "retryable"
    assert client.calls == []


@pytest.mark.asyncio
async def test_dispatch_rejects_unsafe_http_method():
    with pytest.raises(executor.PraxedoDispatchError):
        await executor.dispatch_outbound(
            FakeDb(),
            FakeClient(),
            endpoint_operation="unsafe",
            idempotency_key="unsafe:1",
            mapped_payload={},
            method="DELETE",
        )
