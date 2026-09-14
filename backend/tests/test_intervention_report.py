from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from backend.services.intervention_report import render_intervention_report_html


def _job(**overrides):
    values = dict(
        id=1,
        job_number="CM-4475",
        customer_name="Client réel",
        service_address="Adresse réelle",
        service_city="Casablanca",
        scheduled_date=datetime(2026, 9, 12, 15, 0, tzinfo=timezone.utc),
        status="completed",
        job_type=None,
        sector_raw="ZENATA",
        nro_raw="NRO-1",
        splitter_raw=None,
        pbo_raw=None,
        pto_raw=None,
        latitude=None,
        longitude=None,
        operational_data={"pco": "PCO-1", "splitter_msan": "MSAN-1", "sn": "ONT-1"},
        optical_power_dbm=-18.5,
        validation_status="validated",
        client_signature=None,
        coordinator_comments="RAS",
        notes=None,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


def _render(tmp_path: Path, *, media=(), consumptions=(), job=None, technician_name="Amine Benali"):
    return render_intervention_report_html(
        job=job or _job(),
        actions=[],
        media=media,
        visits=[],
        cable_consumptions=consumptions,
        technician_name=technician_name,
        client_organization_name="MAGILLAN",
        media_root=tmp_path,
    )


def test_report_without_photo_has_no_empty_photo_page(tmp_path):
    html = _render(tmp_path)

    assert html.count('class="report-page"') == 1
    assert "Photos terrain" not in html
    assert "Aucune photo synchronisée" not in html
    assert "Client réel" in html


def test_report_matches_magillan_daily_form_identity(tmp_path):
    html = _render(tmp_path)

    assert "RAPPORT JOURNALIER" in html
    assert "SOCIETE MAGILLAN D'EQUIPEMENT ET TRAVAUX DIVERS" in html
    assert "TEL: 0522214983" in html
    assert "FAX : 0522871517" in html
    for label in (
        "CENTRAL",
        "N° DEMANDE",
        "N° RAPPORT",
        "CLIENT",
        "ADRESSE",
        "GPS",
        "SPLITTER",
        "PCO",
        "LOCALITÉ",
        "POSE CÂBLE",
        "RACCORDEMENT",
        "OBSERVATION",
        "REPRÉSENTANT DE LA SOCIÉTÉ",
        "Surveillant CMO/CHEF DE SECTEUR",
    ):
        assert label in html
    assert "Généré par GoVector" in html


def test_report_formats_planned_date_and_status_for_humans(tmp_path):
    html = _render(tmp_path)

    assert "12/09/2026 à 15:00" in html
    assert "Terminée" in html
    assert ">completed<" not in html
    assert "2026-09-12T15:00" not in html


def test_report_does_not_invent_type_or_coordinates(tmp_path):
    html = _render(tmp_path, job=_job(job_type=None, latitude=None, longitude=None))

    assert "INSTALLATION" not in html
    assert "33.649915" not in html
    assert "-7.473584" not in html


def test_report_contains_cable_consumption_and_magillan_pose_columns(tmp_path):
    item = SimpleNamespace(
        cable_type="FO16",
        cable_code="4475",
        start_mark_m=2003,
        end_mark_m=1921,
        quantity_m=82,
        installation_mode="SP",
        continuity_justification=None,
    )
    html = _render(tmp_path, consumptions=[item])

    assert "4475" in html
    assert "2003 m" in html
    assert "1921 m" in html
    assert "82 m" in html
    assert "CONDUITE" in html
    assert "FAÇADE" in html
    assert "AÉRIEN" in html


def test_report_with_one_real_photo_adds_one_photo_page(tmp_path):
    (tmp_path / "arrival.jpg").write_bytes(b"real-arrival")
    media = [
        SimpleNamespace(
            storage_key="arrival.jpg",
            mime_type="image/jpeg",
            meta_data={"label": "cable_arrival"},
            created_at="2026-09-12",
            original_filename="arrival.jpg",
        )
    ]
    html = _render(tmp_path, media=media)

    assert html.count('class="report-page"') == 2
    assert "Photos terrain" in html
    assert "Arrivée câble" in html
    assert html.count('class="photo-card"') == 1


def test_report_ignores_missing_photo_file_instead_of_creating_fake_page(tmp_path):
    media = [
        SimpleNamespace(
            storage_key="missing.jpg",
            mime_type="image/jpeg",
            meta_data={"label": "other"},
            created_at="2026-09-12",
        )
    ]

    html = _render(tmp_path, media=media)

    assert html.count('class="report-page"') == 1
    assert "Photos terrain" not in html
    assert "Aperçu indisponible" not in html


def test_report_embeds_all_real_photos_with_business_labels(tmp_path):
    (tmp_path / "one.jpg").write_bytes(b"real-one")
    (tmp_path / "two.jpg").write_bytes(b"real-two")
    media = [
        SimpleNamespace(storage_key="one.jpg", mime_type="image/jpeg", meta_data={"label": "joint_before"}, created_at="2026-09-12", original_filename="one.jpg"),
        SimpleNamespace(storage_key="two.jpg", mime_type="image/jpeg", meta_data={"label": "ont_signal"}, created_at="2026-09-12", original_filename="two.jpg"),
    ]
    html = _render(tmp_path, media=media)

    assert "data:image/jpeg;base64,cmVhbC1vbmU=" in html
    assert "data:image/jpeg;base64,cmVhbC10d28=" in html
    assert "Joint avant" in html
    assert "ONT + signal" in html


def test_report_translates_mobile_pco_and_ont_serial_photo_labels(tmp_path):
    (tmp_path / "pco.jpg").write_bytes(b"pco")
    (tmp_path / "sn.jpg").write_bytes(b"sn")
    media = [
        SimpleNamespace(storage_key="pco.jpg", mime_type="image/jpeg", meta_data={"label": "pco_during"}, created_at="2026-09-12"),
        SimpleNamespace(storage_key="sn.jpg", mime_type="image/jpeg", meta_data={"label": "ont_serial"}, created_at="2026-09-12"),
    ]

    html = _render(tmp_path, media=media)

    assert "PCO en cours" in html
    assert "SN ONT" in html


def test_report_paginates_more_than_four_real_photos(tmp_path):
    media = []
    for index in range(5):
        filename = f"photo-{index}.jpg"
        (tmp_path / filename).write_bytes(f"real-{index}".encode())
        media.append(
            SimpleNamespace(
                storage_key=filename,
                mime_type="image/jpeg",
                meta_data={"label": "other"},
                created_at="2026-09-12",
            )
        )

    html = _render(tmp_path, media=media)

    assert html.count('class="report-page"') == 3
    assert html.count('class="photo-card"') == 5
    assert html.count("Photos terrain") == 2
