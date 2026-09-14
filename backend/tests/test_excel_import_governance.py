from types import SimpleNamespace

from backend.api.routes.import_confirm import (
    _apply_explicit_batch_job_type,
    _resolve_sector,
)


def _choice():
    return {
        "code": "RACCORDEMENT",
        "label": "Raccordement",
        "canonical": "RACCORDEMENT",
        "custom": False,
    }


def test_sector_resolution_requires_exact_unique_alias():
    item = {"sector_raw": "Casablanca Hay Hassani"}

    _resolve_sector(item, {"hay hassani": [17], "ain sebaa": [23]})

    assert item["sector_id"] is None
    assert item["_sector_resolution_error"]
    assert "Choisissez manuellement" in item["_sector_resolution_error"]


def test_sector_resolution_accepts_exact_alias_and_records_provenance():
    item = {"sector_raw": "Sidi Maârouf", "operational_data": {"source": "xlsx"}}

    _resolve_sector(item, {"sidi maarouf": [4]})

    assert item["sector_id"] == 4
    assert item["_sector_resolution_error"] is None
    assert item["operational_data"]["source"] == "xlsx"
    assert item["operational_data"]["import_sector_resolution"] == {
        "mode": "exact_registry_alias",
        "sector_id": 4,
        "source_label": "Sidi Maârouf",
    }


def test_sector_resolution_accepts_explicit_active_sector_id():
    item = {"sector_raw": "Libellé opérateur", "sector_id": 23}

    _resolve_sector(item, {"hay hassani": [17], "ain sebaa": [23]})

    assert item["sector_id"] == 23
    assert item["_sector_resolution_mode"] == "explicit_sector_id"


def test_explicit_batch_type_removes_only_the_type_blocker_and_records_provenance():
    item = {
        "job_number": "101247567",
        "job_type": None,
        "customer_name": "AIT EL BACHIR MBAREK",
        "service_address": "Nouvelle ZI Zenata",
        "scheduled_date": "2026-09-14T15:00:00+00:00",
        "_valid": False,
        "_selected": True,
        "_blocking_errors": [
            {
                "code": "job_type",
                "field": "job_type",
                "message": "Type obligatoire",
            }
        ],
        "operational_data": {"source_technician_name": "Technicien source"},
        "_meta": {"sheet": "Feuil1", "row": 2},
    }

    resolved = _apply_explicit_batch_job_type(
        item,
        choice=_choice(),
        user_id=42,
    )

    assert resolved["job_type"] == "RACCORDEMENT"
    assert resolved["_valid"] is True
    assert resolved["_selected"] is True
    assert resolved["_blocking_errors"] == []
    provenance = resolved["operational_data"]["import_job_type_resolution"]
    assert provenance["mode"] == "explicit_batch_default"
    assert provenance["selected_code"] == "RACCORDEMENT"
    assert provenance["canonical"] == "RACCORDEMENT"
    assert provenance["selected_by_user_id"] == 42


def test_explicit_batch_type_does_not_hide_another_blocker():
    item = {
        "job_number": None,
        "job_type": None,
        "_valid": False,
        "_selected": True,
        "_blocking_errors": [
            {"code": "job_number", "field": "job_number", "message": "Référence obligatoire"},
            {"code": "job_type", "field": "job_type", "message": "Type obligatoire"},
        ],
    }

    resolved = _apply_explicit_batch_job_type(
        item,
        choice=_choice(),
        user_id=42,
    )

    assert resolved["job_type"] == "RACCORDEMENT"
    assert resolved["_valid"] is False
    assert any(error.get("field") == "job_number" for error in resolved["_blocking_errors"])


def test_explicit_batch_type_never_overrides_a_source_type():
    item = {
        "job_number": "CMD-1",
        "job_type": "SAV",
        "_valid": True,
        "_selected": True,
        "operational_data": {},
    }

    resolved = _apply_explicit_batch_job_type(
        item,
        choice=_choice(),
        user_id=42,
    )

    assert resolved["job_type"] == "SAV"
    assert "import_job_type_resolution" not in resolved["operational_data"]
