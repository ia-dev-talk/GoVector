from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from backend.integrations.exchange_state import claim_exchange_attempt, finish_exchange_attempt
from backend.integrations.journal import IntegrationConflict
from backend.integrations.praxedo.client import PraxedoConfig, PraxedoError
from backend.integrations.praxedo.outbox import (
    PraxedoOutboxError,
    classify_failure,
    prepare_outbound_request,
)
from backend.integrations.praxedo.write_contract import (
    PraxedoWriteContract,
    PraxedoWriteContractError,
)


def _config(**overrides):
    values = {
        "base_url": "https://sandbox.example.test/root/",
        "auth_mode": "basic",
        "endpoints": {
            "work_report_write": "api/reports/{external_id}",
            "stock_movement_write": "api/stock-movements",
        },
        "username": "test",
        "password": "secret",
        "max_retries": 0,
    }
    values.update(overrides)
    return PraxedoConfig(**values)


def _contract(**overrides):
    values = {
        "confirmed": True,
        "contract_version": "tenant-v1",
        "methods": {
            "work_report_write": "PATCH",
            "stock_movement_write": "POST",
        },
    }
    values.update(overrides)
    return PraxedoWriteContract(**values)


def _exchange(**overrides):
    values = {
        "id": 12,
        "system": "praxedo",
        "direction": "outbound",
        "operation": "work_report_write",
        "idempotency_key": "bv-praxedo-12",
        "payload": {
            "contract_version": "tenant-v1",
            "body": {"tenantField": "mapped-value"},
            "path_params": {"external_id": "PXO/42"},
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


def test_write_contract_fails_closed_until_explicitly_confirmed():
    with pytest.raises(PraxedoWriteContractError) as exc_info:
        _contract(confirmed=False).method_for("work_report_write")
    assert exc_info.value.code == "write_contract_not_confirmed"


def test_prepare_request_requires_matching_tenant_contract_version():
    exchange = _exchange(
        payload={
            "contract_version": "old-v0",
            "body": {"tenantField": "mapped-value"},
        }
    )
    with pytest.raises(PraxedoOutboxError) as exc_info:
        prepare_outbound_request(exchange, contract=_contract(), config=_config())
    assert exc_info.value.code == "outbox_contract_version_mismatch"


def test_prepare_request_rejects_unknown_envelope_fields():
    exchange = _exchange()
    exchange.payload["raw_bluevector_payload"] = {"must": "not-send"}
    with pytest.raises(PraxedoOutboxError) as exc_info:
        prepare_outbound_request(exchange, contract=_contract(), config=_config())
    assert exc_info.value.code == "outbox_envelope_unknown_fields"


def test_first_non_idempotent_attempt_is_allowed_but_replay_is_not():
    first = prepare_outbound_request(
        _exchange(),
        contract=_contract(),
        config=_config(idempotency_header=None),
    )
    assert first["method"] == "PATCH"
    assert first["idempotency_key"] is None
    assert first["replay_safe"] is False

    replay = _exchange(status="retryable", attempts=1)
    with pytest.raises(PraxedoOutboxError) as exc_info:
        prepare_outbound_request(
            replay,
            contract=_contract(),
            config=_config(idempotency_header=None),
        )
    assert exc_info.value.code == "automatic_replay_not_safe"


def test_confirmed_idempotency_allows_retry_with_same_exchange_key():
    request = prepare_outbound_request(
        _exchange(status="retryable", attempts=1),
        contract=_contract(),
        config=_config(idempotency_header="Idempotency-Key"),
    )
    assert request["replay_safe"] is True
    assert request["idempotency_key"] == "bv-praxedo-12"


def test_failure_classification_never_retries_ambiguous_non_idempotent_write():
    ambiguous = PraxedoError("indeterminate_write", "timeout")
    assert classify_failure(ambiguous, replay_safe=False) == "indeterminate"

    transient = PraxedoError("transport_error", "network")
    assert classify_failure(transient, replay_safe=False) == "indeterminate"
    assert classify_failure(transient, replay_safe=True) == "retryable"

    throttled = PraxedoError("http_error", "429", status_code=429)
    assert classify_failure(throttled, replay_safe=True) == "retryable"
    assert classify_failure(throttled, replay_safe=False) == "indeterminate"

    bad_request = PraxedoError("http_error", "400", status_code=400)
    assert classify_failure(bad_request, replay_safe=True) == "rejected"


class FakeDb:
    def __init__(self, exchange):
        self.exchange = exchange
        self.flushes = 0

    async def scalar(self, statement):
        return self.exchange

    async def flush(self):
        self.flushes += 1


@pytest.mark.asyncio
async def test_claim_counts_one_attempt_and_sets_sending():
    exchange = _exchange(status="pending", attempts=2)
    db = FakeDb(exchange)
    result = await claim_exchange_attempt(db, exchange_id=12)
    assert result is exchange
    assert exchange.status == "sending"
    assert exchange.attempts == 3
    assert db.flushes == 1


@pytest.mark.asyncio
async def test_retry_claim_refuses_future_schedule():
    exchange = _exchange(
        status="retryable",
        attempts=1,
        next_attempt_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db = FakeDb(exchange)
    with pytest.raises(IntegrationConflict) as exc_info:
        await claim_exchange_attempt(db, exchange_id=12)
    assert exc_info.value.code == "exchange_retry_not_due"


@pytest.mark.asyncio
async def test_finish_indeterminate_is_terminal_without_incrementing_attempts():
    exchange = _exchange(status="sending", attempts=1)
    db = FakeDb(exchange)
    result = await finish_exchange_attempt(
        db,
        exchange_id=12,
        status="indeterminate",
        error="indeterminate_write: timeout",
        response_meta={"error_code": "indeterminate_write"},
    )
    assert result.status == "indeterminate"
    assert result.attempts == 1
    assert result.processed_at is not None
    assert result.next_attempt_at is None


@pytest.mark.asyncio
async def test_retryable_outcome_requires_schedule():
    exchange = _exchange(status="sending", attempts=1)
    db = FakeDb(exchange)
    with pytest.raises(IntegrationConflict) as exc_info:
        await finish_exchange_attempt(
            db,
            exchange_id=12,
            status="retryable",
        )
    assert exc_info.value.code == "retry_schedule_required"
