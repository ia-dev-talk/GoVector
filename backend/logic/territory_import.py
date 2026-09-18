"""Conservative normalization helpers for QGIS territory imports.

QGIS projects often expose business labels under customer-specific column names
(`NOM_SECTEUR`, `LIBELLE`, `ZONE`, ...). The territory API keeps the raw
properties for traceability but must never turn numeric placeholders such as
`0.0` into user-facing territory names.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, Optional

from backend.logic.job_sectors import normalize_sector_text, resolve_sector_from_registry


_PLACEHOLDERS = {
    "",
    "-",
    "--",
    "0",
    "0 0",
    "nan",
    "n a",
    "na",
    "none",
    "null",
    "undefined",
}

_NAME_KEYS = (
    "name",
    "nom",
    "nom secteur",
    "nom zone",
    "secteur",
    "sector",
    "libelle",
    "libellé",
    "label",
    "title",
    "zone",
    "quartier",
    "commune",
    "district",
    "arrondissement",
)
_CODE_KEYS = (
    "code",
    "code secteur",
    "sector code",
    "code zone",
    "reference",
    "référence",
    "ref",
    "identifiant",
)
_EXTERNAL_KEYS = (
    "external id",
    "externalid",
    "fid",
    "objectid",
    "object id",
    "gid",
    "uuid",
)
_PARENT_CODE_KEYS = (
    "parent code",
    "code parent",
    "parent",
)
_KIND_KEYS = (
    "kind",
    "type territoire",
    "territory type",
)
_LINK_KEYS = (
    "legacy sector id",
    "sector id",
    "secteur id",
)
_KIND_ALIASES = {
    "region": "REGION",
    "zone": "ZONE",
    "sector": "SECTOR",
    "secteur": "SECTOR",
    "subsector": "SUBSECTOR",
    "sub sector": "SUBSECTOR",
    "sous secteur": "SUBSECTOR",
    "microzone": "MICROZONE",
    "micro zone": "MICROZONE",
}


def _key(value: Any) -> str:
    return normalize_sector_text(value)


def clean_import_text(value: Any) -> Optional[str]:
    """Return meaningful display text, rejecting spreadsheet/QGIS placeholders."""

    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    if not text:
        return None
    token = _key(text)
    if token in _PLACEHOLDERS:
        return None
    return text


def is_placeholder_label(value: Any) -> bool:
    return clean_import_text(value) is None


def _normalized_properties(properties: Mapping[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for raw_key, value in properties.items():
        key = _key(raw_key)
        if key and key not in normalized:
            normalized[key] = value
    return normalized


def _first(properties: Mapping[str, Any], keys: Iterable[str]) -> Optional[str]:
    normalized = _normalized_properties(properties)
    for candidate in keys:
        value = clean_import_text(normalized.get(_key(candidate)))
        if value:
            return value
    return None


def extract_qgis_identity(
    properties: Mapping[str, Any] | None,
    *,
    feature_id: Any = None,
) -> dict[str, Optional[str]]:
    """Extract a stable territory identity from common QGIS field conventions."""

    raw = properties if isinstance(properties, Mapping) else {}
    code = _first(raw, _CODE_KEYS)
    external_id = _first(raw, _EXTERNAL_KEYS) or clean_import_text(feature_id)
    name = _first(raw, _NAME_KEYS) or code or external_id
    return {
        "name": name,
        "code": code,
        "external_id": external_id,
        "parent_code": _first(raw, _PARENT_CODE_KEYS),
        "kind": _first(raw, _KIND_KEYS),
    }


def extract_qgis_sector_link_id(properties: Mapping[str, Any] | None) -> Optional[int]:
    raw = properties if isinstance(properties, Mapping) else {}
    value = _first(raw, _LINK_KEYS)
    if not value:
        return None
    try:
        identifier = int(float(value))
    except (TypeError, ValueError):
        return None
    return identifier if identifier > 0 else None


def normalize_import_kind(value: Any, *, default: str = "SECTOR") -> str:
    cleaned = clean_import_text(value)
    if not cleaned:
        return default
    return _KIND_ALIASES.get(_key(cleaned), str(cleaned).strip().upper())


def qgis_metadata(properties: Mapping[str, Any] | None) -> dict[str, Any]:
    """Preserve original QGIS columns without replacing existing metadata."""

    raw = dict(properties) if isinstance(properties, Mapping) else {}
    existing = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    metadata = dict(existing)
    metadata["qgis_properties"] = raw
    return metadata


def resolve_import_sector_id(
    *,
    sectors: Iterable,
    name: Any = None,
    code: Any = None,
    external_id: Any = None,
) -> Optional[int]:
    """Return one unambiguous operational-sector match, otherwise no link."""

    sector_records = list(sectors)
    matches: set[int] = set()
    for raw_value in (name, code, external_id):
        value = clean_import_text(raw_value)
        if not value:
            continue
        identity = resolve_sector_from_registry(
            sectors=sector_records,
            territories=(),
            sector_raw=value,
            require_active=True,
        )
        if identity is not None:
            matches.add(identity.id)
    return next(iter(matches)) if len(matches) == 1 else None
