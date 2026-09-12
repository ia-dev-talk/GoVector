from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from backend.database.models import JobStatus
from backend.api.routes import import_confirm
from backend.api.routes.import_confirm import (
    _build_sector_index,
    _create_job_from_dict,
    _resolve_sector,
    _update_job_from_dict,
)
from backend.logic.job_sectors import SectorIdentity
from backend.services.excel.ftth_mapper import map_excel_row
from backend.services.excel.job_factory import create_job
from backend.services.excel import job_fields
from backend.services.excel.job_fields import build_job_record
from backend.services.excel.job_fields import _parse_datetime
from backend.services.excel.mapper import ExcelMapper
from backend.services.excel.jobs_builder import JobsBuilder
from backend.services.excel.parser import parse_spreadsheet
from backend.services.excel.validator import ExcelValidator


def test_importer_has_no_coordinate_fabrication_fallback():
    assert not hasattr(job_fields, "estimate_coordinates")


def test_build_job_record_minimal():
    mapping = {"CLIENT": 1, "ADRESSE": 2}
    values = {1: "Ahmed", 2: "12 rue test"}
    row_cells = [{"status": "NORMAL"}]

    job = build_job_record(
        values=values,
        mapping=mapping,
        operator="IAM",
        sheet_name="Sheet1",
        row_cells=row_cells,
        row_index=2,
    )

    assert job["customer_name"] == "Ahmed"
    assert job["service_address"] == "12 rue test"
    assert job["job_type"] == "INSTALLATION"
    assert job["latitude"] is None
    assert job["longitude"] is None
    assert job["gps_source"] is None
    assert "install" in job["required_skills"]
    assert job["_import_id"]


def test_excel_numeric_dates_are_preserved_as_scheduled_dates():
    first = _parse_datetime(46245.41180555556)
    second = _parse_datetime("46246.625")

    assert first is not None
    assert first.isoformat().startswith("2026-08-11T09:53")
    assert second is not None
    assert second.isoformat() == "2026-08-12T15:00:00+00:00"


def test_source_action_date_is_preserved_without_stealing_planning_date():
    workbook = [{
        "sheet": "Feuil1",
        "rows": [
            [_cell(1, 1, "DATE"), _cell(1, 2, "DATE D'ACTION")],
            [_cell(2, 1, 46245.41180555556), _cell(2, 2, 46196.51388888889)],
        ],
    }]

    mapped = ExcelMapper(workbook).map()
    job = JobsBuilder(mapped).build()[0]

    assert mapped[0]["mapping"]["DATE"] == 1
    assert job["scheduled_date"].startswith("2026-08-11T09:53")
    action_match = next(
        item for item in mapped[0]["column_matches"]
        if item["header"] == "DATE D'ACTION"
    )
    assert action_match["method"] == "exact"
    assert action_match["field"] == "DATE_ACTION"
    assert job["operational_data"]["date_action"].startswith("2026-06-23T12:20")


def test_magillan_workbook_columns_have_distinct_canonical_destinations():
    headers = [
        "SECTEUR", "DATE", "COMMANDE", "INTITULÉ CLIENT", "CONTACT",
        "ADRESSE", "AVANCEMENT MAGILLAN", "DATE D'ACTION", "OBSERVATION",
        "SPLITTER/MSAN", "PCO", "SN", "POSITION PCO", "GPS PCO",
        "GPS DERIVATION", "GPS SPLITTER", "STATUT", "TECH CB", "TECH RAC",
        "TECH CABLE", "CB", "CABLE", "CODE", "DEPART", "ARRIVE",
        "CONDUITE", "F/I", "A", "SIGNAL", "REMARQUE",
    ]
    values = [
        "ZENATA", "12/09/2026", "CM-1", "Client", "0600000000",
        "Adresse", "Terminé", "12/09/2026 16:00", "Observation",
        "MSAN-1", "PCO-9", "ONT-123", "Poteau 4", "33.1,-7.5",
        "33.2,-7.6", "33.3,-7.7", "TERMINE", "Tech CB", "Tech RAC",
        "Tech Cable", "12", "FO16", "4475", 2003, 1921,
        82, 0, 0, -18.5, "RAS",
    ]
    workbook = [{
        "sheet": "Magillan",
        "rows": [
            [_cell(1, i, value) for i, value in enumerate(headers, 1)],
            [_cell(2, i, value) for i, value in enumerate(values, 1)],
        ],
    }]

    mapped = ExcelMapper(workbook).map()
    job = JobsBuilder(mapped).build()[0]

    assert mapped[0]["unmapped_headers"] == []
    assert len(mapped[0]["mapping"]) == 30
    assert job["job_number"] == "CM-1"
    assert job["operational_data"]["cable_code"] == "4475"
    assert job["operational_data"]["cable_depart_m"] == 2003
    assert job["operational_data"]["cable_arrive_m"] == 1921
    assert job["cable_length_m"] == 82
    assert job["optical_power_dbm"] == -18.5
    assert job["ont_serial"] == "ONT-123"
    assert job["assigned_technician_name"] == "Tech Cable"


