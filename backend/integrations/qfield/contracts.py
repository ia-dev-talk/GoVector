"""Revision-safe QField/QGIS exchange contracts.

This module deliberately stays transport-agnostic.  It gives every exported
feature a stable UUID plus the BlueVector source revision/hash it was based on.
When a QField edit comes back, BlueVector can distinguish a clean edit from a
stale/offline edit that would overwrite newer server data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any, Iterable, Mapping
from uuid import NAMESPACE_URL, uuid5


class QFieldContractError(ValueError):
    """Raised when a QField payload violates the BlueVector sync contract."""


_RESERVED_PREFIX = "_bv_"
_REQUIRED_META = (
    "_bv_uuid",
    "_bv_layer",
    "_bv_entity_type",
    "_bv_local_id",
    "_bv_revision",
    "_bv_updated_at",
    "_bv_base_hash",
)


def _canonical_hash(payload: Any) -> str:
    try:
        encoded = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise QFieldContractError("payload_not_json_serializable") from exc
    return sha256(encoded).hexdigest()


def _utc_iso(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise QFieldContractError("timestamp_must_be_timezone_aware")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def stable_feature_uuid(layer: str, entity_type: str, local_entity_id: int | str) -> str:
    """Return a deterministic UUID for one BlueVector entity in one QField layer."""

    layer = str(layer).strip()
    entity_type = str(entity_type).strip()
    local_id = str(local_entity_id).strip()
    if not layer or not entity_type or not local_id:
        raise QFieldContractError("feature_identity_incomplete")
    return str(uuid5(NAMESPACE_URL, f"bluevector:qfield:{layer}:{entity_type}:{local_id}"))


def _business_properties(properties: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in properties.items() if not key.startswith(_RESERVED_PREFIX)}


def business_payload_hash(feature: Mapping[str, Any]) -> str:
    properties = feature.get("properties")
    if not isinstance(properties, Mapping):
        raise QFieldContractError("feature_properties_required")
    return _canonical_hash(
        {
            "geometry": feature.get("geometry"),
            "properties": _business_properties(properties),
        }
    )


def build_feature(
    *,
    layer: str,
    entity_type: str,
    local_entity_id: int | str,
    revision: int,
    updated_at: datetime,
    geometry: Mapping[str, Any] | None,
    properties: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build one QField-safe GeoJSON feature from canonical BlueVector data."""

    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise QFieldContractError("revision_must_be_non_negative_integer")

    business_properties = dict(properties or {})
    if any(str(key).startswith(_RESERVED_PREFIX) for key in business_properties):
        raise QFieldContractError("reserved_property_name")

    if geometry is not None:
        if not isinstance(geometry, Mapping) or not geometry.get("type"):
            raise QFieldContractError("invalid_geojson_geometry")
        geometry = dict(geometry)

    feature_uuid = stable_feature_uuid(layer, entity_type, local_entity_id)
    updated_at_iso = _utc_iso(updated_at)
    base_hash = _canonical_hash(
        {"geometry": geometry, "properties": business_properties}
    )

    return {
        "type": "Feature",
        "id": feature_uuid,
        "geometry": geometry,
        "properties": {
            **business_properties,
            "_bv_uuid": feature_uuid,
            "_bv_layer": str(layer),
            "_bv_entity_type": str(entity_type),
            "_bv_local_id": str(local_entity_id),
            "_bv_revision": revision,
            "_bv_updated_at": updated_at_iso,
            "_bv_base_hash": base_hash,
        },
    }


def validate_incoming_feature(feature: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(feature, Mapping) or feature.get("type") != "Feature":
        raise QFieldContractError("geojson_feature_required")

    properties = feature.get("properties")
    if not isinstance(properties, Mapping):
        raise QFieldContractError("feature_properties_required")

    missing = [key for key in _REQUIRED_META if key not in properties]
    if missing:
        raise QFieldContractError(f"missing_sync_metadata:{','.join(missing)}")

    revision = properties.get("_bv_revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        raise QFieldContractError("invalid_sync_revision")

    expected_uuid = stable_feature_uuid(
        str(properties["_bv_layer"]),
        str(properties["_bv_entity_type"]),
        str(properties["_bv_local_id"]),
    )
    if properties.get("_bv_uuid") != expected_uuid or feature.get("id") != expected_uuid:
        raise QFieldContractError("feature_uuid_mismatch")

    base_hash = properties.get("_bv_base_hash")
    if not isinstance(base_hash, str) or len(base_hash) != 64:
        raise QFieldContractError("invalid_base_hash")

    return dict(properties)


def decide_incoming_update(
    feature: Mapping[str, Any],
    *,
    current_revision: int,
    current_business_hash: str,
) -> str:
    """Return apply/noop/conflict without mutating canonical BlueVector data.

    ``current_business_hash`` must be the hash of the current server-side
    geometry + business properties using the same canonical representation as
    :func:`business_payload_hash`.
    """

    properties = validate_incoming_feature(feature)
    incoming_revision = int(properties["_bv_revision"])
    base_hash = str(properties["_bv_base_hash"])

    if incoming_revision < current_revision:
        return "conflict_stale_revision"
    if incoming_revision > current_revision:
        return "conflict_future_revision"
    if base_hash != current_business_hash:
        return "conflict_source_changed"

    incoming_hash = business_payload_hash(feature)
    if incoming_hash == current_business_hash:
        return "noop"
    return "apply"


def feature_collection(
    features: Iterable[Mapping[str, Any]],
    *,
    generated_at: datetime,
) -> dict[str, Any]:
    items = [dict(feature) for feature in features]
    for feature in items:
        validate_incoming_feature(feature)
    return {
        "type": "FeatureCollection",
        "features": items,
        "bluevector": {
            "contract": "qfield-sync-v1",
            "generated_at": _utc_iso(generated_at),
            "feature_count": len(items),
        },
    }
