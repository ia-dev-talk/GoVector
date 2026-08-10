from backend.database.models import JobStatus
from backend.api.routes.import_confirm import _resolve_sector
from backend.services.excel.ftth_mapper import map_excel_row
from backend.services.excel.job_factory import create_job
from backend.services.excel import job_fields
from backend.services.excel.job_fields import build_job_record
from backend.services.excel.mapper import ExcelMapper
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
