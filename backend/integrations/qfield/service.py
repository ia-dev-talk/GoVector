"""Revision-safe QField round trip for BlueVector GIS features.

QField edits are preflighted against the exact BlueVector revision/hash they
were exported from. A batch is all-or-nothing: any stale/foreign feature blocks
the apply, preventing partial field syncs that are difficult to reconcile.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any, Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.gis_models import GeoDataset, GeoFeature, GeoFeatureRevision, GeoLayer
from backend.integrations.qfield.contracts import (
    QFieldContractError,
    build_feature,
    business_payload_hash,
    decide_incoming_update,
    feature_collection,
    validate_incoming_feature,
)
from backend.services.gis.kml_parser import GisImportError, geometry_bounds
from backend.services.gis.upload_parser import parse_geojson_upload


class QFieldSyncError(RuntimeError):
    def __init__(self, code: str, message: str, *, status_code: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


_MAX_BATCH_FEATURES = 1000
_CORE_PROPERTIES = {"name", "asset_type", "status"}


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _layer_contract_id(layer: GeoLayer) -> str:
    return f"geo-layer:{layer.public_id}"


def _business_properties(feature: GeoFeature) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": feature.name,
        "asset_type": feature.asset_type,
        "status": feature.status,
    }
    for key, value in dict(feature.attributes_json or {}).items():
        key = str(key)
        if key.startswith("_bv_") or key in _CORE_PROPERTIES:
            continue
        result[key] = value
    return result


def _contract_feature(feature: GeoFeature, layer: GeoLayer) -> dict[str, Any]:
    return build_feature(
        layer=_layer_contract_id(layer),
        entity_type="geo_feature",
        local_entity_id=feature.id,
        revision=int(feature.revision or 0),
        updated_at=_aware_utc(feature.updated_at),
        geometry=feature.geometry_geojson,
        properties=_business_properties(feature),
    )


def _normalize_incoming_feature(incoming: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Reuse the hardened GeoJSON parser for geometry/property validation."""

    try:
        encoded = json.dumps(
            {"type": "FeatureCollection", "features": [dict(incoming)]},
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        parsed = parse_geojson_upload("qfield-sync.geojson", encoded)
    except (TypeError, ValueError, GisImportError) as exc:
        raise QFieldSyncError("invalid_geojson", str(exc)) from exc
    parsed_feature = parsed.features[0]
    properties = {
        key: value
        for key, value in parsed_feature.properties.items()
        if not str(key).startswith("_bv_")
    }
    return parsed_feature.geometry_geojson, properties


def _split_properties(properties: Mapping[str, Any]) -> tuple[str | None, str, str, dict[str, Any]]:
    name_raw = properties.get("name")
    name = str(name_raw).strip()[:255] if name_raw is not None and str(name_raw).strip() else None
    asset_type = str(properties.get("asset_type") or "UNCLASSIFIED").strip()[:64] or "UNCLASSIFIED"
    status = str(properties.get("status") or "ACTIVE").strip()[:24] or "ACTIVE"
    attributes = {
        str(key): value
        for key, value in properties.items()
        if str(key) not in _CORE_PROPERTIES and not str(key).startswith("_bv_")
    }
    return name, asset_type, status, attributes


def _feature_snapshot(feature: GeoFeature) -> dict[str, Any]:
    return {
        "geometry": feature.geometry_geojson,
        "geometry_type": feature.geometry_type,
        "attributes": feature.attributes_json,
        "name": feature.name,
        "asset_type": feature.asset_type,
        "status": feature.status,
        "revision": feature.revision,
        "provenance": feature.provenance_json,
    }


def _validate_collection(collection: Mapping[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(collection, Mapping) or collection.get("type") != "FeatureCollection":
        raise QFieldSyncError("feature_collection_required", "Le payload QField doit être une FeatureCollection")
    features = collection.get("features")
    if not isinstance(features, list):
        raise QFieldSyncError("features_required", "La liste d'entités QField est manquante")
    if len(features) > _MAX_BATCH_FEATURES:
        raise QFieldSyncError("batch_too_large", f"Maximum {_MAX_BATCH_FEATURES} entités par synchronisation")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in features:
        if not isinstance(raw, dict):
            raise QFieldSyncError("invalid_feature", "Une entité QField est invalide")
        try:
            meta = validate_incoming_feature(raw)
        except QFieldContractError as exc:
            raise QFieldSyncError("invalid_sync_contract", str(exc)) from exc
        feature_uuid = str(meta["_bv_uuid"])
        if feature_uuid in seen:
            raise QFieldSyncError("duplicate_feature", "Une entité QField est dupliquée dans le lot")
        seen.add(feature_uuid)
        result.append(raw)
    return result


async def export_dataset(
    db: AsyncSession,
    *,
    dataset_id: int,
    layer_id: int | None = None,
) -> dict[str, Any]:
    dataset = await db.get(GeoDataset, dataset_id)
    if dataset is None:
        raise QFieldSyncError("dataset_not_found", "Jeu de données introuvable", status_code=404)
    if dataset.status != "PUBLISHED":
        raise QFieldSyncError("dataset_not_published", "Publiez le jeu de données avant synchronisation", status_code=409)

    statement = select(GeoFeature, GeoLayer).join(GeoLayer).where(GeoLayer.dataset_id == dataset_id)
    if layer_id is not None:
        statement = statement.where(GeoLayer.id == layer_id)
    rows = (await db.execute(statement.order_by(GeoFeature.id))).all()
    if layer_id is not None and not rows:
        layer = await db.get(GeoLayer, layer_id)
        if layer is None or layer.dataset_id != dataset_id:
            raise QFieldSyncError("layer_not_found", "Couche introuvable", status_code=404)

    result = feature_collection(
        (_contract_feature(feature, layer) for feature, layer in rows),
        generated_at=datetime.now(timezone.utc),
    )
    result["bluevector"].update(
        {
            "dataset_public_id": dataset.public_id,
            "dataset_revision": dataset.revision,
            "mode": "revision_safe_round_trip",
        }
    )
    return result


async def _inspect_one(
    db: AsyncSession,
    *,
    dataset_id: int,
    incoming: Mapping[str, Any],
    lock: bool,
) -> tuple[GeoFeature, GeoLayer, str]:
    try:
        meta = validate_incoming_feature(incoming)
        local_id = int(str(meta["_bv_local_id"]))
    except (QFieldContractError, TypeError, ValueError) as exc:
        raise QFieldSyncError("invalid_feature_identity", "Identité BlueVector QField invalide") from exc

    statement = select(GeoFeature).where(GeoFeature.id == local_id)
    if lock:
        statement = statement.with_for_update()
    feature = await db.scalar(statement)
    if feature is None:
        raise QFieldSyncError("feature_not_found", f"Entité BlueVector #{local_id} introuvable", status_code=404)
    layer = await db.get(GeoLayer, feature.layer_id)
    if layer is None or layer.dataset_id != dataset_id:
        raise QFieldSyncError("foreign_feature", "L'entité n'appartient pas à ce jeu de données", status_code=409)
    if str(meta["_bv_entity_type"]) != "geo_feature" or str(meta["_bv_layer"]) != _layer_contract_id(layer):
        raise QFieldSyncError("feature_scope_mismatch", "Le contrat couche/entité QField ne correspond plus", status_code=409)

    current = _contract_feature(feature, layer)
    current_hash = business_payload_hash(current)
    try:
        decision = decide_incoming_update(
            incoming,
            current_revision=int(feature.revision or 0),
            current_business_hash=current_hash,
        )
    except QFieldContractError as exc:
        raise QFieldSyncError("invalid_sync_contract", str(exc)) from exc
    return feature, layer, decision


async def preview_changes(
    db: AsyncSession,
    *,
    dataset_id: int,
    collection: Mapping[str, Any],
) -> dict[str, Any]:
    features = _validate_collection(collection)
    decisions = []
    for incoming in features:
        feature, layer, decision = await _inspect_one(
            db,
            dataset_id=dataset_id,
            incoming=incoming,
            lock=False,
        )
        decisions.append(
            {
                "feature_id": feature.id,
                "feature_public_id": feature.public_id,
                "layer_id": layer.id,
                "current_revision": feature.revision,
                "decision": decision,
            }
        )
    return {
        "feature_count": len(decisions),
        "apply_count": sum(item["decision"] == "apply" for item in decisions),
        "noop_count": sum(item["decision"] == "noop" for item in decisions),
        "conflict_count": sum(item["decision"].startswith("conflict_") for item in decisions),
        "items": decisions,
    }


async def apply_changes(
    db: AsyncSession,
    *,
    dataset_id: int,
    collection: Mapping[str, Any],
    user: Any,
) -> dict[str, Any]:
    features = _validate_collection(collection)
    dataset = await db.scalar(
        select(GeoDataset).where(GeoDataset.id == dataset_id).with_for_update()
    )
    if dataset is None:
        raise QFieldSyncError("dataset_not_found", "Jeu de données introuvable", status_code=404)
    if dataset.status != "PUBLISHED":
        raise QFieldSyncError("dataset_not_published", "Le jeu de données n'est pas publié", status_code=409)

    inspected: list[tuple[dict[str, Any], GeoFeature, GeoLayer, str]] = []
    for incoming in features:
        feature, layer, decision = await _inspect_one(
            db,
            dataset_id=dataset_id,
            incoming=incoming,
            lock=True,
        )
        inspected.append((incoming, feature, layer, decision))

    conflicts = [
        {
            "feature_id": feature.id,
            "decision": decision,
            "current_revision": feature.revision,
        }
        for _incoming, feature, _layer, decision in inspected
        if decision.startswith("conflict_")
    ]
    if conflicts:
        raise QFieldSyncError(
            "sync_conflict",
            json.dumps({"conflicts": conflicts}, ensure_ascii=False),
            status_code=409,
        )

    now = datetime.now(timezone.utc)
    applied = 0
    noop = 0
    for incoming, feature, _layer, decision in inspected:
        if decision == "noop":
            noop += 1
            continue
        geometry, properties = _normalize_incoming_feature(incoming)
        name, asset_type, status, attributes = _split_properties(properties)
        before = _feature_snapshot(feature)
        bounds = geometry_bounds(geometry)
        revision_before = int(feature.revision or 0)

        feature.geometry_geojson = geometry
        feature.geometry_type = str(geometry["type"])
        feature.bbox_json = {"bounds": list(bounds)}
        feature.bbox_min_longitude = bounds[0]
        feature.bbox_min_latitude = bounds[1]
        feature.bbox_max_longitude = bounds[2]
        feature.bbox_max_latitude = bounds[3]
        # Avoid retaining a stale centroid after geometry changes. A future
        # PostGIS projection can compute a true centroid rather than a bbox guess.
        feature.centroid_longitude = None
        feature.centroid_latitude = None
        feature.name = name
        feature.asset_type = asset_type
        feature.status = status
        feature.attributes_json = attributes
        feature.provenance_json = {
            **dict(feature.provenance_json or {}),
            "last_qfield_sync_at": now.isoformat(),
            "qfield_base_revision": revision_before,
        }
        feature.revision = revision_before + 1
        feature.updated_by_user_id = getattr(user, "id", None)
        feature.updated_at = now
        db.add(
            GeoFeatureRevision(
                feature_id=feature.id,
                operation="QFIELD_UPDATE",
                revision_before=revision_before,
                revision_after=feature.revision,
                actor_user_id=getattr(user, "id", None),
                reason="Synchronisation QField revision-safe",
                before_json=before,
                after_json=_feature_snapshot(feature),
            )
        )
        applied += 1

    if applied:
        dataset.revision = int(dataset.revision or 0) + 1
        dataset.updated_at = now
    await db.commit()
    return {
        "status": "applied" if applied else "noop",
        "feature_count": len(inspected),
        "applied_count": applied,
        "noop_count": noop,
        "dataset_revision": dataset.revision,
    }
