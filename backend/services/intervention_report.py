"""Single-intervention Magillan PDF: operational page, then labelled photos."""

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


REPORT_CSS = """
  @page { size: A4 landscape; margin: 10mm; @bottom-right { content: "Page " counter(page) " / " counter(pages); color:#64748b; font-size:8pt; } }
  * { box-sizing:border-box; } body { margin:0; font-family:Arial,sans-serif; color:#183044; font-size:8.5pt; }
  .report-page { min-height:185mm; page-break-after:always; } .report-page:last-child { page-break-after:auto; }
  header { display:flex; align-items:center; gap:18px; border-bottom:3px solid #087f8c; padding-bottom:7px; margin-bottom:8px; }
  header img { width:46mm; max-height:16mm; object-fit:contain; } h1 { margin:0; font-size:19pt; } header p { margin:2px 0 0; color:#64748b; }
  h2 { margin:8px 0 5px; font-size:11pt; color:#087f8c; } table { width:100%; border-collapse:collapse; table-layout:fixed; }
  th,td { border:1px solid #cbd5e1; padding:4px 6px; vertical-align:top; overflow-wrap:anywhere; } th { background:#edf7f7; text-align:left; width:15%; }
  .identity td { width:35%; } .cables th { background:#087f8c; color:white; width:auto; text-align:center; } .cables td { text-align:center; }
  .missing,.empty { color:#94a3b8; font-style:italic; } .notes { min-height:18mm; white-space:pre-wrap; }
  .photos-title { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #087f8c; }
  .photo-grid { display:grid; grid-template-columns:1fr 1fr; gap:7mm; margin-top:7mm; } .photo-card { break-inside:avoid; border:1px solid #cbd5e1; padding:4mm; border-radius:3mm; }
  .photo-card h3 { margin:0 0 3mm; color:#087f8c; font-size:11pt; } .photo-card img,.photo-missing { width:100%; height:58mm; object-fit:contain; background:#f1f5f9; }
  .photo-card p { margin:2mm 0 0; color:#64748b; font-size:7.5pt; } .no-photos { padding:25mm; text-align:center; color:#64748b; }
"""


def _raw(value: Any) -> str:
    if value is None:
        return ""
    value = getattr(value, "value", value)
    return str(value).strip()


def _text(value: Any) -> str:
    return escape(_raw(value))


def _display(value: Any, suffix: str = "") -> str:
    raw = _raw(value)
    return escape(f"{raw}{suffix}") if raw else '<span class="missing">Non renseigné</span>'


def _date(value: Any, *, time: bool = False) -> str:
    if not isinstance(value, datetime):
        return _display(None)
    return value.strftime("%d/%m/%Y %H:%M" if time else "%d/%m/%Y")


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


