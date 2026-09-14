"""Single-intervention MAGILLAN PDF: operational report then real photo pages."""

from __future__ import annotations

import base64
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any, Iterable

HTML = None

from backend.services.magillan_logo_data import MAGILLAN_LOGO_DATA_URI


def _html_renderer():
    global HTML
    if HTML is not None:
        return HTML
    try:
        from weasyprint import HTML as renderer
    except (ImportError, OSError) as exc:  # pragma: no cover - host dependency
        raise RuntimeError(
            "Le moteur PDF est indisponible. Utilisez l'image Docker GoVector."
        ) from exc
    HTML = renderer
    return renderer


PHOTO_LABELS = {
    "cable_departure": "Départ câble", "cable_start": "Départ câble",
    "cable_arrival": "Arrivée câble", "cable_end": "Arrivée câble",
    "joint_before": "Joint avant", "joint_after": "Joint après",
    "pco_during": "PCO en cours", "pco_after": "PCO après",
    "pco_label": "Étiquetage PCO", "pto": "PTO", "ont": "ONT",
    "ont_signal": "ONT + signal", "gpon_sn": "SN ONT", "sn_ont": "SN ONT",
    "ont_serial": "SN ONT", "pco_progress": "PCO en cours",
    "splitter_before": "Splitter avant", "splitter_after": "Splitter après",
    "before": "Avant intervention", "during": "Pendant intervention",
    "after": "Après intervention", "incident": "Incident", "other": "Photo terrain",
}

STATUS_LABELS = {
    "pending": "En attente",
    "assigned": "Affectée",
    "in_progress": "En cours",
    "completed": "Terminée",
    "cancelled": "Annulée",
    "failed": "Échec",
    "on_hold": "En pause",
    "en_attente_validation": "En attente de validation",
    "field_agent_verified": "Vérifiée terrain",
    "validated": "Validée",
}

REPORT_CSS = """
  @page {
    size: A4 landscape;
    margin: 8mm;
    @bottom-right {
      content: "Page " counter(page) " / " counter(pages);
      color:#6b7280;
      font-size:7.5pt;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:Arial,sans-serif; color:#111827; font-size:8.2pt; }
  .report-page { min-height:188mm; page-break-after:always; position:relative; }
  .report-page:last-child { page-break-after:auto; }
  .magillan-header {
    display:grid;
    grid-template-columns:56mm 1fr 56mm;
    align-items:center;
    border:1.2px solid #111827;
    min-height:24mm;
    margin-bottom:4mm;
  }
  .company { padding:2.5mm 3mm; border-right:1px solid #111827; height:100%; }
  .company img { width:42mm; max-height:10mm; object-fit:contain; display:block; margin-bottom:1mm; }
  .company strong { display:block; font-size:7.5pt; }
  .company small { display:block; margin-top:1mm; font-size:6.8pt; }
  .report-title { text-align:center; font-size:17pt; font-weight:700; letter-spacing:.3px; }
  .generator { border-left:1px solid #111827; padding:3mm; text-align:center; color:#6b7280; height:100%; }
  .generator strong { color:#374151; display:block; font-size:8pt; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  th, td { border:1px solid #111827; padding:2.2mm 2.5mm; vertical-align:middle; overflow-wrap:anywhere; }
  th { background:#f3f4f6; font-size:7.6pt; text-transform:uppercase; text-align:left; }
  .identity th { width:14%; }
  .identity td { width:36%; min-height:8mm; }
  .blank { display:inline-block; min-height:1em; min-width:1em; }
  .section-title {
    margin:4mm 0 0;
    padding:1.5mm 2mm;
    border:1px solid #111827;
    border-bottom:0;
    background:#e5e7eb;
    font-weight:700;
    text-transform:uppercase;
  }
  .cables th, .cables td, .connections th, .connections td { text-align:center; }
  .cables th, .connections th { width:auto; }
  .observation { height:20mm; white-space:pre-wrap; vertical-align:top; }
  .signatures { margin-top:4mm; }
  .signatures td { height:25mm; text-align:center; vertical-align:top; font-weight:700; }
  .report-meta { margin-top:2mm; color:#6b7280; font-size:7pt; text-align:right; }
  .photos-title { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #111827; padding-bottom:2mm; }
  .photos-title h1 { margin:0; font-size:16pt; }
  .photo-grid { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-top:6mm; }
  .photo-card { break-inside:avoid; border:1px solid #9ca3af; padding:3mm; }
  .photo-card h3 { margin:0 0 2mm; font-size:10pt; }
  .photo-card img { width:100%; height:58mm; object-fit:contain; background:#f3f4f6; }
  .photo-card p { margin:2mm 0 0; color:#6b7280; font-size:7.2pt; }
"""


