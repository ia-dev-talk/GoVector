from copy import deepcopy
from datetime import datetime, timezone

import pytest

from backend.integrations.qfield.contracts import (
    QFieldContractError,
    build_feature,
    business_payload_hash,
    decide_incoming_update,
    feature_collection,
    stable_feature_uuid,
)


NOW = datetime(2026, 9, 8, 10, 30, tzinfo=timezone.utc)


def _feature(revision: int = 4):
    return build_feature(
        layer="interventions",
        entity_type="job",
        local_entity_id=42,
        revision=revision,
        updated_at=NOW,
        geometry={"type": "Point", "coordinates": [-7.62, 33.59]},
        properties={"job_number": "BV-42", "status": "in_progress"},
    )


def test_stable_feature_uuid_is_deterministic_and_layer_scoped():
    first = stable_feature_uuid("interventions", "job", 42)
    assert first == stable_feature_uuid("interventions", "job", "42")
    assert first != stable_feature_uuid("cables", "job", 42)


def test_build_feature_rejects_reserved_bluevector_properties():
    with pytest.raises(QFieldContractError, match="reserved_property_name"):
        build_feature(
            layer="interventions",
            entity_type="job",
            local_entity_id=42,
            revision=1,
            updated_at=NOW,
            geometry=None,
            properties={"_bv_revision": 999},
        )


def test_unchanged_qfield_feature_is_noop():
    feature = _feature()
    current_hash = business_payload_hash(feature)
    assert (
        decide_incoming_update(
            feature,
            current_revision=4,
            current_business_hash=current_hash,
        )
        == "noop"
    )


def test_qfield_business_edit_applies_only_against_same_source_revision():
    exported = _feature()
    current_hash = business_payload_hash(exported)
    edited = deepcopy(exported)
    edited["properties"]["status"] = "completed"

    assert (
        decide_incoming_update(
            edited,
            current_revision=4,
            current_business_hash=current_hash,
        )
        == "apply"
    )


def test_stale_offline_edit_never_overwrites_newer_bluevector_revision():
    exported = _feature(revision=4)
    edited = deepcopy(exported)
    edited["properties"]["status"] = "completed"

    assert (
        decide_incoming_update(
            edited,
            current_revision=5,
            current_business_hash="0" * 64,
        )
        == "conflict_stale_revision"
    )


def test_same_revision_but_changed_server_payload_is_conflict():
    exported = _feature(revision=4)
    edited = deepcopy(exported)
    edited["properties"]["status"] = "completed"

    assert (
        decide_incoming_update(
            edited,
            current_revision=4,
            current_business_hash="0" * 64,
        )
        == "conflict_source_changed"
    )


def test_feature_collection_carries_contract_metadata():
    payload = feature_collection([_feature()], generated_at=NOW)
    assert payload["type"] == "FeatureCollection"
    assert payload["bluevector"]["contract"] == "qfield-sync-v1"
    assert payload["bluevector"]["feature_count"] == 1
