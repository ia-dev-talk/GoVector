from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

import pyproj
import pytest
import shapefile

from backend.services.gis.kml_parser import GisImportError
from backend.services.gis.qgis_archive_parser import (
    MAX_RAR_ENTRIES,
    _parse_extracted_qgis,
    _project_layer_map,
    _safe_member_name,
    _validate_archive_infos,
)
from backend.services.gis.upload_parser import parse_geospatial_upload


def _write_point_project(root: Path) -> None:
    x, y = pyproj.Transformer.from_crs(
        "EPSG:4326", "EPSG:26191", always_xy=True
    ).transform(-7.61, 33.59)
    writer = shapefile.Writer(str(root / "Cable"), shapeType=shapefile.POINT)
    writer.field("NOM", "C", size=80)
    writer.point(x, y)
    writer.record("Cable A")
    writer.close()
    (root / "Cable.prj").write_text(
        pyproj.CRS.from_epsg(26191).to_wkt(), encoding="utf-8"
    )
    (root / "Cable.cpg").write_text("UTF-8", encoding="ascii")
    qgs = """<qgis><layer-tree-group name=""><layer-tree-group name="Projete"><layer-tree-layer name="Cable" source="./Cable.shp"/></layer-tree-group></layer-tree-group></qgis>"""
    with ZipFile(root / "project.qgz", "w") as archive:
        archive.writestr("project.qgs", qgs)


def test_qgis_shapefile_is_reprojected_and_keeps_project_group(tmp_path: Path):
    _write_point_project(tmp_path)
    parsed = _parse_extracted_qgis(
        tmp_path,
        source_filename="pilot.rar",
        source_sha256="a" * 64,
        source_size=123,
    )
    assert parsed.source_type == "qgis-rar"
    assert len(parsed.features) == 1
    feature = parsed.features[0]
    assert feature.folder_path == "Projete/Cable"
    assert feature.name == "Cable A"
    lon, lat = feature.geometry_geojson["coordinates"][:2]
    assert lon == pytest.approx(-7.61, abs=1e-6)
    assert lat == pytest.approx(33.59, abs=1e-6)
    assert parsed.bbox == pytest.approx((-7.61, 33.59, -7.61, 33.59), abs=1e-6)


def test_missing_sidecar_is_skipped_and_reported(tmp_path: Path):
    _write_point_project(tmp_path)
    (tmp_path / "Cable.prj").unlink()
    with pytest.raises(GisImportError, match="aucune géométrie exploitable"):
        _parse_extracted_qgis(
            tmp_path,
            source_filename="pilot.rar",
            source_sha256="a" * 64,
            source_size=123,
        )


@pytest.mark.parametrize(
    "member",
    ["../evil.shp", "/tmp/evil.shp", "C:\\evil.shp", "safe/../../evil.shp"],
)
def test_rar_member_paths_reject_traversal(member: str):
    with pytest.raises(GisImportError, match="chemin dangereux"):
        _safe_member_name(member)


def test_rar_archive_entry_limit_is_enforced():
    infos = [
        SimpleNamespace(
            filename=f"layer-{index}.shp",
            file_size=1,
            compress_size=1,
            isdir=lambda: False,
            is_symlink=lambda: False,
        )
        for index in range(MAX_RAR_ENTRIES + 1)
    ]
    with pytest.raises(GisImportError, match="trop de fichiers"):
        _validate_archive_infos(infos)


def test_upload_dispatches_rar_without_changing_existing_formats(monkeypatch):
    marker = object()

    def fake_parser(filename: str, payload: bytes):
        assert filename == "network.rar"
        assert payload == b"rar"
        return marker

    monkeypatch.setattr(
        "backend.services.gis.qgis_archive_parser.parse_qgis_rar_upload",
        fake_parser,
    )
    assert parse_geospatial_upload("network.rar", b"rar") is marker


def test_qgis_project_rejects_xml_entities_without_expansion(tmp_path: Path):
    (tmp_path / "unsafe.qgs").write_text(
        '<!DOCTYPE qgis [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        '<qgis><layer-tree-group name="&xxe;"/></qgis>',
        encoding="utf-8",
    )

    assert _project_layer_map(tmp_path) == {}
