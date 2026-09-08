"""Safe geospatial upload dispatcher for KML/KMZ and GeoJSON.

QGIS and QField can exchange GeoJSON directly with BlueVector for the September
14 delivery while the existing KML/KMZ parser remains the source of truth for
those formats.  GeoJSON is treated as data only: no remote links, CRS fetches,
or external resources are followed.
"""

from __future__ import annotations

from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import PurePosixPath
from typing import Any, Iterable

from backend.services.gis.kml_parser import (
    GisImportError,
    MAX_COORDINATES,
    MAX_FEATURES,
    MAX_UPLOAD_BYTES,
    ParsedDataset,
    ParsedFeature,
    parse_geospatial_upload as parse_kml_upload,
)


_SUPPORTED_GEOJSON_EXTENSIONS = {".geojson", ".json"}
_SUPPORTED_GEOMETRY_TYPES = {
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
}


def _filename(filename: str) -> tuple[str, str]:
    raw_name = PurePosixPath(str(filename or "").replace("\\", "/")).name
    if not raw_name:
        raise GisImportError("Le nom du fichier est manquant.")
    return raw_name, PurePosixPath(raw_name).suffix.lower()


def _finite_number(value: Any) -> float:
    if isinstance(value, bool):
        raise GisImportError("Une coordonnée GeoJSON n'est pas numérique.")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise GisImportError("Une coordonnée GeoJSON n'est pas numérique.") from exc
    if not math.isfinite(number):
        raise GisImportError("Une coordonnée GeoJSON n'est pas finie.")
    return number


def _validate_position(position: Any) -> tuple[list[float], int]:
    if not isinstance(position, list) or len(position) < 2:
        raise GisImportError("Une position GeoJSON doit contenir longitude et latitude.")
    values = [_finite_number(value) for value in position]
    lon, lat = values[:2]
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise GisImportError("Une coordonnée GeoJSON est hors des limites longitude/latitude.")
    return values, 1


def _walk_coordinates(value: Any, *, depth: int = 0) -> tuple[Any, int, list[tuple[float, float]]]:
    if depth > 8:
        raise GisImportError("La géométrie GeoJSON est trop profondément imbriquée.")
    if not isinstance(value, list) or not value:
        raise GisImportError("La géométrie GeoJSON contient des coordonnées invalides.")

    if not isinstance(value[0], list):
        normalized, count = _validate_position(value)
        return normalized, count, [(normalized[0], normalized[1])]

    result = []
    total = 0
    points: list[tuple[float, float]] = []
    for child in value:
        normalized_child, child_count, child_points = _walk_coordinates(
            child, depth=depth + 1
        )
        result.append(normalized_child)
        total += child_count
        if total > MAX_COORDINATES:
            raise GisImportError("Le fichier dépasse la limite de complexité géométrique.")
        points.extend(child_points)
    return result, total, points


def _validate_geometry(geometry: Any) -> tuple[dict[str, Any], int, list[tuple[float, float]]]:
    if not isinstance(geometry, dict):
        raise GisImportError("Une entité GeoJSON ne contient pas de géométrie valide.")
    geometry_type = geometry.get("type")
    if geometry_type not in _SUPPORTED_GEOMETRY_TYPES:
        raise GisImportError(f"Géométrie GeoJSON non prise en charge : {geometry_type}.")

    if geometry_type == "GeometryCollection":
        raw_geometries = geometry.get("geometries")
        if not isinstance(raw_geometries, list) or not raw_geometries:
            raise GisImportError("Une GeometryCollection GeoJSON est vide.")
        normalized_geometries = []
        total = 0
        points: list[tuple[float, float]] = []
        for child in raw_geometries:
            normalized, count, child_points = _validate_geometry(child)
            normalized_geometries.append(normalized)
            total += count
            if total > MAX_COORDINATES:
                raise GisImportError("Le fichier dépasse la limite de complexité géométrique.")
            points.extend(child_points)
        return {"type": geometry_type, "geometries": normalized_geometries}, total, points

    normalized_coordinates, count, points = _walk_coordinates(geometry.get("coordinates"))
    return {"type": geometry_type, "coordinates": normalized_coordinates}, count, points


def _feature_name(properties: dict[str, Any], feature: dict[str, Any]) -> str | None:
    for key in ("name", "label", "title"):
        value = properties.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()[:500]
    feature_id = feature.get("id")
    return str(feature_id)[:500] if feature_id is not None else None


