from backend.database.integration_models import (
    IntegrationExchange,
    IntegrationExternalReference,
)
from backend.integrations.journal import _advisory_lock_id, canonical_payload_hash


def test_payload_hash_is_stable_across_key_order():
    left = {"job": 42, "items": [{"reference": "CABLE", "quantity": 12}]}
    right = {"items": [{"quantity": 12, "reference": "CABLE"}], "job": 42}
    assert canonical_payload_hash(left) == canonical_payload_hash(right)


def test_payload_hash_changes_when_business_payload_changes():
    assert canonical_payload_hash({"quantity": 1}) != canonical_payload_hash({"quantity": 2})


def test_advisory_lock_identity_is_stable_and_namespace_sensitive():
    value = _advisory_lock_id("integration-exchange:praxedo:outbound:event-42")
    assert value == _advisory_lock_id("integration-exchange:praxedo:outbound:event-42")
    assert value != _advisory_lock_id("integration-exchange:praxedo:outbound:event-43")
    assert -(2**63) <= value < 2**63


def test_exchange_table_has_idempotency_uniqueness_contract():
    constraints = {
        constraint.name
        for constraint in IntegrationExchange.__table__.constraints
        if constraint.name
    }
    assert "uq_integration_exchange_idempotency" in constraints


def test_external_reference_has_two_way_uniqueness_contract():
    constraints = {
        constraint.name
        for constraint in IntegrationExternalReference.__table__.constraints
        if constraint.name
    }
    assert "uq_integration_external_ref_local" in constraints
    assert "uq_integration_external_ref_external" in constraints