def _row(label: str, value: Any, label2: str | None = None, value2: Any = None) -> str:
    second = f"<th>{escape(label2)}</th><td>{_display(value2)}</td>" if label2 else ""
    span = "" if label2 else ' colspan="3"'
    return f"<tr><th>{escape(label)}</th><td{span}>{_display(value)}</td>{second}</tr>"


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
    observation = operational.get("observation") or operational.get("remarque") or getattr(job, "coordinator_comments", None) or getattr(job, "notes", None) or comment.get("value") or comment.get("comment")
    signal = operational.get("signal") or measurement.get("value") or getattr(job, "optical_power_dbm", None)
    sn = operational.get("sn") or network.get("sn") or getattr(job, "ont_serial", None)

    cable_rows = []
    for item in cable_consumptions:
        cable_rows.append(
            "<tr>"
            f"<td>{_display(item.cable_type)}</td><td>{_display(item.cable_code)}</td>"
            f"<td>{_display(item.start_mark_m, ' m')}</td><td>{_display(item.end_mark_m, ' m')}</td>"
            f"<td>{_display(item.quantity_m, ' m')}</td><td>{_display(item.installation_mode)}</td>"
            f"<td>{_display(getattr(item, 'continuity_justification', None))}</td></tr>"
        )
    if not cable_rows and operational.get("cable_code"):
        cable_rows.append(
            "<tr>" + "".join([
                f"<td>{_display(operational.get('cable_type'))}</td>",
                f"<td>{_display(operational.get('cable_code'))}</td>",
                f"<td>{_display(operational.get('cable_depart_m'), ' m')}</td>",
                f"<td>{_display(operational.get('cable_arrive_m'), ' m')}</td>",
                f"<td>{_display(operational.get('cable_length_m'), ' m')}</td>",
                f"<td>{_display(None)}</td><td>{_display(None)}</td>",
            ]) + "</tr>"
        )
    if not cable_rows:
        cable_rows.append('<tr><td colspan="7" class="empty">Aucune consommation câble enregistrée</td></tr>')

    photos = []
    for item in media_items:
        if not _raw(getattr(item, "mime_type", None)).lower().startswith("image/"):
            continue
        metadata = getattr(item, "meta_data", None) or {}
        code = _raw(metadata.get("label") or metadata.get("evidence_role") or "other")
        label = PHOTO_LABELS.get(code, code.replace("_", " ").strip().capitalize() or "Photo terrain")
        uri = _photo_data_uri(item, media_root)
        visual = f'<img src="{uri}" alt="{escape(label)}" />' if uri else '<div class="photo-missing">Aperçu indisponible</div>'
        captured = metadata.get("captured_at") or getattr(item, "created_at", None)
        photo_gps = ""
        if metadata.get("latitude") is not None and metadata.get("longitude") is not None:
            photo_gps = f"GPS {metadata['latitude']}, {metadata['longitude']}"
        photos.append(
            f'<article class="photo-card"><h3>{escape(label)}</h3>{visual}'
            f'<p>{_display(captured)}{(" · " + escape(photo_gps)) if photo_gps else ""}</p></article>'
        )
    photo_groups = [photos[index:index + 4] for index in range(0, len(photos), 4)]
    if not photo_groups:
        photo_groups = [[
            '<p class="no-photos">Aucune photo synchronisée pour cette intervention.</p>'
        ]]
    photo_pages = "".join(
        f'<section class="report-page"><div class="photos-title"><h1>Photos de l’intervention</h1>'
        f'<p>{_display(getattr(job, "job_number", None))}</p></div>'
        f'<div class="photo-grid">{"".join(group)}</div></section>'
        for group in photo_groups
    )

    return f"""
      <section class="report-page"><header><img src="{MAGILLAN_LOGO_DATA_URI}" alt="Magillan"><div><h1>Rapport complet d’intervention</h1><p>GoVector · données réelles enregistrées</p></div></header>
      <table class="identity">
        {_row('Commande / demande', getattr(job, 'job_number', None), 'Rapport', operational.get('report_number'))}
        {_row('Client / site', getattr(job, 'customer_name', None), 'Entreprise', client_organization_name)}
        {_row('Adresse', getattr(job, 'service_address', None), 'Technicien', technician_name)}
        {_row('Date planifiée', getattr(job, 'scheduled_date', None), 'Date action', operational.get('date_action'))}
        {_row('Horaires terrain', f"{_raw(getattr(active_visit, 'started_at', None))} → {_raw(getattr(active_visit, 'ended_at', None))}" if active_visit else None, 'Statut', getattr(job, 'status', None))}
        {_row('Secteur / central', f"{_raw(getattr(job, 'sector_raw', None))} / {_raw(getattr(job, 'nro_raw', None))}", 'Activité', getattr(job, 'job_type', None))}
        {_row('Splitter / MSAN', operational.get('splitter_msan') or getattr(job, 'splitter_raw', None), 'PCO / localité', f"{_raw(operational.get('pco'))} / {_raw(getattr(job, 'service_city', None))}")}
        {_row('Position PCO', operational.get('position_pco'), 'GPS', gps)}
      </table>
      <h2>Pose câble</h2><table class="cables"><thead><tr><th>Type</th><th>CODE</th><th>Départ</th><th>Arrivée</th><th>Métrage posé</th><th>Mode</th><th>Justification</th></tr></thead><tbody>{''.join(cable_rows)}</tbody></table>
      <h2>Raccordement et mesures</h2><table class="identity">
        {_row('CB (câble branchement)', operational.get('cb'), 'SN', sn)}
        {_row('Signal / mesure', signal, 'Raccordement', network.get('connection') or operational.get('raccordement'))}
        {_row('Validation', getattr(job, 'validation_status', None), 'Signature', 'Présente' if getattr(job, 'client_signature', None) else None)}
        <tr><th>Observations / remarques</th><td colspan="3" class="notes">{_display(observation)}</td></tr>
      </table></section>{photo_pages}
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
