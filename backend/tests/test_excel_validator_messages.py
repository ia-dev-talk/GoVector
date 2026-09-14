from backend.services.excel.validator import ExcelValidator


TYPE_REQUIRED_MESSAGE = (
    "Type d’intervention obligatoire. Choisissez un type du référentiel "
    "pour ce lot ou corrigez le mapping."
)


def test_missing_type_is_blocking_but_operational_gaps_are_advisories():
    result = ExcelValidator([
        {
            "job_number": "101247567",
            "job_type": None,
            "customer_name": "AIT EL BACHIR MBAREK",
            "service_address": "CASABLANCA",
            "service_city": None,
            "nro": None,
            "pbo": None,
            "scheduled_date": "2026-09-14T15:00:00+00:00",
            "source_technician_name": None,
            "latitude": None,
            "longitude": None,
            "gps_source": None,
            "_meta": {"row": 2},
        }
    ]).validate()

    job = result["jobs"][0]
    assert job["_valid"] is False
    assert job["_selected"] is False
    assert job["_blocking_errors"] == [
        {
            "code": "job_type",
            "field": "job_type",
            "message": TYPE_REQUIRED_MESSAGE,
        }
    ]
    advisory_codes = {item["code"] for item in job["_advisories"]}
    assert {
        "soft:service_city",
        "soft:nro",
        "soft:pbo",
        "soft:source_technician_name",
        "soft:gps_coordinates",
    }.issubset(advisory_codes)
    assert "job_type" in job["_warnings"]
    assert "soft:gps_coordinates" in job["_warnings"]
    assert result["invalid"] == 1
    assert result["blocking_errors"][0]["row"] == 2


def test_missing_gps_nro_pbo_city_and_source_technician_do_not_block():
    result = ExcelValidator([
        {
            "job_number": "101247569",
            "job_type": "RACCORDEMENT",
            "customer_name": "Client",
            "service_address": "Adresse",
            "scheduled_date": "2026-09-15T15:00:00+00:00",
        }
    ]).validate()

    job = result["jobs"][0]
    assert job["_valid"] is True
    assert job["_selected"] is True
    assert job["_blocking_errors"] == []
    assert len(job["_advisories"]) >= 5
    assert result["valid"] == 1
    assert result["blocking_errors"] == []
