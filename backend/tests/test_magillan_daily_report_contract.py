from types import SimpleNamespace

from backend.services.magillan_daily_report import _report_page
from backend.services.magillan_logo_data import MAGILLAN_LOGO_DATA_URI


def test_magillan_daily_report_keeps_supplied_template_labels_and_real_logo():
    job = SimpleNamespace(
        job_number="DEM-001",
        nro_raw="CENTRAL CASA",
        customer_name="Client test",
        service_address="Adresse test",
        latitude=33.5731,
        longitude=-7.5898,
        splitter_raw="SPL-12",
        service_city="CASABLANCA",
        cable_length_m=125,
        coordinator_comments="Observation terrain",
        notes=None,
        description=None,
    )

    html = _report_page(job)

    for label in (
        "RAPPORT JOURNALIER",
        "N° de demande :",
        "N° de rapport :",
        "CENTRAL",
        "CLIENT",
        "ADRESSE",
        "G.P.S du Central",
        "1° SPLITTER",
        "G.P.S",
        "N° SPLITTER",
        "N° BR AFFECTÉE",
        "PCO",
        "LOCALITE",
        "POSE CABLE",
        "RACCORDEMENT",
        "OBSERVATION",
        "TYPE DE POSE",
        "Signature de technicien :",
        "Signature de responsable d 'équipe :",
        "Responsable MAGILLAN",
    ):
        assert label in html

    assert MAGILLAN_LOGO_DATA_URI in html
    assert "DEM-001" in html
    assert "CENTRAL CASA" in html
    assert "Client test" in html
    assert "33.573100, -7.589800" in html
    assert "125" in html
    assert "Observation terrain" in html


def test_magillan_report_does_not_guess_unsupported_ftth_fields():
    job = SimpleNamespace(
        job_number="DEM-002",
        nro_raw="NRO-1",
        customer_name="Client",
        service_address="Adresse",
        latitude=None,
        longitude=None,
        splitter_raw="SPL-5",
        splitter_port_raw=8,
        pbo_raw="PBO-42",
        service_city="CASABLANCA",
        cable_length_m=None,
        coordinator_comments=None,
        notes=None,
        description=None,
    )

    html = _report_page(job)

    # The current model has no authoritative PCO / BR AFFECTÉE mapping.
    assert "PBO-42" not in html
    assert ">8<" not in html
    assert "SPL-5" in html
