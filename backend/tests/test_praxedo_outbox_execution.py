from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.praxedo.client import PraxedoConfig, PraxedoError
from backend.integrations.praxedo.outbox import execute_exchange
from backend.integrations.praxedo.write_contract import PraxedoWriteContract


def _config(*, idempotent=False):
    return PraxedoConfig(
        base_url="https://sandbox.example.test/root/",
        auth_mode="basic",
        endpoints={"stock_movement_write": "api/stock-movements"},
        username="test",
        password="secret",
        max_retries=0,
        idempotency_header="Idempotency-Key" if idempotent else None,
    )


def _contract():
    return PraxedoWriteContract(
        confirmed=True,
        contract_version="tenant-v1",
        methods={"stock_movement_write": "POST"},
    )


def _exchange(**overrides):
    values = {
        "id": 22,
        "system": "praxedo",
        "direction": "outbound",
        "operation": "stock_movement_write",
        "idempotency_key": "bv-stock-22",
        "payload": {
            "contract_version": "tenant-v1",
            "body": {"article": "A-1", "quantity": 2},
            "path_params": {},
            "params": {},
        },
        "status": "pending",
        "attempts": 0,
        "last_http_status": None,
        "last_error": None,
        "response_meta": {},
        "next_attempt_at": None,
        "processed_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeDb:
    def __init__(self, exchange):
        self.exchange = exchange
        self.flushes = 0
        self.commits = 0
        self.commit_statuses = []

    async def get(self, model, key):
        return self.exchange if key == self.exchange.id else None

    async def scalar(self, statement):
        return self.exchange

    async def flush(self):
        self.flushes += 1

    async def commit(self):
        self.commits += 1
        self.commit_statuses.append(self.exchange.status)


class FakeClient:
    def __init__(self, *, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def request(self, method, operation, **kwargs):
        self.calls.append((method, operation, kwargs))
        if self.error is not None:
            raise self.error
        return self.response


@pytest.mark.asyncio
async def test_success_persists_sending_before_network_then_acknowledges_without_values():
    exchange = _exchange()
    db = FakeDb(exchange)
    client = FakeClient(response={"externalId": "SECRET-42", "status": "ACCEPTED"})

    result = await execute_exchange(
        db,
        22,
        config=_config(idempotent=True),
        contract=_contract(),
        client=client,
    )

    assert db.commit_statuses == ["sending", "acknowledged"]
    assert result.status == "acknowledged"
    assert result.attempts == 1
    assert result.processed_at is not None
    assert len(client.calls) == 1
    method, operation, kwargs = client.calls[0]
    assert method == "POST"
    assert operation == "stock_movement_write"
    assert kwargs["idempotency_key"] == "bv-stock-22"
    assert result.response_meta["business_values_exposed"] is False
    assert "SECRET-42" not in repr(result.response_meta)
    assert "ACCEPTED" not in repr(result.response_meta)


@pytest.mark.asyncio
async def test_non_idempotent_ambiguous_failure_becomes_manual_review_not_retry():
    exchange = _exchange()
    db = FakeDb(exchange)
    client = FakeClient(error=PraxedoError("indeterminate_write", "ambiguous timeout"))

    result = await execute_exchange(
        db,
        22,
        config=_config(idempotent=False),
        contract=_contract(),
        client=client,
    )

    assert db.commit_statuses == ["sending", "indeterminate"]
    assert result.status == "indeterminate"
    assert result.attempts == 1
    assert result.next_attempt_at is None
    assert result.processed_at is not None


@pytest.mark.asyncio
async def test_idempotent_transient_failure_is_scheduled_for_retry():
    exchange = _exchange(
        status="retryable",
        attempts=1,
        next_attempt_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    db = FakeDb(exchange)
    client = FakeClient(error=PraxedoError("transport_error", "temporary network error"))

    before = datetime.now(timezone.utc)
    result = await execute_exchange(
        db,
        22,
        config=_config(idempotent=True),
        contract=_contract(),
        client=client,
        retry_delay_seconds=60,
    )

    assert db.commit_statuses == ["sending", "retryable"]
    assert result.status == "retryable"
    assert result.attempts == 2
    assert result.next_attempt_at is not None
    assert result.next_attempt_at >= before + timedelta(seconds=55)
    assert result.processed_at is None
    assert client.calls[0][2]["idempotency_key"] == "bv-stock-22"
