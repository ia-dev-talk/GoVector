"""Hierarchical territory and GeoJSON administration for BlueVector V0.1."""

from __future__ import annotations

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
                "id": node.id,
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

    existing_by_code = {
        node.code: node
        for node in (await db.execute(select(TerritoryNode).where(TerritoryNode.code.is_not(None)))).scalars().all()
    }
    created = 0
    updated = 0
    skipped = []
    deferred_parent_codes: list[tuple[TerritoryNode, str]] = []

    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            skipped.append({"index": index, "reason": "Feature invalide"})
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        name = _clean_text(properties.get("name"))
        if not name:
            skipped.append({"index": index, "reason": "property name manquante"})
            continue
        try:
            geometry = _validate_geometry(feature.get("geometry"))
        except ValueError as exc:
            skipped.append({"index": index, "reason": str(exc)})
            continue

        code = _clean_text(properties.get("code"))
        node = existing_by_code.get(code) if code else None
        if node is not None and not document.update_existing:
            skipped.append({"index": index, "reason": f"code {code} existe déjà"})
            continue

        values = {
            "code": code,
            "name": name,
            "kind": str(properties.get("kind") or "SECTOR").strip().upper(),
            "color": _clean_text(properties.get("color")),
            "description": _clean_text(properties.get("description")),
            "geometry_geojson": geometry,
            "centroid_latitude": properties.get("centroid_latitude"),
            "centroid_longitude": properties.get("centroid_longitude"),
            "source": _clean_text(document.source) or "qgis",
            "external_id": _clean_text(properties.get("external_id")),
            "is_active": bool(properties.get("is_active", True)),
            "sort_order": int(properties.get("sort_order") or 0),
            "metadata_json": properties.get("metadata") if isinstance(properties.get("metadata"), dict) else {},
        }
        if values["kind"] not in _ALLOWED_KINDS:
            skipped.append({"index": index, "reason": f"kind {values['kind']} invalide"})
            continue

        if node is None:
            node = TerritoryNode(**values)
            db.add(node)
            await db.flush()
            if code:
                existing_by_code[code] = node
            created += 1
        else:
            for key, value in values.items():
                setattr(node, key, value)
            updated += 1

        parent_code = _clean_text(properties.get("parent_code"))
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
        "skipped": skipped,
        "source": document.source,
    }