def _raw(value: Any) -> str:
    if value is None:
        return ""
    value = getattr(value, "value", value)
    return str(value).strip()


def _display(value: Any, suffix: str = "") -> str:
    raw = _raw(value)
    return escape(f"{raw}{suffix}") if raw else '<span class="blank">&nbsp;</span>'


def _parse_datetime_like(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    raw = _raw(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _date(value: Any, *, with_time: bool = True) -> str:
    parsed = _parse_datetime_like(value)
    if parsed is None:
        return _display(None)
    if with_time:
        return parsed.strftime("%d/%m/%Y à %H:%M")
    return parsed.strftime("%d/%m/%Y")


def _status(value: Any) -> str:
    raw = _raw(value)
    if not raw:
        return _display(None)
    return escape(STATUS_LABELS.get(raw.casefold(), raw.replace("_", " ").capitalize()))


def _safe_path(root: Path, storage_key: Any) -> Path | None:
    if not storage_key:
        return None
    resolved_root = root.resolve()
    candidate = (resolved_root / str(storage_key)).resolve()
    if candidate != resolved_root and resolved_root not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None


def _photo_data_uri(item: Any, media_root: Path) -> str | None:
    path = _safe_path(media_root, getattr(item, "storage_key", None))
    mime = _raw(getattr(item, "mime_type", None)).lower()
    if path is None or not mime.startswith("image/"):
        return None
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def _latest_payload(actions: Iterable[Any], action_type: str) -> dict:
    candidates = [a for a in actions if getattr(a, "action_type", None) == action_type]
    if not candidates:
        return {}

    def key(action: Any) -> float:
        value = getattr(action, "occurred_at", None)
        return value.timestamp() if isinstance(value, datetime) else float("-inf")

    latest = max(candidates, key=key)
    return latest.payload if isinstance(getattr(latest, "payload", None), dict) else {}


def _row(label: str, value: Any, label2: str | None = None, value2: Any = None, *, raw_html: bool = False) -> str:
    rendered = value if raw_html else _display(value)
    second = f"<th>{escape(label2)}</th><td>{_display(value2)}</td>" if label2 else ""
    span = "" if label2 else ' colspan="3"'
    return f"<tr><th>{escape(label)}</th><td{span}>{rendered}</td>{second}</tr>"


def _mode_quantities(item: Any) -> tuple[Any, Any, Any]:
    quantity = getattr(item, "quantity_m", None)
    mode = _raw(getattr(item, "installation_mode", None)).upper()
    if mode in {"SP", "CONDUITE", "SOUTERRAIN"}:
        return quantity, None, None
    if mode in {"FSD", "FACADE", "FAÇADE"}:
        return None, quantity, None
    if mode in {"TR", "AERIEN", "AÉRIEN"}:
        return None, None, quantity
    return None, None, None


def render_intervention_report_sections(
    *, job: Any, actions: Iterable[Any], media: Iterable[Any], visits: Iterable[Any],
    cable_consumptions: Iterable[Any], technician_name: str | None,
    client_organization_name: str | None, media_root: Path,
) -> str:
    operational = getattr(job, "operational_data", None) or {}
    action_items = list(actions)
    media_items = list(media)
    visit_items = list(visits)
    measurement = _latest_payload(action_items, "field_measurement")
    network = _latest_payload(action_items, "network_reference")
    comment = _latest_payload(action_items, "intervention_comment")
    active_visit = visit_items[-1] if visit_items else None

    gps = operational.get("gps_pco") or operational.get("gps_derivation") or operational.get("gps_splitter")
    if not gps and getattr(job, "latitude", None) is not None and getattr(job, "longitude", None) is not None:
        gps = f"{job.latitude:.6f}, {job.longitude:.6f}"

    observation = (
        operational.get("observation")
        or operational.get("remarque")
        or getattr(job, "coordinator_comments", None)
        or getattr(job, "notes", None)
        or comment.get("value")
        or comment.get("comment")
    )
    signal = operational.get("signal") or measurement.get("value") or getattr(job, "optical_power_dbm", None)
    sn = operational.get("sn") or network.get("sn") or getattr(job, "ont_serial", None)
    central = getattr(job, "nro_raw", None) or getattr(job, "sector_raw", None)
    splitter = operational.get("splitter_msan") or getattr(job, "splitter_raw", None)
    pco = operational.get("pco") or getattr(job, "pbo_raw", None)
    localite = getattr(job, "service_city", None)

    cable_rows: list[str] = []
    for item in cable_consumptions:
        conduite, facade, aerien = _mode_quantities(item)
        cable_rows.append(
            "<tr>"
            f"<td>{_display(getattr(item, 'cable_type', None))}</td>"
            f"<td>{_display(getattr(item, 'cable_code', None))}</td>"
            f"<td>{_display(getattr(item, 'start_mark_m', None), ' m')}</td>"
            f"<td>{_display(getattr(item, 'end_mark_m', None), ' m')}</td>"
            f"<td>{_display(conduite, ' m')}</td>"
            f"<td>{_display(facade, ' m')}</td>"
            f"<td>{_display(aerien, ' m')}</td>"
            "</tr>"
        )
    if not cable_rows and any(operational.get(key) is not None for key in (
        "cable_type", "cable_code", "cable_depart_m", "cable_arrive_m",
        "pose_sp_m", "pose_fsd_m", "pose_tr_m",
    )):
        cable_rows.append(
            "<tr>"
            f"<td>{_display(operational.get('cable_type'))}</td>"
            f"<td>{_display(operational.get('cable_code'))}</td>"
            f"<td>{_display(operational.get('cable_depart_m'), ' m')}</td>"
            f"<td>{_display(operational.get('cable_arrive_m'), ' m')}</td>"
            f"<td>{_display(operational.get('pose_sp_m'), ' m')}</td>"
            f"<td>{_display(operational.get('pose_fsd_m'), ' m')}</td>"
            f"<td>{_display(operational.get('pose_tr_m'), ' m')}</td>"
            "</tr>"
        )
    if not cable_rows:
        cable_rows.append('<tr><td colspan="7"><span class="blank">&nbsp;</span></td></tr>')

    photos: list[str] = []
    for item in media_items:
        if not _raw(getattr(item, "mime_type", None)).lower().startswith("image/"):
            continue
        uri = _photo_data_uri(item, media_root)
        if uri is None:
            continue
        metadata = getattr(item, "meta_data", None) or {}
        code = _raw(metadata.get("label") or metadata.get("evidence_role") or "other")
        label = PHOTO_LABELS.get(code, code.replace("_", " ").strip().capitalize() or "Photo terrain")
        captured = metadata.get("captured_at") or getattr(item, "created_at", None)
        photo_gps = ""
        if metadata.get("latitude") is not None and metadata.get("longitude") is not None:
            photo_gps = f"GPS {metadata['latitude']}, {metadata['longitude']}"
        captured_text = _date(captured) if _parse_datetime_like(captured) else _display(captured)
        photos.append(
            f'<article class="photo-card"><h3>{escape(label)}</h3>'
            f'<img src="{uri}" alt="{escape(label)}" />'
            f'<p>{captured_text}{(" · " + escape(photo_gps)) if photo_gps else ""}</p></article>'
        )

    photo_groups = [photos[index:index + 4] for index in range(0, len(photos), 4)]
    photo_pages = "".join(
        f'<section class="report-page"><div class="photos-title"><h1>Photos terrain</h1>'
        f'<p>Demande {_display(getattr(job, "job_number", None))}</p></div>'
        f'<div class="photo-grid">{"".join(group)}</div></section>'
        for group in photo_groups
    )

    visit_times = None
    if active_visit:
        started = _date(getattr(active_visit, "started_at", None))
        ended = _date(getattr(active_visit, "ended_at", None))
        if _raw(getattr(active_visit, "started_at", None)) or _raw(getattr(active_visit, "ended_at", None)):
            visit_times = f"{started} → {ended}"

    connection_pco = network.get("pco") or pco
    connection_joint = network.get("joint") or operational.get("joint")
    connection_splitter = network.get("splitter") or splitter
    connection_tiroir = network.get("tiroir") or operational.get("tiroir")
    connection_prise = (
        network.get("prise")
        or operational.get("prise")
        or operational.get("pto")
        or getattr(job, "pto_raw", None)
    )

    status_html = _status(getattr(job, "status", None))
    date_html = _date(getattr(job, "scheduled_date", None))
    action_date_html = _date(operational.get("date_action"))

    return f"""
      <section class="report-page">
        <header class="magillan-header">
          <div class="company">
            <img src="{MAGILLAN_LOGO_DATA_URI}" alt="MAGILLAN">
            <strong>SOCIETE MAGILLAN D'EQUIPEMENT ET TRAVAUX DIVERS</strong>
            <small>TEL: 0522214983 &nbsp; FAX : 0522871517</small>
          </div>
          <div class="report-title">RAPPORT JOURNALIER</div>
          <div class="generator"><strong>MAGILLAN</strong>Généré par GoVector</div>
        </header>

        <table class="identity">
          {_row('CENTRAL', central, 'N° DEMANDE', getattr(job, 'job_number', None))}
          {_row('N° RAPPORT', operational.get('report_number'), 'DATE', date_html, raw_html=True)}
          {_row('CLIENT', getattr(job, 'customer_name', None), 'LOCALITÉ', localite)}
          {_row('ADRESSE', getattr(job, 'service_address', None), 'GPS', gps)}
          {_row('SPLITTER', splitter, 'PCO', pco)}
          {_row('TECHNICIEN', technician_name or operational.get('source_technician_name'), 'STATUT', status_html, raw_html=True)}
          {_row('DATE D’ACTION', action_date_html, 'HORAIRES TERRAIN', visit_times, raw_html=True)}
        </table>

        <div class="section-title">POSE CÂBLE</div>
        <table class="cables">
          <thead><tr><th>TYPE</th><th>CODE</th><th>DÉPART</th><th>ARRIVÉE</th><th>CONDUITE</th><th>FAÇADE</th><th>AÉRIEN</th></tr></thead>
          <tbody>{''.join(cable_rows)}</tbody>
        </table>

        <div class="section-title">RACCORDEMENT</div>
        <table class="connections">
          <thead><tr><th>PCO</th><th>JOINT</th><th>SPLITTER</th><th>TIROIR</th><th>PRISE</th></tr></thead>
          <tbody><tr>
            <td>{_display(connection_pco)}</td>
            <td>{_display(connection_joint)}</td>
            <td>{_display(connection_splitter)}</td>
            <td>{_display(connection_tiroir)}</td>
            <td>{_display(connection_prise)}</td>
          </tr></tbody>
        </table>

        <div class="section-title">OBSERVATION</div>
        <table><tr><td class="observation">{_display(observation)}</td></tr></table>

        <table class="signatures"><tr>
          <td>REPRÉSENTANT DE LA SOCIÉTÉ</td>
          <td>Surveillant CMO/CHEF DE SECTEUR</td>
        </tr></table>
        <div class="report-meta">{_display(client_organization_name)} · {_display(signal, ' dBm') if _raw(signal) else ''} {_display(sn) if _raw(sn) else ''}</div>
      </section>{photo_pages}
    """


def render_report_document(sections: str) -> str:
    return (
        '<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>'
        + REPORT_CSS
        + "</style></head><body>"
        + sections
        + "</body></html>"
    )


def render_intervention_report_html(**kwargs) -> str:
    return render_report_document(render_intervention_report_sections(**kwargs))


def build_intervention_report_pdf(**kwargs) -> bytes:
    return build_report_pdf_from_sections(render_intervention_report_sections(**kwargs))


def build_report_pdf_from_sections(sections: str) -> bytes:
    renderer = _html_renderer()
    return renderer(string=render_report_document(sections)).write_pdf()
