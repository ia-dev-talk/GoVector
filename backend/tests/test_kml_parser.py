from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import pytest

from backend.services.gis.kml_parser import GisImportError, parse_geospatial_upload


KML = b"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Plaque Casablanca</name>
    <Style id="network"><LineStyle><color>ff00ff00</color><width>3</width></LineStyle></Style>
    <Folder>
      <name>Infrastructure</name>
      <Placemark id="pbo-1">
        <name>PBO-CASA-001</name>
        <ExtendedData><Data name="asset_type"><value>PBO</value></Data></ExtendedData>
        <Point><coordinates>-7.6200,33.5900,4</coordinates></Point>
      </Placemark>
      <Placemark id="cable-1">
        <name>Cable 48FO</name><styleUrl>#network</styleUrl>
        <LineString><coordinates>-7.62,33.59 -7.61,33.60</coordinates></LineString>
      </Placemark>
      <Placemark id="zone-1">
        <name>Zone A</name>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          -7.63,33.58 -7.60,33.58 -7.60,33.61 -7.63,33.58
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
    </Folder>
  </Document>
</kml>"""


def _kmz(name: str = "doc.kml", content: bytes = KML) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr(name, content)
    return output.getvalue()


def test_parse_kml_normalizes_geometry_properties_style_and_bounds():
    dataset = parse_geospatial_upload(
        "network.kml",
        KML,
        content_type="application/vnd.google-earth.kml+xml",
    )

    assert dataset.source_type == "KML"
    assert dataset.name == "Plaque Casablanca"
    assert dataset.feature_counts == {"Point": 1, "LineString": 1, "Polygon": 1}
    assert dataset.bbox == (-7.63, 33.58, -7.6, 33.61)
    assert dataset.features[0].folder_path == "Infrastructure"
    assert dataset.features[0].external_id == "pbo-1"
    assert dataset.features[0].properties["asset_type"] == "PBO"
    assert dataset.features[1].style == {
        "line_color": "#00ff00ff",
        "line_width": 3.0,
    }
    assert len(dataset.sha256) == 64


def test_parse_kmz_prefers_doc_kml_and_preserves_source_entry():
    dataset = parse_geospatial_upload(
        "network.kmz",
        _kmz("folder/doc.kml"),
        content_type="application/vnd.google-earth.kmz",
    )

    assert dataset.source_type == "KMZ"
    assert dataset.source_entry == "folder/doc.kml"
    assert len(dataset.features) == 3


def test_parse_kmz_rejects_path_traversal():
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("../doc.kml", KML)

    with pytest.raises(GisImportError, match="chemin dangereux"):
        parse_geospatial_upload("unsafe.kmz", output.getvalue())


def test_parse_kmz_rejects_symbolic_links():
    output = BytesIO()
    link = ZipInfo("doc.kml")
    link.create_system = 3
    link.external_attr = 0o120777 << 16
    with ZipFile(output, "w") as archive:
        archive.writestr(link, KML)

    with pytest.raises(GisImportError, match="chemin dangereux"):
        parse_geospatial_upload("unsafe.kmz", output.getvalue())


@pytest.mark.parametrize(
    "payload, message",
    [
        (b'<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml/>', "déclaration interdite"),
        (b"<not-kml />", "racine KML"),
        (
            b'<kml><Placemark><Point><coordinates>500,95</coordinates></Point></Placemark></kml>',
            "hors des limites",
        ),
    ],
)
def test_parse_kml_rejects_unsafe_or_invalid_xml(payload, message):
    with pytest.raises(GisImportError, match=message):
        parse_geospatial_upload("unsafe.kml", payload)


def test_parse_kml_ignores_network_links_without_fetching_them():
    payload = KML.replace(
        b"<Document>",
        b"<Document><NetworkLink><Link><href>https://example.invalid/a.kml</href></Link></NetworkLink>",
    )
    dataset = parse_geospatial_upload("network.kml", payload)

    assert "Les NetworkLink externes ont été ignorés." in dataset.warnings
    assert len(dataset.features) == 3


@pytest.mark.parametrize("encoding", ["utf-8", "utf-16", "utf-16-be", "utf-16-le"])
@pytest.mark.parametrize("archive", [False, True], ids=["kml", "kmz"])
def test_rejects_dtd_after_long_prologue_in_all_supported_xml_encodings(encoding, archive):
    # Keep the payload valid and below upload limits; the old 128 KiB byte
    # scan missed this declaration and expanded the entity into a feature name.
    declaration = "UTF-8" if encoding == "utf-8" else "UTF-16"
    xml = ('<?xml version="1.0" encoding="' + declaration + '"?>'
           + '<!--' + 'padding ' * 17000 + '-->'
           + '<!DOCTYPE kml [<!ENTITY label "EXPANDED">]>'
           + '<kml><Placemark><name>&label;</name>'
           + '<Point><coordinates>1,2</coordinates></Point></Placemark></kml>')
    payload = xml.encode(encoding)
    if archive:
        # Stored ZIP avoids triggering the independent compression-ratio guard.
        output = BytesIO()
        with ZipFile(output, "w") as bundle:
            bundle.writestr("doc.kml", payload)
        payload = output.getvalue()
    with pytest.raises(GisImportError, match="déclaration interdite"):
        parse_geospatial_upload("unsafe.kmz" if archive else "unsafe.kml", payload)


@pytest.mark.parametrize("encoding", ["utf-8", "utf-16", "utf-16-be", "utf-16-le"])
def test_safe_xml_encodings_preserve_unicode_and_geometry(encoding):
    declaration = "UTF-8" if encoding == "utf-8" else "UTF-16"
    xml = ('<?xml version="1.0" encoding="' + declaration + '"?>'
           + '<kml><Placemark><name>Réseau été</name>'
           + '<Point><coordinates>1,2</coordinates></Point></Placemark></kml>')
    result = parse_geospatial_upload("safe.kml", xml.encode(encoding))
    assert result.features[0].name == "Réseau été"
    assert result.features[0].geometry_geojson == {"type": "Point", "coordinates": [1.0, 2.0]}
