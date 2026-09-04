"""Append-only GIS imports, separate from operational sites/sectors/equipment."""

from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import select, text

from backend.database.gis_models import GeoDataset, GeoLayer, GeoFeature, GeoFeatureRevision
from backend.database.models import ClientOrganization
from backend.logic.operational_audit import record_operational_audit
from backend.services.gis.kml_parser import geometry_bounds

MAX_PERSISTED_FEATURES = 10000


def validate_import(parsed):
    if len(parsed.source_filename) > 255 or len(parsed.source_entry or "") > 512:
        raise HTTPException(422, "Le nom du fichier ou de son entrée KML est trop long.")
    if len(parsed.features) > MAX_PERSISTED_FEATURES:
        raise HTTPException(422, "Découpez le fichier : 10 000 objets maximum par jeu de données.")
    seen = set()
    for feature in parsed.features:
        if len(feature.folder_path) > 512 or len(feature.name or "") > 255 or len(feature.external_id or "") > 255:
            raise HTTPException(422, "Un nom ou identifiant géographique dépasse la taille acceptée.")
        key = (feature.folder_path, feature.geometry_type, feature.external_id)
        if feature.external_id and key in seen:
            raise HTTPException(422, "Identifiant externe dupliqué dans une couche : import refusé.")
        seen.add(key)


def preview(parsed):
    validate_import(parsed)
    counts = Counter((f.folder_path, f.geometry_type) for f in parsed.features)
    return {
        "sha256": parsed.sha256, "filename": parsed.source_filename,
        "feature_count": len(parsed.features), "bbox": list(parsed.bbox),
        "warnings": list(parsed.warnings), "source_type": parsed.source_type,
        "layers": [{"folder_path": folder, "geometry_type": kind, "feature_count": count}
                   for (folder, kind), count in counts.items()],
        "sample": [{"name": f.name, "type": f.geometry_type, "geometry": f.geometry_geojson} for f in parsed.features[:20]],
        "sample_is_partial": len(parsed.features) > 20,
    }


def dataset_payload(dataset):
    return {"id": dataset.id, "public_id": dataset.public_id, "name": dataset.name,
            "client_organization_id": dataset.client_organization_id,
            "status": dataset.status, "revision": dataset.revision,
            "feature_count": dataset.feature_count, "source_sha256": dataset.source_sha256,
            "source_filename": dataset.source_filename, "created_at": dataset.created_at,
            "published_at": dataset.published_at, "validation": dataset.validation_json}


async def import_dataset(db, *, parsed, client_id, name, expected_sha256, user):
    validate_import(parsed)
    if parsed.sha256 != expected_sha256:
        raise HTTPException(409, "Le fichier a changé depuis l’aperçu. Analysez-le à nouveau.")
    active = await db.scalar(select(ClientOrganization.is_active).where(ClientOrganization.id == client_id))
    if active is not True:
        raise HTTPException(422, "Choisissez une entreprise cliente active.")
    # Serialize identical imports per tenant, including concurrent retries.
    lock_id = int.from_bytes(sha256(f"{client_id}:{parsed.sha256}".encode()).digest()[:8], "big", signed=True)
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})
    existing = await db.scalar(select(GeoDataset).where(
        GeoDataset.client_organization_id == client_id, GeoDataset.source_sha256 == parsed.sha256,
    ).order_by(GeoDataset.id).limit(1))
    if existing:
        return {**dataset_payload(existing), "reused": True}
    dataset = GeoDataset(
        client_organization_id=client_id, name=name,
        source_type=parsed.source_type, source_filename=parsed.source_filename,
        source_entry=parsed.source_entry, source_sha256=parsed.sha256,
        source_size_bytes=parsed.size_bytes, feature_count=len(parsed.features),
        bbox_json={"bounds": list(parsed.bbox)},
        validation_json={"warnings": list(parsed.warnings), "geometry_counts": parsed.feature_counts},
        metadata_json={"crs": "EPSG:4326", "operational_linking": "NONE"},
        created_by_user_id=user.id,
    )
    db.add(dataset)
    await db.flush()
    counts = Counter((f.folder_path, f.geometry_type) for f in parsed.features)
    layers = {key: GeoLayer(dataset_id=dataset.id, name=(key[0] or "Sans dossier")[-180:],
                           folder_path=key[0], feature_type=key[1], is_editable=False)
              for key in counts}
    db.add_all(layers.values())
    await db.flush()
    features = []
    for item in parsed.features:
        bounds = geometry_bounds(item.geometry_geojson)
        feature = GeoFeature(
            layer_id=layers[(item.folder_path, item.geometry_type)].id,
            external_id=item.external_id, name=item.name,
            geometry_type=item.geometry_type, geometry_geojson=item.geometry_geojson,
            bbox_json={"bounds": list(bounds)}, bbox_min_longitude=bounds[0],
            bbox_min_latitude=bounds[1], bbox_max_longitude=bounds[2], bbox_max_latitude=bounds[3],
            attributes_json=item.properties, style_json=item.style,
            provenance_json={"source_sha256": parsed.sha256, "folder_path": item.folder_path,
                             "source_entry": parsed.source_entry},
            created_by_user_id=user.id,
        )
        features.append(feature)
    db.add_all(features)
    await db.flush()
    db.add_all([GeoFeatureRevision(
        feature_id=f.id, operation="IMPORT", revision_before=0, revision_after=1,
        actor_user_id=user.id, reason="Import KML/KMZ en brouillon",
        after_json={"geometry": f.geometry_geojson, "attributes": f.attributes_json,
                    "name": f.name, "external_id": f.external_id, "provenance": f.provenance_json,
                    "style": f.style_json},
    ) for f in features])
    record_operational_audit(db, current_user=user, action="gis.dataset_imported",
        entity_type="geo_dataset", entity_id=dataset.id,
        after={"client_organization_id": client_id, "source_sha256": parsed.sha256,
               "feature_count": len(features), "status": "DRAFT"})
    await db.commit()
    await db.refresh(dataset)
    return {**dataset_payload(dataset), "reused": False}


