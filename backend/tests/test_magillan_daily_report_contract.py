import base64
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
        "N° DEMANDE:",
        "N° RAPPORT",
        "CENTRAL",
        "CLIENT",
        "ADRESSE",
        "GPS",
        "SPLITTER",
        "PCO",
        "LOCALITE",
        "POSE CABLE",
        "RACCORDEMENT",
        "TYPE",
        "CODE",
        "DEPART",
        "ARRIVE",
        "CONDUITE",
        "FACADE",
        "AERIEN",
        "JOINT",
        "TIROIR",
        "PRISE",
        "OBSERVATION",
        "REPRESENTANT DE LA SOCIETE",
        "Surveillant CMO/CHEF DE SECTEUR",
    ):
        assert label in html

    assert MAGILLAN_LOGO_DATA_URI in html
    assert "DEM-001" in html
    assert "CENTRAL CASA" in html
    assert "Client test" in html
    assert "33.573100, -7.589800" in html
    assert "Observation terrain" in html

    # A total length cannot be attributed to one of the three pose columns.
    assert "125" not in html

    encoded_logo = MAGILLAN_LOGO_DATA_URI.split(",", 1)[1]
    logo_bytes = base64.b64decode(encoded_logo, validate=True)
    assert len(logo_bytes) > 20_000
    assert logo_bytes.startswith(b"\xff\xd8")
    assert logo_bytes.endswith(b"\xff\xd9")


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

    # The current model has no authoritative PCO mapping.
    assert "PBO-42" not in html
    assert ">8<" not in html
    assert "SPL-5" in html
