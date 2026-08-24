"""Canonical operational-sector contract for jobs.

``Job.route_criteria`` is a routing/geographic hint (for example a district),
while ``Job.sector_id`` identifies the operational ``Sector`` used by reports,
exports and staffing.  This module is the single reconciliation boundary
between those two concepts.

The database already contains both fields.  Resolution therefore does not
need a schema migration: new writes persist the canonical foreign key and
legacy rows are projected consistently at read time.  A structured
``TerritoryNode.legacy_sector_id`` link wins when configured; the historical
sector-description aliases are retained as a conservative compatibility path.
"""

from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Mapping
import re
import unicodedata
from typing import Iterable, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Job, Sector
from backend.database.territory_models import TerritoryNode


@dataclass(frozen=True)
class SectorIdentity:
    """Canonical sector exposed on every job surface."""

    id: int
    name: str
    raw: Optional[str] = None


def _text(value) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def normalize_sector_text(value) -> str:
    """Return an accent/case/punctuation-insensitive comparison token."""

    normalized = _text(value)
    if not normalized:
        return ""
    without_accents = "".join(
        character
        for character in unicodedata.normalize("NFKD", normalized)
        if not unicodedata.combining(character)
    )
    return " ".join(
        re.sub(r"[^a-z0-9]+", " ", without_accents.casefold()).split()
    )


def _record_value(record, name, default=None):
    if isinstance(record, Mapping):
        return record.get(name, default)
    return getattr(record, name, default)


def _sector_aliases(sector) -> set[str]:
    """Read the legacy alias list embedded after a description delimiter."""

    aliases = {normalize_sector_text(_record_value(sector, "name"))}
    description = _text(_record_value(sector, "description"))
    if not description:
        return {alias for alias in aliases if alias}

    # Seeded V1 descriptions use an em dash.  Colons and spaced hyphens are
    # accepted for existing customer data, but prose before the delimiter is
    # never treated as an alias.
    parts = re.split(r"\s+[—–-]\s+|\s*:\s*", description, maxsplit=1)
    if len(parts) == 2:
        for value in re.split(r"[,;/|•]", parts[1]):
            alias = normalize_sector_text(value)
            if alias:
                aliases.add(alias)
    return {alias for alias in aliases if alias}


def sector_registry_aliases(sector) -> set[str]:
    """Public alias view shared by imports and the live write contract."""

    return _sector_aliases(sector)


def _embedded_score(source: str, alias: str) -> int:
    if not source or not alias:
        return 0
    if source == alias:
        return 10_000 + len(alias)
    if f" {alias} " in f" {source} ":
        return len(alias)
    return 0


def _linked_sector(territory, sectors_by_id):
    sector_id = _record_value(territory, "legacy_sector_id")
    try:
        return sectors_by_id.get(int(sector_id)) if sector_id is not None else None
    except (TypeError, ValueError):
        return None


def _point_in_ring(longitude: float, latitude: float, ring) -> bool:
    if not isinstance(ring, list) or len(ring) < 4:
        return False
    inside = False
    previous = ring[-1]
    for current in ring:
        try:
            x1, y1 = float(previous[0]), float(previous[1])
            x2, y2 = float(current[0]), float(current[1])
        except (TypeError, ValueError, IndexError):
            previous = current
            continue
        crosses = (y1 > latitude) != (y2 > latitude)
        if crosses:
            boundary = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < boundary:
                inside = not inside
        previous = current
    return inside


def _point_in_geometry(longitude: float, latitude: float, geometry) -> bool:
    if not isinstance(geometry, dict):
        return False
    coordinates = geometry.get("coordinates")
    if geometry.get("type") == "Polygon" and isinstance(coordinates, list):
        return bool(coordinates) and _point_in_ring(longitude, latitude, coordinates[0])
    if geometry.get("type") == "MultiPolygon" and isinstance(coordinates, list):
        return any(
            polygon and _point_in_ring(longitude, latitude, polygon[0])
            for polygon in coordinates
            if isinstance(polygon, list)
        )
    return False


