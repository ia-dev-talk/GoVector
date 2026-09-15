"""Safe repair/import helpers for the GoVector territory/sector registry.

This module deliberately keeps GIS geometry separate from operational assignment
until there is one unambiguous sector identity. Numeric placeholder labels such
as ``0.0`` are never promoted to operational sectors.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_office_orienteur
from backend.database.connection import get_db
from backend.database.models import Sector, User
from backend.database.territory_models import TerritoryNode
from backend.services.gis.kml_parser import GisImportError
from backend.services.gis.upload_parser import parse_geospatial_upload

router = APIRouter(prefix="/sector-tools", tags=["Sectors & GIS repair"])

_NAME_KEYS = (
    "name", "nom", "secteur", "sector", "zone", "commune", "quartier",
    "libelle", "libellé", "label", "title", "code", "reference", "ref",
)
_INVALID_TEXT = {"", "0", "0.0", "nan", "none", "null", "n/a", "na"}


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _token(value: Any) -> str:
    raw = _text(value)
    without_accents = "".join(
        c for c in unicodedata.normalize("NFKD", raw) if not unicodedata.combining(c)
    )
    return " ".join(re.sub(r"[^a-z0-9]+", " ", without_accents.casefold()).split())


def _semantic(value: Any) -> bool:
    raw = _text(value)
    if raw.casefold() in _INVALID_TEXT:
        return False
    if not raw:
        return False
    # Pure numeric labels are source IDs, not user-facing geography names.
    try:
        float(raw.replace(",", "."))
        return False
    except ValueError:
        pass
    return bool(re.search(r"[A-Za-zÀ-ÿ]", raw))


def _pick_feature_name(feature, index: int) -> str | None:
    properties = getattr(feature, "properties", None) or {}
    folded = {str(key).casefold(): value for key, value in properties.items()}
    for key in _NAME_KEYS:
        candidate = folded.get(key.casefold())
        if _semantic(candidate):
            return _text(candidate)[:140]
    candidate = getattr(feature, "name", None)
    if _semantic(candidate):
        return _text(candidate)[:140]
    return None


async def _sector_catalog(db: AsyncSession) -> tuple[list[Sector], dict[str, list[Sector]]]:
    sectors = (await db.execute(select(Sector))).scalars().all()
    by_name: dict[str, list[Sector]] = {}
    for sector in sectors:
        by_name.setdefault(_token(sector.name), []).append(sector)
    return sectors, by_name


async def _resolve_or_create_sector(
    db: AsyncSession,
    by_name: dict[str, list[Sector]],
    name: str,
    *,
    create_missing: bool,
) -> Sector | None:
    key = _token(name)
    matches = [sector for sector in by_name.get(key, []) if sector.is_active is not False]
    if len(matches) == 1:
        return matches[0]
    if matches or not create_missing:
        return None
    sector = Sector(
        name=name,
        description="Créé depuis le référentiel SIG/QGIS GoVector",
        is_active=True,
    )
    db.add(sector)
    await db.flush()
    by_name.setdefault(key, []).append(sector)
    return sector


@router.post("/repair-links")
async def repair_links(
    create_missing_sectors: bool = False,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_office_orienteur),
):
    """Link semantic territories to exact operational sectors without guessing."""
    nodes = (await db.execute(select(TerritoryNode))).scalars().all()
    _sectors, by_name = await _sector_catalog(db)
    linked = 0
    created_sectors = 0
    invalid = 0
    unchanged = 0

    for node in nodes:
        if not _semantic(node.name):
            invalid += 1
            continue
        if node.legacy_sector_id:
            unchanged += 1
            continue
        before = sum(len(values) for values in by_name.values())
        sector = await _resolve_or_create_sector(
            db, by_name, node.name, create_missing=create_missing_sectors and node.kind == "SECTOR"
        )
        after = sum(len(values) for values in by_name.values())
        if after > before:
            created_sectors += 1
        if sector is None:
            unchanged += 1
            continue
        node.legacy_sector_id = sector.id
        linked += 1

    await db.commit()
    return {
        "linked": linked,
        "created_sectors": created_sectors,
        "invalid_hidden_candidates": invalid,
        "unchanged": unchanged,
    }


@router.post("/territories/{territory_id}/ensure-sector")
async def ensure_operational_sector(
    territory_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_office_orienteur),
):
    node = await db.get(TerritoryNode, territory_id)
    if node is None:
        raise HTTPException(404, "Territoire introuvable")
    if not _semantic(node.name):
        raise HTTPException(422, "Nom de territoire invalide : corrigez le libellé avant liaison")
    if node.legacy_sector_id:
        sector = await db.get(Sector, node.legacy_sector_id)
        if sector is not None:
            return {"territory_id": node.id, "sector_id": sector.id, "sector_name": sector.name, "created": False}

    _sectors, by_name = await _sector_catalog(db)
    before = sum(len(values) for values in by_name.values())
    sector = await _resolve_or_create_sector(db, by_name, node.name, create_missing=True)
    if sector is None:
        raise HTTPException(409, "Plusieurs secteurs correspondent à ce territoire : choisissez le lien manuellement")
    created = sum(len(values) for values in by_name.values()) > before
    node.legacy_sector_id = sector.id
    await db.commit()
    return {"territory_id": node.id, "sector_id": sector.id, "sector_name": sector.name, "created": created}


@router.post("/import-qgis")
async def import_qgis(
    file: UploadFile = File(...),
    create_missing_sectors: bool = Form(True),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_office_orienteur),
):
    """Import QGIS/QField/GeoJSON/KML safely and connect polygon sectors when exact."""
    payload = await file.read()
    try:
        dataset = parse_geospatial_upload(
            file.filename or "import",
            payload,
            content_type=file.content_type,
        )
    except GisImportError as exc:
        raise HTTPException(422, str(exc)) from exc

    existing_nodes = (await db.execute(select(TerritoryNode))).scalars().all()
    by_external = {
        (node.source or "", node.external_id): node
        for node in existing_nodes
        if node.external_id
    }
    _sectors, sector_by_name = await _sector_catalog(db)

    created = updated = linked = created_sectors = 0
    skipped: list[dict[str, Any]] = []
    source = f"qgis:{dataset.source_type}"

    for index, feature in enumerate(dataset.features, start=1):
        geometry = getattr(feature, "geometry_geojson", None) or {}
        geometry_type = geometry.get("type") if isinstance(geometry, dict) else None
        if geometry_type not in {"Polygon", "MultiPolygon"}:
            skipped.append({"index": index, "reason": f"{geometry_type or 'géométrie'} non territoriale"})
            continue
        name = _pick_feature_name(feature, index)
        if not name:
            skipped.append({"index": index, "reason": "aucun nom géographique exploitable (ID numérique ignoré)"})
            continue

        properties = getattr(feature, "properties", None) or {}
        external_id = _text(getattr(feature, "external_id", None)) or None
        node = by_external.get((source, external_id)) if external_id else None
        code = None
        folded = {str(key).casefold(): value for key, value in properties.items()}
        if _semantic(folded.get("code")):
            code = _text(folded.get("code"))[:80]

        before = sum(len(values) for values in sector_by_name.values())
        sector = await _resolve_or_create_sector(
            db,
            sector_by_name,
            name,
            create_missing=create_missing_sectors,
        )
        if sum(len(values) for values in sector_by_name.values()) > before:
            created_sectors += 1

        values = {
            "name": name,
            "code": code,
            "kind": "SECTOR",
            "geometry_geojson": geometry,
            "source": source,
            "external_id": external_id,
            "legacy_sector_id": sector.id if sector else None,
            "is_active": True,
            "metadata_json": {
                "dataset": dataset.name,
                "folder": getattr(feature, "folder_path", None),
                "properties": properties,
            },
        }
        if node is None:
            node = TerritoryNode(**values)
            db.add(node)
            await db.flush()
            if external_id:
                by_external[(source, external_id)] = node
            created += 1
        else:
            for key, value in values.items():
                setattr(node, key, value)
            updated += 1
        if sector:
            linked += 1

    await db.commit()
    return {
        "dataset": dataset.name,
        "source_type": dataset.source_type,
        "created": created,
        "updated": updated,
        "linked": linked,
        "created_sectors": created_sectors,
        "skipped": skipped[:100],
        "warnings": list(dataset.warnings),
    }