async def publish_dataset(db, *, dataset_id, expected_revision, user):
    dataset = await db.scalar(select(GeoDataset).where(GeoDataset.id == dataset_id).with_for_update())
    if dataset is None:
        raise HTTPException(404, "Jeu de données introuvable")
    if dataset.revision != expected_revision:
        raise HTTPException(409, "Révision périmée : rechargez le jeu de données.")
    if dataset.status != "DRAFT":
        raise HTTPException(409, "Seul un brouillon peut être publié.")
    active = await db.scalar(select(ClientOrganization.is_active).where(ClientOrganization.id == dataset.client_organization_id))
    if active is not True:
        raise HTTPException(409, "L’entreprise cliente n’est plus active.")
    dataset.status = "PUBLISHED"
    dataset.revision += 1
    dataset.published_at = datetime.now(timezone.utc)
    dataset.published_by_user_id = user.id
    record_operational_audit(db, current_user=user, action="gis.dataset_published",
        entity_type="geo_dataset", entity_id=dataset.id,
        before={"status": "DRAFT", "revision": expected_revision},
        after={"status": dataset.status, "revision": dataset.revision})
    await db.commit()
    await db.refresh(dataset)
    return dataset_payload(dataset)


async def export_geojson(db, *, dataset_id, layer_id=None):
    dataset = await db.get(GeoDataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, "Jeu de données introuvable")
    if dataset.status != "PUBLISHED":
        raise HTTPException(409, "Publiez le brouillon avant de l’exporter.")
    statement = select(GeoFeature, GeoLayer.folder_path).join(GeoLayer).where(GeoLayer.dataset_id == dataset_id)
    if layer_id is not None:
        layer = await db.get(GeoLayer, layer_id)
        if layer is None or layer.dataset_id != dataset_id:
            raise HTTPException(404, "Couche introuvable dans ce jeu de données")
        statement = statement.where(GeoLayer.id == layer_id)
    rows = (await db.execute(statement.order_by(GeoFeature.id))).all()
    return {"type": "FeatureCollection", "name": dataset.name,
        "bluevector": {"dataset_id": dataset.public_id, "revision": dataset.revision,
                       "source_sha256": dataset.source_sha256, "feature_count": len(rows)},
        "features": [{"type": "Feature", "id": f.public_id, "geometry": f.geometry_geojson,
                      "properties": {**f.attributes_json, "_bluevector": {
                          "feature_id": f.public_id, "revision": f.revision,
                          "source_id": f.external_id, "name": f.name, "folder": folder,
                          "source_attributes": f.attributes_json}}}
                     for f, folder in rows]}


async def stored_preview(db, *, dataset_id):
    dataset = await db.get(GeoDataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, "Jeu de données introuvable")
    rows = (await db.execute(select(GeoFeature).join(GeoLayer)
        .where(GeoLayer.dataset_id == dataset_id).order_by(GeoFeature.id).limit(20))).scalars().all()
    return {
        "sha256": dataset.source_sha256, "filename": dataset.source_filename,
        "feature_count": dataset.feature_count, "bbox": dataset.bbox_json['bounds'],
        "warnings": dataset.validation_json.get('warnings', []), "source_type": dataset.source_type,
        "sample": [{"name": f.name, "type": f.geometry_type, "geometry": f.geometry_geojson} for f in rows],
        "sample_is_partial": dataset.feature_count > len(rows),
    }
