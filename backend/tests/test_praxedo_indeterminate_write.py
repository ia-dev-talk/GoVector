from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.praxedo import executor
from backend.integrations.praxedo.client import PraxedoError


class FakeDb:
    def __init__(self):
        self.flushes = 0

    async def flush(self):
        self.flushes += 1


class AmbiguousClient:
    def __init__(self):
        self.config = SimpleNamespace(idempotency_header=None)
        self.calls = 0

    async def post(self, operation, **kwargs):
        self.calls += 1
        raise PraxedoError(
            "indeterminate_write",
            "timeout after request transmission",
        )


@pytest.mark.asyncio
async def test_new_ambiguous_write_stays_sending_and_requires_reconciliation(monkeypatch):
    receipt = SimpleNamespace(
        status="pending",
        attempts=0,
        next_attempt_at=None,
        last_http_status=None,
        last_error=None,
        response_meta={},
        processed_at=None,
    )

    async def reserve(*args, **kwargs):
        return receipt, True

    async def mark(
        db,
        exchange,
        *,
        status,
        http_status=None,
        error=None,
        response_meta=None,
        next_attempt_at=None,
    ):
        exchange.attempts += 1
        exchange.status = status
        exchange.last_http_status = http_status
        exchange.last_error = error
        exchange.response_meta = response_meta or {}
        exchange.next_attempt_at = next_attempt_at if status == "retryable" else None
        exchange.processed_at = (
            datetime.now(timezone.utc)
            if status in {"acknowledged", "rejected"}
            else None
        )
        await db.flush()
        return exchange

    monkeypatch.setattr(executor, "reserve_exchange", reserve)
    monkeypatch.setattr(executor, "mark_exchange_result", mark)

    client = AmbiguousClient()
    result = await executor.dispatch_outbound(
        FakeDb(),
        client,
        endpoint_operation="stock_movement_write",
        idempotency_key="movement:ambiguous:1",
        mapped_payload={"quantity": 1},
    )

    assert client.calls == 1
    assert result.status == "sending"
    assert result.attempts == 1
    assert result.next_attempt_at is None
    assert result.processed_at is None
    assert result.response_meta == {
        "error_code": "indeterminate_write",
        "reconciliation_required": True,
    }