def resolve_sector_from_registry(
    *,
    sectors: Iterable,
    territories: Iterable = (),
    explicit_sector_id: Optional[int] = None,
    sector_raw: Optional[str] = None,
    route_criteria: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    require_active: bool = True,
) -> Optional[SectorIdentity]:
    """Resolve one unambiguous operational sector from registry records."""

    sector_records = list(sectors)
    sectors_by_id = {
        int(_record_value(sector, "id")): sector
        for sector in sector_records
        if _record_value(sector, "id") is not None
    }
    raw = _text(sector_raw) or _text(route_criteria)

    if explicit_sector_id is not None:
        try:
            explicit_id = int(explicit_sector_id)
        except (TypeError, ValueError):
            return None
        sector = sectors_by_id.get(explicit_id)
        if sector is None or (
            require_active and _record_value(sector, "is_active", True) is False
        ):
            return None
        return SectorIdentity(explicit_id, str(_record_value(sector, "name")), raw)

    active_sectors = [
        sector
        for sector in sector_records
        if not require_active or _record_value(sector, "is_active", True) is not False
    ]
    # ``sector_raw`` is the explicit geographic label and therefore wins over
    # the more general routing criterion.  Falling through to a conflicting
    # route would expose an ID/name that no longer describes the raw value.
    selected_source = _text(sector_raw) or _text(route_criteria)
    normalized_source = normalize_sector_text(selected_source)
    source_values = [normalized_source] if normalized_source else []

    # An exact operational name is authoritative.
    for source in source_values:
        exact = {
            int(_record_value(sector, "id"))
            for sector in active_sectors
            if normalize_sector_text(_record_value(sector, "name")) == source
        }
        if len(exact) == 1:
            sector_id = exact.pop()
            sector = sectors_by_id[sector_id]
            return SectorIdentity(sector_id, str(_record_value(sector, "name")), raw)

    # Prefer the structured territory-to-sector link when it is available.
    scored: list[tuple[int, int]] = []
    for territory in territories:
        if _record_value(territory, "is_active", True) is False:
            continue
        linked = _linked_sector(territory, sectors_by_id)
        if linked is None or (
            require_active and _record_value(linked, "is_active", True) is False
        ):
            continue
        aliases = {
            normalize_sector_text(_record_value(territory, field))
            for field in ("name", "code", "external_id")
        }
        for source in source_values:
            for alias in aliases:
                score = _embedded_score(source, alias)
                if score:
                    scored.append((score, int(_record_value(linked, "id"))))

    if scored:
        strongest = max(score for score, _ in scored)
        sector_ids = {sector_id for score, sector_id in scored if score == strongest}
        if len(sector_ids) == 1:
            sector_id = sector_ids.pop()
            sector = sectors_by_id[sector_id]
            return SectorIdentity(sector_id, str(_record_value(sector, "name")), raw)

    # Compatibility for the current four-sector registry: descriptions carry
    # comma-separated district aliases.  Longest-match wins so "Val d'Anfa"
    # is not confused with the shorter "Anfa" alias.
    scored = []
    for sector in active_sectors:
        sector_id = int(_record_value(sector, "id"))
        for source in source_values:
            for alias in _sector_aliases(sector):
                score = _embedded_score(source, alias)
                if score:
                    scored.append((score, sector_id))

    if scored:
        strongest = max(score for score, _ in scored)
        sector_ids = {sector_id for score, sector_id in scored if score == strongest}
        if len(sector_ids) == 1:
            sector_id = sector_ids.pop()
            sector = sectors_by_id[sector_id]
            return SectorIdentity(sector_id, str(_record_value(sector, "name")), raw)

    # Geometry is a final deterministic source.  Multiple overlapping sectors
    # are deliberately left unresolved instead of being guessed.
    try:
        point = (float(longitude), float(latitude))
    except (TypeError, ValueError):
        point = None
    if point is not None:
        geometry_matches = {
            int(_record_value(linked, "id"))
            for territory in territories
            if _record_value(territory, "is_active", True) is not False
            for linked in [_linked_sector(territory, sectors_by_id)]
            if linked is not None
            and (not require_active or _record_value(linked, "is_active", True) is not False)
            and _point_in_geometry(
                point[0],
                point[1],
                _record_value(territory, "geometry_geojson"),
            )
        }
        if len(geometry_matches) == 1:
            sector_id = geometry_matches.pop()
            sector = sectors_by_id[sector_id]
            return SectorIdentity(sector_id, str(_record_value(sector, "name")), raw)

    return None


async def _load_registry(db: AsyncSession) -> tuple[Sequence[Mapping], Sequence[Mapping]]:
    # Select columns, not ORM entities: Sector relationships use select-in
    # loading and would otherwise pull every linked job while serializing jobs.
    sectors = (
        await db.execute(
            select(
                Sector.id,
                Sector.name,
                Sector.description,
                Sector.is_active,
            )
        )
    ).mappings().all()
    territories = (
        await db.execute(
            select(
                TerritoryNode.name,
                TerritoryNode.code,
                TerritoryNode.external_id,
                TerritoryNode.legacy_sector_id,
                TerritoryNode.geometry_geojson,
                TerritoryNode.is_active,
            )
        )
    ).mappings().all()
    return sectors, territories


async def resolve_sector_for_write(
    db: AsyncSession,
    *,
    sector_id: Optional[int],
    sector_raw: Optional[str],
    route_criteria: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
) -> Optional[SectorIdentity]:
    sectors, territories = await _load_registry(db)
    identity = resolve_sector_from_registry(
        sectors=sectors,
        territories=territories,
        explicit_sector_id=sector_id,
        sector_raw=sector_raw,
        route_criteria=route_criteria,
        latitude=latitude,
        longitude=longitude,
        require_active=True,
    )
    if sector_id is not None and identity is None:
        raise ValueError(f"Secteur opérationnel actif introuvable : {sector_id}.")
    return identity


def apply_sector_identity(job: Job, identity: Optional[SectorIdentity], raw=None) -> Job:
    """Attach the response projection without mutating a legacy database row."""

    resolved_raw = _text(raw)
    if identity is not None:
        job._canonical_sector_id = identity.id
        job._canonical_sector_name = identity.name
        job._canonical_sector_raw = identity.raw or resolved_raw
    else:
        job._canonical_sector_id = getattr(job, "sector_id", None)
        job._canonical_sector_name = None
        job._canonical_sector_raw = resolved_raw
    return job


async def hydrate_job_sector_identities(db: AsyncSession, jobs: Iterable[Job]) -> list[Job]:
    """Hydrate canonical identities for API/export projection in one registry read."""

    records = list(jobs)
    if not records:
        return records
    sectors, territories = await _load_registry(db)
    for job in records:
        raw = _text(getattr(job, "sector_raw", None)) or _text(
            getattr(job, "route_criteria", None)
        )
        identity = resolve_sector_from_registry(
            sectors=sectors,
            territories=territories,
            explicit_sector_id=getattr(job, "sector_id", None),
            sector_raw=getattr(job, "sector_raw", None),
            route_criteria=getattr(job, "route_criteria", None),
            latitude=getattr(job, "latitude", None),
            longitude=getattr(job, "longitude", None),
            require_active=getattr(job, "sector_id", None) is None,
        )
        apply_sector_identity(job, identity, raw)
    return records
