from backend.database.models import JobStatus
from backend.api.routes.import_confirm import _resolve_sector
from backend.services.excel.ftth_mapper import map_excel_row
from backend.services.excel.job_factory import create_job
from backend.services.excel import job_fields
from backend.services.excel.job_fields import build_job_record
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
