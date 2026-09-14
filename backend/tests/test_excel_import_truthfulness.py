from backend.services.excel import job_fields
from backend.services.excel.job_fields import _parse_datetime, build_job_record


def _job(values, mapping):
    return build_job_record(
        values=values,
        mapping=mapping,
        operator="UNKNOWN",
        sheet_name="Feuil1",
        row_cells=[],
        row_index=2,
    )


def test_magillan_excel_serial_dates_are_september_2026_not_august():
    assert _parse_datetime(46279.625).isoformat() == "2026-09-14T15:00:00+00:00"
    assert _parse_datetime(46279.41180555556).isoformat().startswith(
        "2026-09-14T09:53"
    )
    assert _parse_datetime(46280.625).isoformat() == "2026-09-15T15:00:00+00:00"


def test_commande_is_primary_idempotent_reference_when_both_columns_exist():
    job = _job(
        {1: 101247567, 2: "LEGACY-REF"},
        {"N_COM": 1, "REFERENCE": 2},
    )
    assert job["job_number"] == "101247567"
    assert job["_import_id"] == "Feuil1:2:101247567"


def test_import_never_synthesizes_reference_from_network_or_row():
    job = _job(
        {1: "NRO-ZENATA", 2: "PCO-42"},
        {"NRO": 1, "PBO": 2},
    )
    assert job["job_number"] is None
    assert job["_import_id"] == "Feuil1:2:2"


def test_operator_profile_can_never_inject_type_or_required_skills(monkeypatch):
    monkeypatch.setattr(
        job_fields,
        "get_operator_profile",
        lambda _operator: {
            "default_job_type": "INSTALLATION",
            "skills": ["FTTH", "EPISSURE"],
            "default_priority": job_fields.JobPriority.NORMALE,
            "reference_prefix": "AUTO",
        },
    )
    job = _job({}, {})
    assert job["job_type"] is None
    assert job["required_skills"] == []
    assert job["job_number"] is None
    assert job["latitude"] is None
    assert job["longitude"] is None


def test_source_technician_remains_history_and_never_assignment():
    job = _job(
        {1: "Technicien source MAGILLAN"},
        {"TECH_CABLE": 1},
    )
    assert job["source_technician_name"] == "Technicien source MAGILLAN"
    assert job["operational_data"]["source_technician_name"] == (
        "Technicien source MAGILLAN"
    )
    assert "assigned_technician_name" not in job
