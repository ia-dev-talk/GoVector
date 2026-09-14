from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from backend.services.intervention_report import render_intervention_report_html


def _job():
    return SimpleNamespace(
        id=1, job_number="CM-4475", customer_name="Client réel",
        service_address="Adresse réelle", service_city="Casablanca",
        scheduled_date=datetime(2026, 9, 12, tzinfo=timezone.utc),
        status="completed", job_type="INSTALLATION", sector_raw="ZENATA",
        nro_raw="NRO-1", splitter_raw=None, latitude=None, longitude=None,
        operational_data={"pco": "PCO-1", "splitter_msan": "MSAN-1", "sn": "ONT-1"},
        optical_power_dbm=-18.5, validation_status="validated", client_signature=None,
        coordinator_comments="RAS", notes=None,
    )


def _render(tmp_path: Path, *, media=(), consumptions=()):
    return render_intervention_report_html(
        job=_job(), actions=[], media=media, visits=[],
        cable_consumptions=consumptions, technician_name="Amine Benali",
        client_organization_name="Magillan", media_root=tmp_path,
    )


def test_report_without_photo_keeps_dedicated_photo_page(tmp_path):
    html = _render(tmp_path)
    assert html.count('class="report-page"') == 2
    assert "Aucune photo synchronisée" in html
    assert "Client réel" in html


def test_report_contains_unique_code_consumption_and_mode(tmp_path):
    item = SimpleNamespace(
        cable_type="FO16", cable_code="4475", start_mark_m=2003,
        end_mark_m=1921, quantity_m=82, installation_mode="SP",
        continuity_justification=None,
    )
    html = _render(tmp_path, consumptions=[item])
    assert "4475" in html
    assert "2003 m" in html
    assert "1921 m" in html
    assert "82 m" in html
    assert ">SP<" in html


def test_report_with_one_photo_keeps_its_business_label(tmp_path):
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
    assert "Arrivée câble" in html
    assert html.count('class="photo-card"') == 1
    assert "Aucune photo synchronisée" not in html


def test_report_embeds_all_photos_with_business_labels(tmp_path):
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


def test_report_paginates_more_than_four_photos(tmp_path):
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
    assert html.count("Photos de l’intervention") == 2
