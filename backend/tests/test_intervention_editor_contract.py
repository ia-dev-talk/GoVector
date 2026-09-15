import pytest
from pydantic import ValidationError

from backend.api.routes.interventions import InterventionEditorPatch


def test_full_intervention_editor_accepts_persisted_ftth_and_source_columns():
    document = InterventionEditorPatch.model_validate({
        "operator": "IAM",
        "nro": "NRO-CASA-01",
        "sro": "SRO-22",
        "pbo": "PBO-18",
        "pto": "PTO-778",
        "splitter": "SPL-4",
        "splitter_port": 7,
        "optical_power_dbm": -18.5,
        "cable_length_m": 126,
        "ont_serial": "ONT123",
        "router_serial": "RTR123",
        "mac_address": "AA:BB:CC:DD:EE:FF",
        "wifi_box_serial": "WIFI123",
        "operational_data": {
            "excel_columns": {
                "REFERENCE_PM": "PM-100",
                "COMMENTAIRE_SOURCE": "client",
            },
        },
    })

    payload = document.model_dump(exclude_unset=True)
    assert payload["pbo"] == "PBO-18"
    assert payload["cable_length_m"] == 126
    assert payload["operational_data"]["excel_columns"]["REFERENCE_PM"] == "PM-100"


def test_full_intervention_editor_keeps_workflow_and_evidence_outside_generic_patch():
    with pytest.raises(ValidationError):
        InterventionEditorPatch.model_validate({"status": "COMPLETED"})

    with pytest.raises(ValidationError):
        InterventionEditorPatch.model_validate({"after_photo": "fake.jpg"})


def test_full_intervention_editor_requires_coordinate_pair():
    with pytest.raises(ValidationError):
        InterventionEditorPatch.model_validate({"latitude": 33.57})
