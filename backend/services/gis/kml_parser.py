"""Safe, deterministic KML/KMZ parsing for BlueVector GIS imports.

The parser deliberately has no database or FastAPI dependency. Uploaded bytes
are validated before XML parsing and normalized to GeoJSON-compatible
geometries. KML instructions such as NetworkLink are never followed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import PurePosixPath
import re
from typing import Any, Iterable
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile, ZipInfo

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_KML_BYTES = 50 * 1024 * 1024
MAX_KMZ_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_KMZ_ENTRIES = 1_000
MAX_COMPRESSION_RATIO = 200
MAX_FEATURES = 50_000
MAX_COORDINATES = 1_000_000

_SUPPORTED_EXTENSIONS = {".kml", ".kmz"}
_GEOMETRY_TAGS = {
    "Point",
    "LineString",
    "Polygon",
    "MultiGeometry",
}


class GisImportError(ValueError):
    """User-safe validation error raised for an invalid GIS upload."""


@dataclass(frozen=True)
class ParsedFeature:
    external_id: str | None
    name: str | None
    folder_path: str
    geometry_geojson: dict[str, Any]
    geometry_type: str
    properties: dict[str, Any] = field(default_factory=dict)
    style: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedDataset:
    source_type: str
    source_filename: str
    source_entry: str | None
    sha256: str
    size_bytes: int
    name: str | None
    features: tuple[ParsedFeature, ...]
    warnings: tuple[str, ...]
    bbox: tuple[float, float, float, float]
    feature_counts: dict[str, int]


@dataclass
class _ParseState:
    warnings: list[str] = field(default_factory=list)
    coordinate_count: int = 0

    def add_coordinates(self, count: int) -> None:
        self.coordinate_count += count
        if self.coordinate_count > MAX_COORDINATES:
            raise GisImportError(
                "Le fichier dépasse la limite de complexité géométrique."
            )


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element if _local_name(child.tag) == name]


def _first_child(element: ET.Element, name: str) -> ET.Element | None:
    return next(
        (child for child in element if _local_name(child.tag) == name),
        None,
    )


def _descendant_text(element: ET.Element, name: str) -> str | None:
    for child in element.iter():
        if _local_name(child.tag) == name:
            value = "".join(child.itertext()).strip()
            return value or None
    return None


def _direct_text(element: ET.Element, name: str) -> str | None:
    child = _first_child(element, name)
    if child is None:
        return None
    value = "".join(child.itertext()).strip()
    return value or None


def _safe_filename(filename: str) -> tuple[str, str]:
    raw_name = PurePosixPath(str(filename or "").replace("\\", "/")).name
    if not raw_name:
        raise GisImportError("Le nom du fichier est manquant.")
    suffix = PurePosixPath(raw_name).suffix.lower()
    if suffix not in _SUPPORTED_EXTENSIONS:
        raise GisImportError("Seuls les fichiers KML et KMZ sont acceptés.")
    return raw_name, suffix


def _is_symlink(info: ZipInfo) -> bool:
    return ((info.external_attr >> 16) & 0o170000) == 0o120000


def _validate_member(info: ZipInfo) -> None:
    normalized = info.filename.replace("\\", "/")
    path = PurePosixPath(normalized)
    if (
        not normalized
        or normalized.startswith("/")
        or re.match(r"^[A-Za-z]:", normalized)
        or ".." in path.parts
        or _is_symlink(info)
    ):
        raise GisImportError("L'archive KMZ contient un chemin dangereux.")

    compressed = max(int(info.compress_size or 0), 1)
    if int(info.file_size or 0) / compressed > MAX_COMPRESSION_RATIO:
        raise GisImportError("L'archive KMZ présente un taux de compression dangereux.")


def _extract_kml_from_kmz(payload: bytes) -> tuple[bytes, str]:
    try:
        with ZipFile(BytesIO(payload)) as archive:
            members = archive.infolist()
            if len(members) > MAX_KMZ_ENTRIES:
                raise GisImportError("L'archive KMZ contient trop de fichiers.")

            total_size = 0
            kml_members: list[ZipInfo] = []
            for info in members:
                _validate_member(info)
                if info.is_dir():
                    continue
                total_size += int(info.file_size or 0)
                if total_size > MAX_KMZ_UNCOMPRESSED_BYTES:
                    raise GisImportError("L'archive KMZ décompressée est trop volumineuse.")
                if info.filename.lower().endswith(".kml"):
                    kml_members.append(info)

            if not kml_members:
                raise GisImportError("L'archive KMZ ne contient aucun document KML.")

            selected = next(
                (
                    info
                    for info in kml_members
                    if PurePosixPath(info.filename).name.lower() == "doc.kml"
                ),
                kml_members[0],
            )
            if selected.file_size > MAX_KML_BYTES:
                raise GisImportError("Le document KML contenu dans l'archive est trop volumineux.")
            return archive.read(selected), selected.filename
    except GisImportError:
        raise
    except (BadZipFile, RuntimeError, OSError) as exc:
        raise GisImportError("L'archive KMZ est illisible ou corrompue.") from exc


def _parse_coordinate_token(token: str) -> list[float]:
    parts = token.split(",")
    if len(parts) < 2:
        raise GisImportError("Une coordonnée KML est incomplète.")
    try:
        values = [float(parts[0]), float(parts[1])]
        if len(parts) >= 3 and parts[2] != "":
            values.append(float(parts[2]))
    except ValueError as exc:
        raise GisImportError("Une coordonnée KML n'est pas numérique.") from exc

    longitude, latitude = values[:2]
    if not all(math.isfinite(value) for value in values):
        raise GisImportError("Une coordonnée KML n'est pas finie.")
    if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise GisImportError("Une coordonnée KML est hors des limites longitude/latitude.")
    return values


def _parse_coordinates(text: str | None, state: _ParseState) -> list[list[float]]:
    tokens = str(text or "").split()
    if not tokens:
        raise GisImportError("Une géométrie KML ne contient aucune coordonnée.")
    coordinates = [_parse_coordinate_token(token) for token in tokens]
    state.add_coordinates(len(coordinates))
    return coordinates


def _parse_linear_ring(element: ET.Element, state: _ParseState) -> list[list[float]]:
    coordinate_element = _first_child(element, "coordinates")
    coordinates = _parse_coordinates(
        coordinate_element.text if coordinate_element is not None else None,
        state,
    )
    if len(coordinates) < 3:
        raise GisImportError("Un anneau de polygone nécessite au moins trois points.")
    if coordinates[0][:2] != coordinates[-1][:2]:
        coordinates.append(list(coordinates[0]))
        state.add_coordinates(1)
        state.warnings.append("Un anneau de polygone non fermé a été normalisé.")
    if len(coordinates) < 4:
        raise GisImportError("Un anneau de polygone est invalide.")
    return coordinates


def _parse_geometry(element: ET.Element, state: _ParseState) -> dict[str, Any]:
    geometry_type = _local_name(element.tag)
    if geometry_type == "Point":
        coordinate_element = _first_child(element, "coordinates")
        coordinates = _parse_coordinates(
            coordinate_element.text if coordinate_element is not None else None,
            state,
        )
        if len(coordinates) != 1:
            raise GisImportError("Un Point KML doit contenir une seule coordonnée.")
        return {"type": "Point", "coordinates": coordinates[0]}

    if geometry_type == "LineString":
        coordinate_element = _first_child(element, "coordinates")
        coordinates = _parse_coordinates(
            coordinate_element.text if coordinate_element is not None else None,
            state,
        )
        if len(coordinates) < 2:
            raise GisImportError("Une ligne KML nécessite au moins deux points.")
        return {"type": "LineString", "coordinates": coordinates}

    if geometry_type == "Polygon":
        outer = _first_child(element, "outerBoundaryIs")
        outer_ring = _first_child(outer, "LinearRing") if outer is not None else None
        if outer_ring is None:
            raise GisImportError("Un polygone KML n'a pas de contour extérieur.")
        rings = [_parse_linear_ring(outer_ring, state)]
        for boundary in _children(element, "innerBoundaryIs"):
            ring = _first_child(boundary, "LinearRing")
            if ring is not None:
                rings.append(_parse_linear_ring(ring, state))
        return {"type": "Polygon", "coordinates": rings}

    if geometry_type == "MultiGeometry":
        geometries = [
            _parse_geometry(child, state)
            for child in element
            if _local_name(child.tag) in _GEOMETRY_TAGS
        ]
        if not geometries:
            raise GisImportError("Une MultiGeometry KML est vide.")
        types = {geometry["type"] for geometry in geometries}
        if types == {"Point"}:
            return {
                "type": "MultiPoint",
                "coordinates": [geometry["coordinates"] for geometry in geometries],
            }
        if types == {"LineString"}:
            return {
                "type": "MultiLineString",
                "coordinates": [geometry["coordinates"] for geometry in geometries],
            }
        if types == {"Polygon"}:
            return {
                "type": "MultiPolygon",
                "coordinates": [geometry["coordinates"] for geometry in geometries],
            }
        return {"type": "GeometryCollection", "geometries": geometries}

    raise GisImportError(f"Géométrie KML non prise en charge : {geometry_type}.")


def _parse_extended_data(placemark: ET.Element) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    for element in placemark.iter():
        name = _local_name(element.tag)
        if name == "Data":
            key = str(element.attrib.get("name") or "").strip()
            value = _descendant_text(element, "value")
        elif name == "SimpleData":
            key = str(element.attrib.get("name") or "").strip()
            value = "".join(element.itertext()).strip() or None
        else:
            continue
        if key and value is not None:
            properties[key] = value
    description = _descendant_text(placemark, "description")
    if description:
        properties.setdefault("description", description)
    return properties


def _kml_color(value: str | None) -> str | None:
    normalized = str(value or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{8}", normalized):
        return None
    alpha, blue, green, red = (
        normalized[0:2],
        normalized[2:4],
        normalized[4:6],
        normalized[6:8],
    )
    return f"#{red}{green}{blue}{alpha}"


def _parse_style(style: ET.Element | None) -> dict[str, Any]:
    if style is None:
        return {}
    result: dict[str, Any] = {}
    for element in style.iter():
        name = _local_name(element.tag)
        if name == "LineStyle":
            color = _kml_color(_descendant_text(element, "color"))
            width = _descendant_text(element, "width")
            if color:
                result["line_color"] = color
            if width:
                try:
                    result["line_width"] = float(width)
                except ValueError:
                    pass
        elif name == "PolyStyle":
            color = _kml_color(_descendant_text(element, "color"))
            if color:
                result["fill_color"] = color
            fill = _descendant_text(element, "fill")
            outline = _descendant_text(element, "outline")
            if fill in {"0", "1"}:
                result["fill"] = fill == "1"
            if outline in {"0", "1"}:
                result["outline"] = outline == "1"
        elif name == "IconStyle":
            color = _kml_color(_descendant_text(element, "color"))
            scale = _descendant_text(element, "scale")
            if color:
                result["icon_color"] = color
            if scale:
                try:
                    result["icon_scale"] = float(scale)
                except ValueError:
                    pass
    return result


def _geometry_elements(placemark: ET.Element) -> list[ET.Element]:
    return [
        child
        for child in placemark
        if _local_name(child.tag) in _GEOMETRY_TAGS
    ]


def _coordinates_from_geometry(geometry: dict[str, Any]) -> Iterable[list[float]]:
    geometry_type = geometry.get("type")
    if geometry_type == "Point":
        yield geometry["coordinates"]
    elif geometry_type in {"LineString", "MultiPoint"}:
        yield from geometry["coordinates"]
    elif geometry_type in {"Polygon", "MultiLineString"}:
        for part in geometry["coordinates"]:
            yield from part
    elif geometry_type == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            for ring in polygon:
                yield from ring
    elif geometry_type == "GeometryCollection":
        for child in geometry.get("geometries", []):
            yield from _coordinates_from_geometry(child)


def validate_geojson_geometry(geometry: dict[str, Any]) -> dict[str, Any]:
    """Return a JSON-safe supported geometry or raise a user-safe error."""

    if not isinstance(geometry, dict):
        raise GisImportError("La géométrie GeoJSON doit être un objet.")
    geometry_type = geometry.get("type")
    supported = {
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
        "Polygon",
        "MultiPolygon",
        "GeometryCollection",
    }
    if geometry_type not in supported:
        raise GisImportError("Le type de géométrie GeoJSON n'est pas pris en charge.")

    try:
        if geometry_type == "Point" and not isinstance(geometry.get("coordinates"), list):
            raise GisImportError("Les coordonnées du Point sont invalides.")
        if geometry_type == "LineString" and len(geometry.get("coordinates", [])) < 2:
            raise GisImportError("Une ligne nécessite au moins deux points.")
        if geometry_type == "Polygon":
            rings = geometry.get("coordinates", [])
            if not isinstance(rings, list) or not rings:
                raise GisImportError("Un polygone nécessite un contour extérieur.")
            for ring in rings:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0][:2] != ring[-1][:2]:
                    raise GisImportError("Chaque anneau GeoJSON doit être fermé et valide.")
        if geometry_type == "MultiPoint" and not geometry.get("coordinates"):
            raise GisImportError("Une géométrie multiple ne peut pas être vide.")
        if geometry_type == "MultiLineString":
            lines = geometry.get("coordinates", [])
            if not lines or any(len(line) < 2 for line in lines):
                raise GisImportError("Une multi-ligne contient une ligne invalide.")
        if geometry_type == "MultiPolygon":
            polygons = geometry.get("coordinates", [])
            if not polygons:
                raise GisImportError("Un multi-polygone ne peut pas être vide.")
            for polygon in polygons:
                if not polygon:
                    raise GisImportError("Un multi-polygone contient un polygone vide.")
                for ring in polygon:
                    if len(ring) < 4 or ring[0][:2] != ring[-1][:2]:
                        raise GisImportError("Chaque anneau GeoJSON doit être fermé et valide.")
        if geometry_type == "GeometryCollection":
            geometries = geometry.get("geometries")
            if not isinstance(geometries, list) or not geometries:
                raise GisImportError("Une collection de géométries ne peut pas être vide.")
            for child in geometries:
                validate_geojson_geometry(child)

        positions = list(_coordinates_from_geometry(geometry))
    except (KeyError, TypeError, IndexError) as exc:
        raise GisImportError("La structure des coordonnées GeoJSON est invalide.") from exc
    if not positions:
        raise GisImportError("La géométrie GeoJSON ne contient aucune coordonnée.")
    if len(positions) > MAX_COORDINATES:
        raise GisImportError("La géométrie dépasse la limite de complexité.")
    for position in positions:
        if not isinstance(position, list) or len(position) < 2:
            raise GisImportError("Une position GeoJSON est incomplète.")
        try:
            values = [float(position[0]), float(position[1])]
            if len(position) >= 3:
                values.append(float(position[2]))
        except (TypeError, ValueError) as exc:
            raise GisImportError("Une position GeoJSON n'est pas numérique.") from exc
        if not all(math.isfinite(value) for value in values):
            raise GisImportError("Une position GeoJSON n'est pas finie.")
        if not -180 <= values[0] <= 180 or not -90 <= values[1] <= 90:
            raise GisImportError("Une position GeoJSON est hors des limites longitude/latitude.")

    try:
        return json.loads(json.dumps(geometry, allow_nan=False))
    except (TypeError, ValueError) as exc:
        raise GisImportError("La géométrie GeoJSON n'est pas sérialisable.") from exc


def geometry_bounds(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    normalized = validate_geojson_geometry(geometry)
    points = list(_coordinates_from_geometry(normalized))
    longitudes = [float(point[0]) for point in points]
    latitudes = [float(point[1]) for point in points]
    return min(longitudes), min(latitudes), max(longitudes), max(latitudes)


def geometry_bbox_center(geometry: dict[str, Any]) -> tuple[float, float]:
    west, south, east, north = geometry_bounds(geometry)
    return (south + north) / 2, (west + east) / 2


def _dataset_bbox(features: Iterable[ParsedFeature]) -> tuple[float, float, float, float]:
    points = [
        coordinate
        for feature in features
        for coordinate in _coordinates_from_geometry(feature.geometry_geojson)
    ]
    if not points:
        raise GisImportError("Le document ne contient aucune coordonnée exploitable.")
    longitudes = [point[0] for point in points]
    latitudes = [point[1] for point in points]
    return min(longitudes), min(latitudes), max(longitudes), max(latitudes)


def _parse_kml_document(kml_bytes: bytes) -> tuple[str | None, tuple[ParsedFeature, ...], tuple[str, ...]]:
    if len(kml_bytes) > MAX_KML_BYTES:
        raise GisImportError("Le document KML est trop volumineux.")
    try:
        # Reject declarations in the parser itself, regardless of byte offset
        # or XML encoding. A prefix/byte regex cannot enforce that boundary.
        root = SafeET.fromstring(kml_bytes, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except DefusedXmlException as exc:
        raise GisImportError("Le document XML contient une déclaration interdite.") from exc
    except (ET.ParseError, ValueError, LookupError) as exc:
        raise GisImportError("Le document KML est un XML invalide.") from exc
    if _local_name(root.tag) != "kml":
        raise GisImportError("Le document ne possède pas de racine KML.")

    state = _ParseState()
    if any(_local_name(element.tag) == "NetworkLink" for element in root.iter()):
        state.warnings.append("Les NetworkLink externes ont été ignorés.")

    styles = {
        str(element.attrib.get("id")): _parse_style(element)
        for element in root.iter()
        if _local_name(element.tag) == "Style" and element.attrib.get("id")
    }
    document = next(
        (element for element in root if _local_name(element.tag) == "Document"),
        root,
    )
    document_name = _direct_text(document, "name")
    features: list[ParsedFeature] = []

    def walk(container: ET.Element, path: tuple[str, ...]) -> None:
        for child in container:
            name = _local_name(child.tag)
            if name in {"Document", "Folder"}:
                folder_name = _direct_text(child, "name")
                walk(child, path + ((folder_name,) if folder_name else ()))
                continue
            if name != "Placemark":
                continue
            geometries = _geometry_elements(child)
            if not geometries:
                state.warnings.append(
                    f"Placemark sans géométrie ignoré : {_direct_text(child, 'name') or 'sans nom'}."
                )
                continue
            if len(features) >= MAX_FEATURES:
                raise GisImportError("Le document contient trop de features.")
            if len(geometries) == 1:
                geometry = _parse_geometry(geometries[0], state)
            else:
                parsed = [_parse_geometry(element, state) for element in geometries]
                geometry = {"type": "GeometryCollection", "geometries": parsed}
            style_url = _direct_text(child, "styleUrl")
            style = dict(styles.get(str(style_url or "").lstrip("#"), {}))
            inline_style = _first_child(child, "Style")
            style.update(_parse_style(inline_style))
            features.append(
                ParsedFeature(
                    external_id=str(child.attrib.get("id") or "").strip() or None,
                    name=_direct_text(child, "name"),
                    folder_path=" / ".join(path),
                    geometry_geojson=geometry,
                    geometry_type=str(geometry["type"]),
                    properties=_parse_extended_data(child),
                    style=style,
                )
            )

    walk(document, ())
    if not features:
        raise GisImportError("Le document KML ne contient aucune feature géographique.")
    return document_name, tuple(features), tuple(dict.fromkeys(state.warnings))


def parse_geospatial_upload(
    filename: str,
    payload: bytes,
    *,
    content_type: str | None = None,
) -> ParsedDataset:
    """Validate and parse one KML/KMZ upload without side effects."""

    safe_name, suffix = _safe_filename(filename)
    if not payload:
        raise GisImportError("Le fichier est vide.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise GisImportError("Le fichier dépasse la taille maximale autorisée.")

    normalized_content_type = str(content_type or "").split(";", 1)[0].strip().lower()
    allowed_types = {
        "",
        "application/octet-stream",
        "application/vnd.google-earth.kml+xml",
        "application/vnd.google-earth.kmz",
        "application/zip",
        "text/xml",
        "application/xml",
    }
    if normalized_content_type not in allowed_types:
        raise GisImportError("Le type MIME du fichier n'est pas autorisé.")

    source_entry = None
    if suffix == ".kmz":
        if not payload.startswith(b"PK"):
            raise GisImportError("Le fichier KMZ n'est pas une archive ZIP valide.")
        kml_bytes, source_entry = _extract_kml_from_kmz(payload)
        source_type = "KMZ"
    else:
        if payload.startswith(b"PK"):
            raise GisImportError("Une archive ZIP doit utiliser l'extension KMZ.")
        kml_bytes = payload
        source_type = "KML"

    name, features, warnings = _parse_kml_document(kml_bytes)
    counts: dict[str, int] = {}
    for feature in features:
        counts[feature.geometry_type] = counts.get(feature.geometry_type, 0) + 1

    return ParsedDataset(
        source_type=source_type,
        source_filename=safe_name,
        source_entry=source_entry,
        sha256=sha256(payload).hexdigest(),
        size_bytes=len(payload),
        name=name,
        features=features,
        warnings=warnings,
        bbox=_dataset_bbox(features),
        feature_counts=counts,
    )
