from datetime import datetime, timezone

import pytest

from backend.integrations.praxedo.payloads import (
    PraxedoPayloadError,
    intervention_snapshot,
    stock_movement,
    technician_stock_snapshot,
    work_report,
)


NOW = datetime(2026, 9, 8, 11, 0, tzinfo=timezone.utc)


def test_technician_stock_snapshot_is_deterministic_and_keeps_zero_stock():
    payload = technician_stock_snapshot(
        technician_id=7,
        captured_at=NOW,
        items=[
            {"local_item_id": 2, "sku": "B", "quantity": 0, "unit": "m"},
            {"local_item_id": 1, "sku": "A", "quantity": 12.5, "unit": "m"},
        ],
    )
    assert payload["schema"] == "bluevector.praxedo.canonical.v1"
    assert payload["operation"] == "technician_stock_snapshot"
    assert [item["sku"] for item in payload["body"]["items"]] == ["A", "B"]
    assert payload["body"]["items"][1]["quantity"] == 0


def test_stock_movement_requires_positive_quantity():
    with pytest.raises(PraxedoPayloadError, match="quantity_must_be_positive"):
        stock_movement(
            movement_id=90,
            movement_type="CONSOMMATION",
            technician_id=7,
            occurred_at=NOW,
            item={"sku": "CABLE-1F", "quantity": 0, "unit": "m"},
        )


def test_intervention_snapshot_carries_cable_length_without_guessing_tenant_fields():
    payload = intervention_snapshot(
        job_id=42,
        job_number="BV-42",
        status="completed",
        updated_at=NOW,
        technician_id=7,
        cable_length_m=87.4,
        custom_fields={"pc_entry": "PC-01", "pc_exit": "PTO-09"},
    )
    assert payload["operation"] == "intervention_snapshot"
    assert payload["body"]["cable_length_m"] == 87.4
    assert payload["body"]["custom_fields"]["pc_entry"] == "PC-01"
    assert "businessEvent" not in payload
    assert "activityId" not in payload


def test_work_report_contains_consumption_and_cable_length():
    payload = work_report(
        job_id=42,
        technician_id=7,
        completed_at=NOW,
        cable_length_m=91,
        consumed_items=[
            {"sku": "CONNECTOR", "quantity": 2, "unit": "piece"},
            {"sku": "CABLE-1F", "quantity": 91, "unit": "m"},
        ],
    )
    assert payload["operation"] == "work_report"
    assert payload["body"]["cable_length_m"] == 91
    assert len(payload["body"]["consumed_items"]) == 2


def test_payloads_reject_naive_timestamps():
    with pytest.raises(PraxedoPayloadError, match="timestamp_must_be_timezone_aware"):
        technician_stock_snapshot(
            technician_id=7,
            captured_at=datetime(2026, 9, 8, 11, 0),
            items=[],
        )
