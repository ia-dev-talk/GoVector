from backend.logic.territory_import import (
    clean_import_text,
    extract_qgis_identity,
    extract_qgis_sector_link_id,
    normalize_import_kind,
    qgis_metadata,
    resolve_import_sector_id,
)


def test_qgis_identity_ignores_zero_placeholder_and_reads_customer_columns():
    identity = extract_qgis_identity(
        {
            "name": 0.0,
            "NOM_SECTEUR": "AIN HARROUDA",
            "CODE_SECTEUR": "AH-01",
        },
        feature_id=17,
    )

    assert identity["name"] == "AIN HARROUDA"
    assert identity["code"] == "AH-01"
    assert identity["external_id"] == "17"
    assert clean_import_text("0.0") is None


def test_qgis_identity_falls_back_to_code_instead_of_bad_name():
    identity = extract_qgis_identity({"NOM": "null", "REF": "CASA-42"})
    assert identity["name"] == "CASA-42"
    assert identity["code"] == "CASA-42"


def test_qgis_metadata_preserves_raw_columns():
    raw = {"NOM_SECTEUR": "Anfa", "custom_field": 123, "metadata": {"owner": "qgis"}}
    metadata = qgis_metadata(raw)

    assert metadata["owner"] == "qgis"
    assert metadata["qgis_properties"] == raw


def test_qgis_french_kind_and_explicit_business_link_are_normalized():
    assert normalize_import_kind("Sous-secteur") == "SUBSECTOR"
    assert normalize_import_kind("Secteur") == "SECTOR"
    assert extract_qgis_sector_link_id({"SECTEUR_ID": "12.0"}) == 12


def test_import_sector_link_is_only_returned_when_unambiguous():
    sectors = [
        {"id": 1, "name": "AIN HARROUDA", "description": None, "is_active": True},
        {"id": 2, "name": "ANFA", "description": None, "is_active": True},
    ]

    assert resolve_import_sector_id(sectors=sectors, name="ain harrouda") == 1
    assert resolve_import_sector_id(
        sectors=sectors,
        name="AIN HARROUDA",
        code="ANFA",
    ) is None