def test_import_mapping_override_accepts_a_real_file_header_without_code_change():
    mapper = ExcelMapper(
        workbook=None,
        operator="ORANGE",
        mapping_overrides={"PTO": ["PRISE OPTIQUE CLIENT"]},
    )

    assert mapper._match_field("Prise Optique Client") == "PTO"


def _cell(row, column, value):
    return {
        "row": row,
        "column": column,
        "coordinate": f"{row}:{column}",
        "value": value,
        "status": "NORMAL",
    }


def test_mapper_detects_a_header_below_operator_title_rows():
    workbook = [{
        "sheet": "Plaque Bourgogne",
        "rows": [
            [_cell(1, 1, "Commande opérateur - plaque Bourgogne")],
            [_cell(2, 1, None)],
            [_cell(3, 1, "Nom abonné"), _cell(3, 2, "Adresse client"), _cell(3, 3, "PBO")],
            [_cell(4, 1, "Aziz"), _cell(4, 2, "Rue de Boukraa"), _cell(4, 3, "PBO-42")],
        ],
    }]

    mapped = ExcelMapper(workbook, operator="UNKNOWN").map()
    jobs = JobsBuilder(mapped).build()

    assert mapped[0]["header_row"] == 3
    assert mapped[0]["header_detection"] == "automatic"
    assert mapped[0]["header_confidence"] in {"medium", "high"}
    assert jobs[0]["customer_name"] == "Aziz"
    assert jobs[0]["service_address"] == "Rue de Boukraa"
    assert jobs[0]["pbo"] == "PBO-42"
    assert jobs[0]["_meta"]["row"] == 4


def test_manual_column_override_wins_over_builtin_alias_and_can_ignore():
    mapper = ExcelMapper(
        workbook=None,
        column_overrides={"CLIENT": "REFERENCE", "STATUT": None},
    )

    assert mapper._match_field("CLIENT") == "REFERENCE"
    assert mapper._match_field("STATUT") is None
    assert mapper._match_field_details("CLIENT")[1] == "manual"
    assert mapper._match_field_details("STATUT")[1] == "ignored"


def test_manual_header_row_override_is_preserved_in_diagnostics():
    workbook = [{
        "sheet": "Feuil1",
        "rows": [
            [_cell(1, 1, "CLIENT"), _cell(1, 2, "ADRESSE")],
            [_cell(2, 1, "Titre client"), _cell(2, 2, "Adresse client")],
            [_cell(3, 1, "Karim"), _cell(3, 2, "Casablanca")],
        ],
    }]

    mapped = ExcelMapper(
        workbook,
        header_row_overrides={"Feuil1": 2},
    ).map()

    assert mapped[0]["header_row"] == 2
    assert mapped[0]["header_detection"] == "manual"
    assert mapped[0]["column_matches"][0]["field"] == "INTITULE_CLIENT"
    assert mapped[0]["column_matches"][0]["method"] == "partial"


def test_duplicate_canonical_mapping_is_reported_instead_of_hidden():
    workbook = [{
        "sheet": "Feuil1",
        "rows": [
            [_cell(1, 1, "CLIENT"), _cell(1, 2, "NOM CLIENT")],
            [_cell(2, 1, "Aziz"), _cell(2, 2, "Aziz Loass")],
        ],
    }]

    mapped = ExcelMapper(workbook).map()

    matches = mapped[0]["column_matches"]
    assert matches[0]["selected"] is True
    assert matches[1]["selected"] is False
    assert matches[1]["issue"] == "duplicate_field"


def test_csv_parser_detects_semicolon_and_windows_encoding(tmp_path):
    filepath = tmp_path / "commandes.csv"
    filepath.write_bytes(
        "COMMANDE;NOM CLIENT;ADRESSE CLIENT\nCMD-1;Aziz;Résidence Yahya\n".encode(
            "cp1252"
        )
    )

    workbook = parse_spreadsheet(str(filepath))

    assert [cell["value"] for cell in workbook[0]["rows"][0]] == [
        "COMMANDE",
        "NOM CLIENT",
        "ADRESSE CLIENT",
    ]
    assert workbook[0]["rows"][1][2]["value"] == "Résidence Yahya"


def test_import_sector_inference_uses_unambiguous_known_name_inside_city_text():
    item = {"sector_raw": "Casablanca Hay Hassani"}

    _resolve_sector(item, {"hay hassani": [17], "ain sebaa": [23]})

    assert item["sector_id"] == 17
    assert item.get("import_warnings") in (None, [])


def test_import_sector_inference_uses_operational_description_aliases():
    sector_index = _build_sector_index([
        (
            4,
            "Secteur Sud",
            "Secteur Sud de Casablanca — Sidi Maârouf, Oasis, Val d'Anfa",
        ),
    ])
    item = {"sector_raw": "Sidi Maarouf"}

    _resolve_sector(item, sector_index)

    assert item["sector_id"] == 4
    assert item.get("import_warnings") in (None, [])


