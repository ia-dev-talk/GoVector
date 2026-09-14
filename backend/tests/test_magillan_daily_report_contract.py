from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.services import magillan_daily_report
from backend.services.magillan_logo_data import MAGILLAN_LOGO_DATA_URI


def _context(job_number: str) -> dict:
    return {
        "job": SimpleNamespace(
            id=1,
            job_number=job_number,
            customer_name="Client réel",
            service_address="Adresse réelle",
            service_city="Casablanca",
            scheduled_date=None,
            status="en_attente_validation",
            job_type="INSTALLATION",
            sector_raw="ZENATA",
            nro_raw="NRO-1",
            splitter_raw=None,
            latitude=None,
            longitude=None,
            operational_data={"pco": "PCO-1", "splitter_msan": "MSAN-1"},
            optical_power_dbm=None,
            validation_status="FIELD_AGENT_VERIFIED",
            client_signature=None,
            coordinator_comments="Observation réelle",
            notes=None,
        ),
        "actions": [],
        "media": [],
        "visits": [],
        "cable_consumptions": [],
        "technician_name": "Amine Benali",
        "client_organization_name": "MAGILLAN",
        "media_root": Path("."),
    }


@pytest.mark.asyncio
async def test_multi_intervention_export_uses_complete_report_and_photo_pages(monkeypatch):
    jobs = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
    monkeypatch.setattr(
        magillan_daily_report.FieldOptExportService,
        "get_filtered_jobs",
        AsyncMock(return_value=jobs),
    )
    monkeypatch.setattr(
        magillan_daily_report,
        "load_report_contexts",
        AsyncMock(return_value=[_context("CM-001"), _context("CM-002")]),
    )
    captured = {}

    def fake_pdf(sections: str) -> bytes:
        captured["sections"] = sections
        return b"%PDF-test"

    monkeypatch.setattr(magillan_daily_report, "build_report_pdf_from_sections", fake_pdf)

    result = await magillan_daily_report.export_magillan_daily_report(AsyncMock(), {})

    assert result.startswith(b"%PDF-")
    html = captured["sections"]
    assert html.count('class="report-page"') == 4
    assert html.count("Rapport complet d’intervention") == 2
    assert html.count("Photos de l’intervention") == 2
    assert "CM-001" in html and "CM-002" in html
    assert "Client réel" in html
    assert "Aucune photo synchronisée" in html
    assert MAGILLAN_LOGO_DATA_URI in html
    assert "RAPPORT JOURNALIER" not in html


@pytest.mark.asyncio
async def test_empty_scope_is_rejected_instead_of_generating_a_fake_report(monkeypatch):
    monkeypatch.setattr(
        magillan_daily_report.FieldOptExportService,
        "get_filtered_jobs",
        AsyncMock(return_value=[]),
    )

    with pytest.raises(ValueError, match="Aucune intervention"):
        await magillan_daily_report.export_magillan_daily_report(AsyncMock(), {})
