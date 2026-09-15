"""Hierarchical territory and GeoJSON administration for GoVector."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user, require_chef_orienteur
from backend.database.connection import get_db
from backend.database.models import Sector, User
from backend.database.territory_models import TerritoryNode
from backend.logic.territory_import import (
    clean_import_text,
    extract_qgis_identity,
    extract_qgis_sector_link_id,
    is_placeholder_label,
    normalize_import_kind,
    qgis_metadata,
    resolve_import_sector_id,
)


router = APIRouter(prefix="/territories", tags=["Territories & GIS"])
_ALLOWED_KINDS = {"REGION", "ZONE", "SECTOR", "SUBSECTOR", "MICROZONE"}
_ALLOWED_GEOMETRIES = {"Polygon", "MultiPolygon"}


def _clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _validate_geometry(value: Optional[dict]) -> Optional[dict]:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("La géométrie doit être un objet GeoJSON.")
    geometry_type = value.get("type")
    if geometry_type not in _ALLOWED_GEOMETRIES:
        raise ValueError("Seuls Polygon et MultiPolygon sont acceptés pour un territoire.")
    coordinates = value.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        raise ValueError("La géométrie GeoJSON ne contient pas de coordonnées.")
    return value


class TerritoryWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Optional[str] = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=140)
    kind: str = Field(default="SECTOR", max_length=32)
    parent_id: Optional[int] = Field(default=None, gt=0)
    legacy_sector_id: Optional[int] = Field(default=None, gt=0)
    color: Optional[str] = Field(default=None, max_length=7)
    description: Optional[str] = None
    geometry_geojson: Optional[dict] = None
    centroid_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    centroid_longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    source: str = Field(default="manual", max_length=32)
    external_id: Optional[str] = Field(default=None, max_length=160)
    is_active: bool = True
    sort_order: int = 0
    metadata_json: dict = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = str(value).strip()
        if not normalized:
            raise ValueError("Le nom du territoire est obligatoire.")
        return normalized

    @field_validator("code", "color", "description", "external_id")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value)

    @field_validator("kind")
    @classmethod
    def normalize_kind(cls, value: str) -> str:
        normalized = str(value).strip().upper()
        if normalized not in _ALLOWED_KINDS:
            raise ValueError(f"Type territoire invalide: {normalized}")
        return normalized

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: str) -> str:
        normalized = str(value or "manual").strip().lower()
        return normalized or "manual"

    @field_validator("geometry_geojson")
    @classmethod
    def validate_geometry(cls, value: Optional[dict]) -> Optional[dict]:
        return _validate_geometry(value)


class TerritoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Optional[str] = Field(default=None, max_length=80)
    name: Optional[str] = Field(default=None, min_length=1, max_length=140)
    kind: Optional[str] = Field(default=None, max_length=32)
    parent_id: Optional[int] = Field(default=None, gt=0)
    legacy_sector_id: Optional[int] = Field(default=None, gt=0)
    color: Optional[str] = Field(default=None, max_length=7)
    description: Optional[str] = None
    geometry_geojson: Optional[dict] = None
    centroid_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    centroid_longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    source: Optional[str] = Field(default=None, max_length=32)
    external_id: Optional[str] = Field(default=None, max_length=160)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    metadata_json: Optional[dict] = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value)

    @field_validator("code", "color", "description", "external_id")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value)

    @field_validator("kind")
    @classmethod
    def normalize_kind(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip().upper()
        if normalized not in _ALLOWED_KINDS:
            raise ValueError(f"Type territoire invalide: {normalized}")
        return normalized

    @field_validator("source")
    @classmethod
    def normalize_source(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else (str(value).strip().lower() or "manual")

    @field_validator("geometry_geojson")
    @classmethod
    def validate_geometry(cls, value: Optional[dict]) -> Optional[dict]:
        return _validate_geometry(value)


class GeoJsonImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_collection: dict
    source: str = "qgis"
    update_existing: bool = True


def _node_payload(node: TerritoryNode, child_count: int = 0) -> dict[str, Any]:
    return {
        "id": node.id,
        "code": node.code,
        "name": node.name,
        "kind": node.kind,
        "parent_id": node.parent_id,
        "legacy_sector_id": node.legacy_sector_id,
        "color": node.color,
        "description": node.description,
        "geometry_geojson": node.geometry_geojson,
        "centroid_latitude": node.centroid_latitude,
        "centroid_longitude": node.centroid_longitude,
        "source": node.source,
        "external_id": node.external_id,
        "is_active": node.is_active,
        "sort_order": node.sort_order,
        "metadata_json": node.metadata_json,
        "child_count": child_count,
        "created_at": node.created_at,
        "updated_at": node.updated_at,
    }


async def _validate_links(
    db: AsyncSession,
    *,
    node_id: Optional[int] = None,
    parent_id: Optional[int] = None,
    legacy_sector_id: Optional[int] = None,
) -> None:
    if parent_id is not None:
        parent = await db.get(TerritoryNode, parent_id)
        if parent is None:
            raise HTTPException(422, "Territoire parent introuvable")
        if node_id is not None:
            if parent_id == node_id:
                raise HTTPException(422, "Un territoire ne peut pas être son propre parent")
            cursor = parent
            visited = set()
            while cursor is not None and cursor.id not in visited:
                if cursor.id == node_id:
                    raise HTTPException(422, "Cette hiérarchie créerait une boucle")
                visited.add(cursor.id)
                cursor = await db.get(TerritoryNode, cursor.parent_id) if cursor.parent_id else None

    if legacy_sector_id is not None and await db.get(Sector, legacy_sector_id) is None:
        raise HTTPException(422, "Secteur opérationnel lié introuvable")


async def _sector_registry(db: AsyncSession):
    return (
        await db.execute(
            select(
                Sector.id,
                Sector.name,
                Sector.description,
                Sector.is_active,
            )
        )
    ).mappings().all()


def _unique_external_nodes(nodes: list[TerritoryNode]) -> dict[str, TerritoryNode]:
    grouped: dict[str, list[TerritoryNode]] = defaultdict(list)
    for node in nodes:
        external_id = clean_import_text(node.external_id)
        if external_id:
            grouped[external_id].append(node)
    return {
        key: records[0]
        for key, records in grouped.items()
        if len(records) == 1
    }


def _safe_repair_name(
    node: TerritoryNode,
    *,
    candidate: Optional[str],
    used_by_parent: dict[Optional[int], set[str]],
) -> str:
    base = clean_import_text(candidate) or clean_import_text(node.code) or clean_import_text(node.external_id)
    base = base or f"Territoire QGIS #{node.id}"
    base = base[:140]
    sibling_names = used_by_parent[node.parent_id]
    normalized = base.casefold()
    if normalized in sibling_names:
        suffix = f" · {node.id}"
        base = f"{base[: max(1, 140 - len(suffix))]}{suffix}"
        normalized = base.casefold()
    sibling_names.add(normalized)
    return base


@router.get("")
async def list_territories(
    include_inactive: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    child = TerritoryNode.__table__.alias("child")
    statement = (
        select(TerritoryNode, func.count(child.c.id).label("child_count"))
        .outerjoin(child, child.c.parent_id == TerritoryNode.id)
        .group_by(TerritoryNode.id)
        .order_by(TerritoryNode.sort_order, TerritoryNode.name)
    )
    if not include_inactive:
        statement = statement.where(TerritoryNode.is_active.is_(True))
    rows = (await db.execute(statement)).all()
    return [_node_payload(node, int(child_count or 0)) for node, child_count in rows]


@router.get("/geojson")
async def export_territories_geojson(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    statement = select(TerritoryNode).order_by(TerritoryNode.sort_order, TerritoryNode.name)
    if not include_inactive:
        statement = statement.where(TerritoryNode.is_active.is_(True))
    nodes = (await db.execute(statement)).scalars().all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": node.external_id or node.id,
                "geometry": node.geometry_geojson,
                "properties": {
                    "id": node.id,
                    "code": node.code,
                    "name": node.name,
                    "kind": node.kind,
                    "parent_id": node.parent_id,
                    "legacy_sector_id": node.legacy_sector_id,
                    "color": node.color,
                    "source": node.source,
                    "external_id": node.external_id,
                    "is_active": node.is_active,
                },
            }
            for node in nodes
            if node.geometry_geojson is not None
        ],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_territory(
    document: TerritoryWrite,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    await _validate_links(
        db,
        parent_id=document.parent_id,
        legacy_sector_id=document.legacy_sector_id,
    )
    node = TerritoryNode(**document.model_dump())
    db.add(node)
    try:
        await db.commit()
        await db.refresh(node)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Code ou nom déjà utilisé à ce niveau") from exc
    return _node_payload(node)


@router.put("/{territory_id}")
async def update_territory(
    territory_id: int,
    document: TerritoryPatch,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    node = await db.get(TerritoryNode, territory_id)
    if node is None:
        raise HTTPException(404, "Territoire introuvable")
    changes = document.model_dump(exclude_unset=True)
    await _validate_links(
        db,
        node_id=territory_id,
        parent_id=changes.get("parent_id", node.parent_id),
        legacy_sector_id=changes.get("legacy_sector_id", node.legacy_sector_id),
    )
    for key, value in changes.items():
        setattr(node, key, value)
    try:
        await db.commit()
        await db.refresh(node)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Code ou nom déjà utilisé à ce niveau") from exc
    return _node_payload(node)


@router.delete("/{territory_id}")
async def deactivate_territory(
    territory_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    node = await db.get(TerritoryNode, territory_id)
    if node is None:
        raise HTTPException(404, "Territoire introuvable")
    active_children = (
        await db.execute(
            select(func.count(TerritoryNode.id)).where(
                TerritoryNode.parent_id == territory_id,
                TerritoryNode.is_active.is_(True),
            )
        )
    ).scalar() or 0
    if active_children:
        raise HTTPException(409, "Désactivez ou déplacez d’abord les sous-territoires")
    node.is_active = False
    await db.commit()
    return {"success": True, "id": territory_id}


@router.post("/reconcile")
async def reconcile_territories(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    """Repair legacy QGIS placeholders and link unambiguous business sectors."""

    nodes = (await db.execute(select(TerritoryNode).order_by(TerritoryNode.id))).scalars().all()
    sectors = await _sector_registry(db)
    used_by_parent: dict[Optional[int], set[str]] = defaultdict(set)
    for node in nodes:
        if not is_placeholder_label(node.name):
            used_by_parent[node.parent_id].add(str(node.name).strip().casefold())

    renamed = 0
    linked = 0
    unresolved: list[dict[str, Any]] = []

    for node in nodes:
        raw_metadata = node.metadata_json if isinstance(node.metadata_json, dict) else {}
        qgis_properties = raw_metadata.get("qgis_properties")
        if not isinstance(qgis_properties, dict):
            qgis_properties = {}
        identity = extract_qgis_identity(qgis_properties, feature_id=node.external_id)

        if is_placeholder_label(node.name):
            node.name = _safe_repair_name(
                node,
                candidate=identity.get("name"),
                used_by_parent=used_by_parent,
            )
            renamed += 1

        if node.legacy_sector_id is None:
            sector_id = resolve_import_sector_id(
                sectors=sectors,
                name=node.name,
                code=node.code or identity.get("code"),
                external_id=node.external_id or identity.get("external_id"),
            )
            if sector_id is not None:
                node.legacy_sector_id = sector_id
                linked += 1
            else:
                unresolved.append({
                    "id": node.id,
                    "name": node.name,
                    "code": node.code,
                })

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Réconciliation incompatible avec la hiérarchie existante") from exc

    return {
        "renamed": renamed,
        "linked": linked,
        "unresolved": len(unresolved),
        "unresolved_items": unresolved[:200],
    }


@router.post("/import-geojson")
async def import_geojson(
    document: GeoJsonImport,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_chef_orienteur),
):
    collection = document.feature_collection
    if not isinstance(collection, dict) or collection.get("type") != "FeatureCollection":
        raise HTTPException(422, "Un FeatureCollection GeoJSON est attendu")
    features = collection.get("features")
    if not isinstance(features, list):
        raise HTTPException(422, "FeatureCollection.features doit être une liste")

    existing_nodes = (await db.execute(select(TerritoryNode))).scalars().all()
    existing_by_code = {
        node.code: node
        for node in existing_nodes
        if clean_import_text(node.code)
    }
    existing_by_external = _unique_external_nodes(existing_nodes)
    sectors = await _sector_registry(db)
    sectors_by_id = {int(sector["id"]): sector for sector in sectors}

    created = 0
    updated = 0
    linked = 0
    skipped = []
    deferred_parent_codes: list[tuple[TerritoryNode, str]] = []

    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            skipped.append({"index": index, "reason": "Feature invalide"})
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        identity = extract_qgis_identity(properties, feature_id=feature.get("id"))
        name = clean_import_text(identity.get("name"))
        if not name:
            skipped.append({
                "index": index,
                "reason": "aucun nom/code QGIS exploitable (valeurs 0/0.0/null ignorées)",
            })
            continue
        try:
            geometry = _validate_geometry(feature.get("geometry"))
        except ValueError as exc:
            skipped.append({"index": index, "reason": str(exc)})
            continue

        code = clean_import_text(identity.get("code"))
        external_id = clean_import_text(identity.get("external_id"))
        node = existing_by_code.get(code) if code else None
        if node is None and external_id:
            node = existing_by_external.get(external_id)
        if node is not None and not document.update_existing:
            skipped.append({"index": index, "reason": "territoire existe déjà"})
            continue

        kind = normalize_import_kind(identity.get("kind"), default="SECTOR")
        if kind not in _ALLOWED_KINDS:
            skipped.append({"index": index, "reason": f"kind {kind} invalide"})
            continue

        explicit_sector_id = extract_qgis_sector_link_id(properties)
        if explicit_sector_id not in sectors_by_id:
            explicit_sector_id = None
        sector_id = explicit_sector_id or resolve_import_sector_id(
            sectors=sectors,
            name=name,
            code=code,
            external_id=external_id,
        )

        values = {
            "code": code,
            "name": name[:140],
            "kind": kind,
            "color": _clean_text(properties.get("color")),
            "description": _clean_text(properties.get("description")),
            "geometry_geojson": geometry,
            "centroid_latitude": properties.get("centroid_latitude"),
            "centroid_longitude": properties.get("centroid_longitude"),
            "source": _clean_text(document.source) or "qgis",
            "external_id": external_id,
            "is_active": bool(properties.get("is_active", True)),
            "sort_order": int(properties.get("sort_order") or 0),
            "metadata_json": qgis_metadata(properties),
        }
        if sector_id is not None:
            values["legacy_sector_id"] = sector_id

        if node is None:
            node = TerritoryNode(**values)
            db.add(node)
            await db.flush()
            if code:
                existing_by_code[code] = node
            if external_id:
                existing_by_external[external_id] = node
            created += 1
        else:
            # Never erase an existing manual business link because a later GIS
            # file lacks enough information to resolve it.
            if sector_id is None:
                values.pop("legacy_sector_id", None)
            for key, value in values.items():
                setattr(node, key, value)
            updated += 1

        if node.legacy_sector_id is not None:
            linked += 1

        parent_code = clean_import_text(identity.get("parent_code"))
        if parent_code:
            deferred_parent_codes.append((node, parent_code))

    for node, parent_code in deferred_parent_codes:
        parent = existing_by_code.get(parent_code)
        if parent is not None and parent.id != node.id:
            node.parent_id = parent.id

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "Import incompatible avec la hiérarchie existante") from exc

    return {
        "created": created,
        "updated": updated,
        "linked": linked,
        "skipped": skipped,
        "source": document.source,
    }
