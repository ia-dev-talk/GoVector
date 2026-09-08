import json

import pytest

from backend.services.gis.kml_parser import GisImportError
from backend.services.gis.upload_parser import parse_geospatial_upload


def _geojson(features):
    return json.dumps({"type": "FeatureCollection", "features": features}).encode()


def test_geojson_feature_collection_is_normalized_for_round_trip():
    parsed = parse_geospatial_upload(
        "qfield-return.geojson",
        _geojson([
            {
                "type": "Feature",
                "id": "cable-42",
                "properties": {"name": "Cable 42", "job_id": 123},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-7.60, 33.57], [-7.59, 33.58]],
                },
            }
        ]),
        content_type="application/geo+json",
    )

    assert parsed.source_type == "geojson"
    assert parsed.feature_counts == {"LineString": 1}
    assert parsed.features[0].external_id == "cable-42"
    assert parsed.features[0].properties["job_id"] == 123
    assert parsed.bbox == pytest.approx((-7.60, 33.57, -7.59, 33.58))


def test_geojson_rejects_non_feature_collection():
    with pytest.raises(GisImportError):
        parse_geospatial_upload(
            "bad.geojson",
            json.dumps({"type": "Point", "coordinates": [-7.6, 33.5]}).encode(),
            content_type="application/geo+json",
        )


def test_geojson_rejects_out_of_range_coordinates():
    with pytest.raises(GisImportError):
        parse_geospatial_upload(
            "bad.geojson",
            _geojson([
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Point", "coordinates": [999, 33.5]},
                }
            ]),
            content_type="application/geo+json",
        )


def test_kml_still_routes_to_existing_parser():
    kml = b'''<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
      <name>P1</name><Point><coordinates>-7.6,33.5,0</coordinates></Point>
    </Placemark></Document></kml>'''
    parsed = parse_geospatial_upload("legacy.kml", kml, content_type="application/vnd.google-earth.kml+xml")
    assert parsed.source_type == "kml"
    assert parsed.feature_counts == {"Point": 1}