@pytest.mark.asyncio
async def test_update_import_preserves_existing_sector_on_unknown_raw_label(
    monkeypatch,
):
    job = SimpleNamespace(
        id=31,
        sector_id=4,
        sector_raw="Sidi Maârouf",
        route_criteria="Sidi Maârouf",
        latitude=None,
        longitude=None,
        updated_at=None,
    )
    db = SimpleNamespace(add=Mock())
    monkeypatch.setattr(
        import_confirm,
        "resolve_sector_for_write",
        AsyncMock(return_value=None),
    )

    updated = await _update_job_from_dict(
        db,
        job,
        {"sector_raw": "Quartier inconnu", "sector_id": None},
    )

    assert updated.sector_id == 4
    assert updated.sector_raw == "Sidi Maârouf"


@pytest.mark.asyncio
async def test_update_import_accepts_structured_territory_resolution(monkeypatch):
    job = SimpleNamespace(
        id=31,
        sector_id=None,
        sector_raw=None,
        route_criteria=None,
        latitude=None,
        longitude=None,
        updated_at=None,
    )
    db = SimpleNamespace(add=Mock())
    monkeypatch.setattr(
        import_confirm,
        "resolve_sector_for_write",
        AsyncMock(return_value=SectorIdentity(9, "Secteur structuré", "TERR-09")),
    )

    updated = await _update_job_from_dict(
        db,
        job,
        {"sector_raw": "TERR-09", "sector_id": None},
    )

    assert updated.sector_id == 9
    assert updated.sector_raw == "TERR-09"


@pytest.mark.asyncio
async def test_update_import_resolves_route_for_a_job_without_sector(monkeypatch):
    job = SimpleNamespace(
        id=31,
        sector_id=None,
        sector_raw=None,
        route_criteria="Ancienne zone",
        latitude=None,
        longitude=None,
        updated_at=None,
    )
    db = SimpleNamespace(add=Mock())
    resolver = AsyncMock(
        return_value=SectorIdentity(4, "Secteur Sud", "Sidi Maârouf")
    )
    monkeypatch.setattr(import_confirm, "resolve_sector_for_write", resolver)

    updated = await _update_job_from_dict(
        db,
        job,
        {"route_criteria": "Sidi Maârouf"},
    )

    assert updated.sector_id == 4
    assert updated.sector_raw == "Sidi Maârouf"
    resolver.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_without_duration_delegates_to_the_type_default(monkeypatch):
    create = AsyncMock(return_value=SimpleNamespace(id=31))
    monkeypatch.setattr(import_confirm.job_logic, "create_job", create)

    await _create_job_from_dict(
        SimpleNamespace(),
        {
            "_valid": True,
            "customer_name": "Client QA",
            "service_address": "Sidi Maârouf",
            "job_type": "RACCORDEMENT",
            "estimated_duration": None,
        },
    )

    assert create.await_args.kwargs["estimated_duration"] is None


def test_validator_marks_soft_warnings():
    jobs = [{
        "customer_name": "Test",
        "service_address": "Adresse",
        "_import_id": "a:1:1",
        "_meta": {"row": 2},
    }]

    result = ExcelValidator(jobs).validate()

    assert result["valid"] == 1
    annotated = result["jobs"][0]
    assert annotated["_valid"] is True
    assert "soft:nro" in annotated["_warnings"]
    assert "soft:gps_coordinates" in annotated["_warnings"]


def test_build_job_record_never_invents_identity_or_address():
    job = build_job_record(
        values={},
        mapping={},
        operator="UNKNOWN",
        sheet_name="Sheet1",
        row_cells=[],
        row_index=2,
    )

    assert job["customer_name"] is None
    assert job["service_address"] is None
    assert job["latitude"] is None
    assert job["longitude"] is None


def test_failed_status_text_is_not_converted_to_cancelled():
    job = build_job_record(
        values={1: "FAILED"},
        mapping={"STATUT": 1},
        operator="UNKNOWN",
        sheet_name="Sheet1",
        row_cells=[],
        row_index=2,
    )

    assert job["status"] == JobStatus.FAILED.value


def test_failed_cell_color_is_not_converted_to_cancelled():
    job = build_job_record(
        values={},
        mapping={},
        operator="UNKNOWN",
        sheet_name="Sheet1",
        row_cells=[{"status": "FAILED"}],
        row_index=2,
    )
    legacy_job = map_excel_row({"_color": "#FF0000"})

    assert job["status"] == JobStatus.FAILED.value
    assert legacy_job["status"] == JobStatus.FAILED


def test_legacy_factory_cannot_fabricate_required_job_data():
    try:
        create_job({})
    except RuntimeError as exc:
        assert "validated import pipeline" in str(exc)
    else:
        raise AssertionError("legacy factory unexpectedly created a fake job")