def _safe_properties(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise GisImportError("Les propriétés GeoJSON doivent être un objet JSON.")
    # Round-trip the object through JSON to guarantee plain, serializable data.
    try:
        encoded = json.dumps(raw, ensure_ascii=False, allow_nan=False)
        if len(encoded.encode("utf-8")) > 1_000_000:
            raise GisImportError("Les propriétés d'une entité GeoJSON sont trop volumineuses.")
        return json.loads(encoded)
    except (TypeError, ValueError) as exc:
        raise GisImportError("Les propriétés GeoJSON contiennent une valeur invalide.") from exc


def parse_geojson_upload(filename: str, payload: bytes) -> ParsedDataset:
    raw_name, suffix = _filename(filename)
    if suffix not in _SUPPORTED_GEOJSON_EXTENSIONS:
        raise GisImportError("Le fichier n'est pas un GeoJSON pris en charge.")
    if not payload:
        raise GisImportError("Le fichier GeoJSON est vide.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise GisImportError("Le fichier dépasse la taille maximale autorisée.")

    try:
        document = json.loads(payload.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GisImportError("Le fichier GeoJSON est illisible ou invalide.") from exc

    if not isinstance(document, dict) or document.get("type") != "FeatureCollection":
        raise GisImportError("Le GeoJSON doit être une FeatureCollection.")
    raw_features = document.get("features")
    if not isinstance(raw_features, list):
        raise GisImportError("Le GeoJSON ne contient pas de liste d'entités.")
    if len(raw_features) > MAX_FEATURES:
        raise GisImportError("Le fichier contient trop d'entités géographiques.")

    parsed_features: list[ParsedFeature] = []
    feature_counts: Counter[str] = Counter()
    coordinate_total = 0
    all_points: list[tuple[float, float]] = []

    for index, raw_feature in enumerate(raw_features, start=1):
        if not isinstance(raw_feature, dict) or raw_feature.get("type") != "Feature":
            raise GisImportError(f"L'entité GeoJSON #{index} est invalide.")
        geometry, coordinate_count, points = _validate_geometry(raw_feature.get("geometry"))
        coordinate_total += coordinate_count
        if coordinate_total > MAX_COORDINATES:
            raise GisImportError("Le fichier dépasse la limite de complexité géométrique.")
        all_points.extend(points)
        properties = _safe_properties(raw_feature.get("properties"))
        geometry_type = geometry["type"]
        feature_counts[geometry_type] += 1
        feature_id = raw_feature.get("id")
        parsed_features.append(
            ParsedFeature(
                external_id=(str(feature_id)[:255] if feature_id is not None else None),
                name=_feature_name(properties, raw_feature),
                folder_path="GeoJSON",
                geometry_geojson=geometry,
                geometry_type=geometry_type,
                properties=properties,
                style={},
            )
        )

    if not parsed_features or not all_points:
        raise GisImportError("Le GeoJSON ne contient aucune géométrie exploitable.")

    min_lon = min(point[0] for point in all_points)
    min_lat = min(point[1] for point in all_points)
    max_lon = max(point[0] for point in all_points)
    max_lat = max(point[1] for point in all_points)
    raw_dataset_name = document.get("name")
    dataset_name = (
        str(raw_dataset_name).strip()[:500]
        if raw_dataset_name is not None and str(raw_dataset_name).strip()
        else PurePosixPath(raw_name).stem[:500]
    )

    return ParsedDataset(
        source_type="geojson",
        source_filename=raw_name,
        source_entry=None,
        sha256=sha256(payload).hexdigest(),
        size_bytes=len(payload),
        name=dataset_name,
        features=tuple(parsed_features),
        warnings=(),
        bbox=(min_lon, min_lat, max_lon, max_lat),
        feature_counts=dict(feature_counts),
    )


def parse_geospatial_upload(
    filename: str,
    payload: bytes,
    *,
    content_type: str | None = None,
) -> ParsedDataset:
    """Dispatch a geospatial upload without changing the KML/KMZ contract."""

    _raw_name, suffix = _filename(filename)
    normalized_content_type = str(content_type or "").split(";", 1)[0].strip().lower()
    if suffix in _SUPPORTED_GEOJSON_EXTENSIONS or normalized_content_type in {
        "application/geo+json",
        "application/geojson",
    }:
        return parse_geojson_upload(filename, payload)
    return parse_kml_upload(filename, payload, content_type=content_type)
