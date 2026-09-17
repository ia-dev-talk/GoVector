"""Safe QGIS RAR/Shapefile importer normalized to WGS84 GeoJSON.

The archive is treated strictly as data. Only QGIS project files and the
Shapefile sidecars required for reading layers are extracted. No project
scripts, plugins, DWG content, remote CRS resources, or arbitrary archive
members are executed or followed.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime
from hashlib import sha256
import json
import math
from pathlib import Path, PurePosixPath
import re
from tempfile import TemporaryDirectory
from typing import Any
from defusedxml import ElementTree as ET
from defusedxml.common import DefusedXmlException
from zipfile import BadZipFile, ZipFile

import pyproj
import rarfile
import shapefile

from backend.services.gis.kml_parser import (
    GisImportError,
    MAX_COORDINATES,
    MAX_FEATURES,
    MAX_UPLOAD_BYTES,
    ParsedDataset,
    ParsedFeature,
)

MAX_RAR_ENTRIES = 1000
MAX_RAR_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_RAR_MEMBER_BYTES = 100 * 1024 * 1024
MAX_RAR_COMPRESSION_RATIO = 250
MAX_QGZ_ENTRIES = 100
MAX_QGS_BYTES = 10 * 1024 * 1024
MAX_QGZ_COMPRESSION_RATIO = 250
MAX_ATTRIBUTE_BYTES = 1_000_000

_ALLOWED_EXTENSIONS = {
    ".qgz", ".qgs", ".shp", ".shx", ".dbf", ".prj", ".cpg", ".qmd", ".idx", ".layer"
}
_REQUIRED_SHP_SIDECARS = {".shp", ".shx", ".dbf", ".prj"}
_SUPPORTED_GEOMETRY_TYPES = {
    "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"
}

# Never let pyproj reach the network while processing an uploaded project.
pyproj.network.set_network_enabled(False)


def _safe_member_name(name: str) -> PurePosixPath:
    normalized = str(name or "").replace("\\", "/")
    path = PurePosixPath(normalized)
    if (
        not normalized
        or normalized.startswith("/")
        or "\x00" in normalized
        or re.match(r"^[A-Za-z]:", normalized)
        or ".." in path.parts
    ):
        raise GisImportError("L'archive RAR contient un chemin dangereux.")
    return path


def _validate_archive_infos(infos: list[Any]) -> None:
    if len(infos) > MAX_RAR_ENTRIES:
        raise GisImportError("L'archive RAR contient trop de fichiers.")
    total = 0
    for info in infos:
        _safe_member_name(info.filename)
        if getattr(info, "is_symlink", lambda: False)():
            raise GisImportError("L'archive RAR contient un lien symbolique interdit.")
        if info.isdir():
            continue
        size = int(info.file_size or 0)
        if size > MAX_RAR_MEMBER_BYTES:
            raise GisImportError("Un fichier de l'archive RAR est trop volumineux.")
        total += size
        if total > MAX_RAR_UNCOMPRESSED_BYTES:
            raise GisImportError("L'archive RAR décompressée est trop volumineuse.")
        compressed = max(int(info.compress_size or 0), 1)
        if size / compressed > MAX_RAR_COMPRESSION_RATIO:
            raise GisImportError("L'archive RAR présente un taux de compression dangereux.")


def _extract_allowed_rar(payload: bytes, target: Path) -> None:
    rar_path = target / "upload.rar"
    rar_path.write_bytes(payload)
    extracted: list[Path] = []
    failed_members: list[str] = []
    try:
        with rarfile.RarFile(rar_path) as archive:
            infos = archive.infolist()
            if archive.needs_password():
                raise GisImportError("Les archives RAR protégées par mot de passe ne sont pas acceptées.")
            _validate_archive_infos(infos)
            for info in infos:
                if info.isdir():
                    continue
                member = _safe_member_name(info.filename)
                if member.suffix.lower() not in _ALLOWED_EXTENSIONS:
                    continue
                destination = target.joinpath(*member.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                try:
                    with archive.open(info) as src, destination.open("wb") as dst:
                        while True:
                            chunk = src.read(1024 * 1024)
                            if not chunk:
                                break
                            dst.write(chunk)
                    extracted.append(destination)
                except (rarfile.RarCannotExec, rarfile.RarExecError) as exc:
                    destination.unlink(missing_ok=True)
                    raise GisImportError(
                        "Le serveur ne dispose pas du moteur RAR requis (unar)."
                    ) from exc
                except (rarfile.Error, EOFError):
                    destination.unlink(missing_ok=True)
                    failed_members.append(member.as_posix())

            if failed_members:
                for destination in extracted:
                    destination.unlink(missing_ok=True)
                raise GisImportError(
                    "L’archive RAR est incomplète ou endommagée : "
                    f"{len(failed_members)} fichiers n’ont pas pu être extraits. "
                    "Recréez l’archive depuis le dossier QGIS original ou utilisez le GeoJSON validé. "
                    "Aucune donnée partielle n’a été importée."
                )
    except GisImportError:
        raise
    except (rarfile.Error, OSError) as exc:
        raise GisImportError("L'archive RAR est illisible ou corrompue.") from exc
    finally:
        rar_path.unlink(missing_ok=True)


def _qgs_bytes(path: Path) -> bytes:
    if path.suffix.lower() == ".qgs":
        if path.stat().st_size > MAX_QGS_BYTES:
            return b""
        return path.read_bytes()
    try:
        with ZipFile(path) as zf:
            infos = zf.infolist()
            if len(infos) > MAX_QGZ_ENTRIES:
                return b""
            candidates = []
            for info in infos:
                if info.is_dir() or not info.filename.lower().endswith(".qgs"):
                    continue
                if info.file_size > MAX_QGS_BYTES:
                    return b""
                compressed = max(info.compress_size, 1)
                if info.file_size / compressed > MAX_QGZ_COMPRESSION_RATIO:
                    return b""
                candidates.append(info)
            if not candidates:
                return b""
            chosen = sorted(candidates, key=lambda item: item.filename)[0]
            return zf.read(chosen)
    except (BadZipFile, OSError, KeyError):
        return b""


def _project_layer_map(root: Path) -> dict[str, str]:
    candidates: list[tuple[int, str, dict[str, str]]] = []
    shp_files = [path for path in root.rglob("*") if path.is_file() and path.suffix.lower() == ".shp"]
    shp_names = {path.name.casefold() for path in shp_files}
    projects = [
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in {".qgz", ".qgs"}
    ]
    for project in sorted(projects, key=lambda path: path.as_posix().casefold()):
        raw = _qgs_bytes(project)
        if not raw:
            continue
        try:
            xml_root = ET.fromstring(raw)
        except (ET.ParseError, DefusedXmlException):
            continue
        tree = xml_root.find("layer-tree-group")
        if tree is None:
            continue
        mapping: dict[str, str] = {}

        def walk(node: ET.Element, groups: tuple[str, ...] = ()) -> None:
            for child in node:
                tag = child.tag.rsplit("}", 1)[-1]
                if tag == "layer-tree-group":
                    name = str(child.attrib.get("name") or "").strip()
                    walk(child, groups + ((name,) if name else ()))
                elif tag == "layer-tree-layer":
                    source = str(child.attrib.get("source") or "").split("|", 1)[0].replace("\\", "/")
                    source_name = PurePosixPath(source).name
                    layer_name = str(child.attrib.get("name") or PurePosixPath(source_name).stem).strip()
                    if source_name.lower().endswith(".shp"):
                        mapping[source_name.casefold()] = "/".join((*groups, layer_name)) or layer_name

        walk(tree)
        score = sum(1 for name in mapping if name in shp_names)
        candidates.append((score, project.as_posix(), mapping))
    if not candidates:
        return {}
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return candidates[0][2]


def _sidecar(shp: Path, suffix: str) -> Path | None:
    target = f"{shp.stem}{suffix}".casefold()
    for sibling in shp.parent.iterdir():
        if sibling.is_file() and sibling.name.casefold() == target:
            return sibling
    return None


def _encoding_for(shp: Path) -> str:
    cpg = _sidecar(shp, ".cpg")
    if cpg is not None:
        value = cpg.read_text(encoding="ascii", errors="ignore").strip()
        if value:
            return value
    return "utf-8"


def _transform_position(position: Any, transformer: pyproj.Transformer) -> list[float]:
    values = list(position)
    if len(values) < 2:
        raise GisImportError("Une géométrie SHP contient une coordonnée invalide.")
    x, y = transformer.transform(float(values[0]), float(values[1]))
    if not math.isfinite(x) or not math.isfinite(y) or not -180 <= x <= 180 or not -90 <= y <= 90:
        raise GisImportError("La reprojection SHP a produit une coordonnée invalide.")
    return [x, y, *values[2:]]


def _transform_coordinates(
    value: Any, transformer: pyproj.Transformer
) -> tuple[Any, int, list[tuple[float, float]]]:
    if not isinstance(value, (list, tuple)) or not value:
        raise GisImportError("Une géométrie SHP contient des coordonnées invalides.")
    if not isinstance(value[0], (list, tuple)):
        position = _transform_position(value, transformer)
        return position, 1, [(position[0], position[1])]
    output = []
    count = 0
    points: list[tuple[float, float]] = []
    for child in value:
        normalized, child_count, child_points = _transform_coordinates(child, transformer)
        output.append(normalized)
        count += child_count
        points.extend(child_points)
    return output, count, points


def _transform_geometry(
    geometry: dict[str, Any], transformer: pyproj.Transformer
) -> tuple[dict[str, Any], int, list[tuple[float, float]]]:
    geometry_type = geometry.get("type")
    if geometry_type == "GeometryCollection":
        children = []
        count = 0
        points: list[tuple[float, float]] = []
        for child in geometry.get("geometries") or []:
            normalized, child_count, child_points = _transform_geometry(child, transformer)
            children.append(normalized)
            count += child_count
            points.extend(child_points)
        return {"type": "GeometryCollection", "geometries": children}, count, points
    if geometry_type not in _SUPPORTED_GEOMETRY_TYPES:
        raise GisImportError(f"Géométrie SHP non prise en charge : {geometry_type}.")
    coordinates, count, points = _transform_coordinates(geometry.get("coordinates"), transformer)
    return {"type": geometry_type, "coordinates": coordinates}, count, points


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _feature_name(properties: dict[str, Any], fallback: str) -> str:
    folded = {str(key).casefold(): value for key, value in properties.items()}
    for key in ("name", "nom", "label", "title", "id", "code", "reference", "ref"):
        value = folded.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()[:500]
    return fallback[:500]


def _parse_extracted_qgis(
    root: Path, *, source_filename: str, source_sha256: str, source_size: int
) -> ParsedDataset:
    shp_files = sorted(
        [path for path in root.rglob("*") if path.is_file() and path.suffix.lower() == ".shp"],
        key=lambda path: path.as_posix().casefold(),
    )
    if not shp_files:
        raise GisImportError("Le projet QGIS ne contient aucun Shapefile (.shp).")

    layer_map = _project_layer_map(root)
    features: list[ParsedFeature] = []
    feature_counts: Counter[str] = Counter()
    warnings: list[str] = []
    all_points: list[tuple[float, float]] = []
    coordinate_total = 0

    for shp in shp_files:
        sidecars = {suffix: _sidecar(shp, suffix) for suffix in _REQUIRED_SHP_SIDECARS}
        missing = [suffix for suffix, path in sidecars.items() if path is None]
        if missing:
            warnings.append(
                f"{shp.name}: ignoré, fichiers associés manquants ({', '.join(sorted(missing))})."
            )
            continue
        prj = sidecars[".prj"]
        assert prj is not None
        try:
            crs = pyproj.CRS.from_wkt(prj.read_text(encoding="utf-8-sig", errors="strict"))
            transformer = pyproj.Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        except Exception as exc:
            raise GisImportError(f"{shp.name}: projection .prj invalide ou non prise en charge.") from exc

        folder_path = layer_map.get(shp.name.casefold(), shp.stem)
        try:
            reader = shapefile.Reader(
                str(shp), encoding=_encoding_for(shp), encodingErrors="replace"
            )
        except Exception as exc:
            raise GisImportError(f"{shp.name}: Shapefile illisible.") from exc

        fields = [field[0] for field in reader.fields[1:]]
        for record_index, shape_record in enumerate(reader.iterShapeRecords(), start=1):
            if shape_record.shape.shapeType == shapefile.NULL:
                continue
            try:
                geometry = shape_record.shape.__geo_interface__
                geometry, coordinate_count, geometry_points = _transform_geometry(
                    geometry, transformer
                )
            except GisImportError:
                raise
            except Exception as exc:
                raise GisImportError(f"{shp.name}: géométrie #{record_index} invalide.") from exc

            coordinate_total += coordinate_count
            if coordinate_total > MAX_COORDINATES:
                raise GisImportError("Le projet dépasse la limite de complexité géométrique.")

            properties = {
                key: _json_value(value)
                for key, value in zip(fields, shape_record.record)
            }
            encoded = json.dumps(
                properties, ensure_ascii=False, allow_nan=False
            ).encode("utf-8")
            if len(encoded) > MAX_ATTRIBUTE_BYTES:
                raise GisImportError(f"{shp.name}: attributs trop volumineux.")

            geometry_type = geometry["type"]
            feature_counts[geometry_type] += 1
            features.append(
                ParsedFeature(
                    external_id=f"{shp.stem}:{record_index}"[:255],
                    name=_feature_name(properties, f"{shp.stem} #{record_index}"),
                    folder_path=folder_path[:512],
                    geometry_geojson=geometry,
                    geometry_type=geometry_type,
                    properties=properties,
                    style={},
                )
            )
            all_points.extend(geometry_points)
            if len(features) > MAX_FEATURES:
                raise GisImportError("Le projet contient trop d'entités géographiques.")

    if not features or not all_points:
        raise GisImportError("Le projet QGIS ne contient aucune géométrie exploitable.")

    return ParsedDataset(
        source_type="qgis-rar",
        source_filename=source_filename,
        source_entry=None,
        sha256=source_sha256,
        size_bytes=source_size,
        name=PurePosixPath(source_filename).stem[:500],
        features=tuple(features),
        warnings=tuple(warnings),
        bbox=(
            min(x for x, _ in all_points),
            min(y for _, y in all_points),
            max(x for x, _ in all_points),
            max(y for _, y in all_points),
        ),
        feature_counts=dict(feature_counts),
    )


def parse_qgis_rar_upload(filename: str, payload: bytes) -> ParsedDataset:
    raw_name = PurePosixPath(str(filename or "").replace("\\", "/")).name
    if not raw_name.lower().endswith(".rar"):
        raise GisImportError("Le fichier n'est pas une archive QGIS RAR prise en charge.")
    if not payload:
        raise GisImportError("L'archive RAR est vide.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise GisImportError("Le fichier dépasse la taille maximale autorisée.")

    with TemporaryDirectory(prefix="bluevector-qgis-") as temp:
        root = Path(temp)
        _extract_allowed_rar(payload, root)
        return _parse_extracted_qgis(
            root,
            source_filename=raw_name,
            source_sha256=sha256(payload).hexdigest(),
            source_size=len(payload),
        )
