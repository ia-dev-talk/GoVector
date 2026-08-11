from types import SimpleNamespace

from backend.logic.site_attributes import (
    classify_attribute_observation,
    extract_structured_attribute,
    normalize_attribute_value,
    planned_value_for_job,
)


def test_network_reference_requires_an_explicit_supported_type():
    assert extract_structured_attribute(
        action_type="network_reference",
        payload={"value": "PTO-CASA-001"},
    ) is None

    extracted = extract_structured_attribute(
        action_type="network_reference",
        payload={"reference_type": "pto", "value": "PTO-CASA-001"},
    )
    assert extracted == (
        "pto_reference",
        "PTO-CASA-001",
        {"reference_type": "pto"},
    )


def test_equipment_scan_maps_only_known_operational_categories():
    assert extract_structured_attribute(
        action_type="equipment_scan",
        payload={"category": "ont", "code": "ONT-42", "label": "ONT"},
    ) == (
        "ont_serial",
        "ONT-42",
        {"category": "ont", "label": "ONT"},
    )

    other = extract_structured_attribute(
        action_type="equipment_scan",
        payload={"category": "custom", "code": "EQ-9"},
    )
    assert other[0] == "equipment_reference"


def test_structured_comparison_is_exact_but_case_and_space_tolerant():
    assert normalize_attribute_value("  pto-casa-001  ") == "PTO-CASA-001"
    assert normalize_attribute_value("PTO   CASA 001") == "PTO CASA 001"

    assert classify_attribute_observation(
        observed_value="pto-casa-001",
        resolved_value="PTO-CASA-001",
        planned_value=None,
    ) == "accepted"
    assert classify_attribute_observation(
        observed_value="PTO-CASA-002",
        resolved_value="PTO-CASA-001",
        planned_value=None,
    ) == "conflict"
    assert classify_attribute_observation(
        observed_value="PBO-77",
        resolved_value=None,
        planned_value=None,
    ) == "unreviewed"


def test_planned_value_remains_separate_and_nullable():
    job = SimpleNamespace(
        pto_raw="PTO-PLANNED",
        pbo_raw=None,
        ont_serial=None,
        router_serial="RTR-1",
        wifi_box_serial=None,
        splitter_raw=None,
    )
    assert planned_value_for_job(job, "pto_reference") == "PTO-PLANNED"
    assert planned_value_for_job(job, "pbo_reference") is None
    assert planned_value_for_job(job, "router_serial") == "RTR-1"
    assert planned_value_for_job(job, "pm_reference") is None
