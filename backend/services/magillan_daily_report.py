"""Render the user-supplied Magillan RAPPORT JOURNALIER as a genuine PDF.

The workbook ``RAPPORT JOURNALIER(1).xlsx`` is the terminology and layout
source of truth. Missing business data stays blank instead of being inferred
from nearby FTTH concepts.
"""

from __future__ import annotations

from html import escape
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

HTML = None

from backend.services.export_service import FieldOptExportService
from backend.services.magillan_logo_data import MAGILLAN_LOGO_DATA_URI


def _html_renderer():
    global HTML
    if HTML is not None:
        return HTML
    try:
        from weasyprint import HTML as renderer
    except (ImportError, OSError) as exc:  # pragma: no cover - host dependency
        raise RuntimeError(
            "Le moteur PDF Magillan est indisponible. "
            "Installez les bibliothèques Pango/Harfbuzz ou utilisez l'image Docker."
        ) from exc
    HTML = renderer
    return renderer


def _text(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        value = value.value
    return escape(str(value).strip())


def _gps(latitude: Any, longitude: Any) -> str:
    if latitude is None or longitude is None:
        return ""
    try:
        return f"{float(latitude):.6f}, {float(longitude):.6f}"
    except (TypeError, ValueError):
        return ""


def _observation(job: Any) -> str:
    operational = getattr(job, "operational_data", None) or {}
    return _text(
        operational.get("observation")
        or operational.get("remarque")
        or getattr(job, "coordinator_comments", None)
        or getattr(job, "notes", None)
        or getattr(job, "description", None)
    )


def _report_page(job: Any) -> str:
    """Return one page matching the supplied Magillan workbook."""

    operational = getattr(job, "operational_data", None) or {}
    # Values supported directly by the current Job model or preserved import.
    request_number = _text(getattr(job, "job_number", None))
    central = _text(getattr(job, "nro_raw", None))
    client = _text(getattr(job, "customer_name", None))
    address = _text(getattr(job, "service_address", None))
    intervention_gps = _gps(
        getattr(job, "latitude", None),
        getattr(job, "longitude", None),
    )
    splitter_number = _text(operational.get("splitter_msan") or getattr(job, "splitter_raw", None))
    locality = _text(getattr(job, "service_city", None))
    observation = _observation(job)

    report_number = _text(operational.get("report_number"))
    pco = _text(operational.get("pco"))
    cable_type = _text(operational.get("cable_type"))
    cable_code = _text(operational.get("cable_code"))
    cable_departure = _text(operational.get("cable_depart_m"))
    cable_arrival = _text(operational.get("cable_arrive_m"))
    conduit = _text(operational.get("pose_sp_m"))
    facade = _text(operational.get("pose_fsd_m"))
    aerial = _text(operational.get("pose_tr_m"))
    raccord_pco = _text(operational.get("raccord_pco"))
    joint = ""
    raccord_splitter = _text(operational.get("raccord_splitter"))
    drawer = _text(operational.get("tiroir"))
    outlet = _text(operational.get("prise"))

    first_work_row = "".join(
        f"<td>{value}</td>"
        for value in (
            cable_type,
            cable_code,
            cable_departure,
            cable_arrival,
            conduit,
            facade,
            aerial,
            raccord_pco,
            joint,
            raccord_splitter,
            drawer,
            outlet,
        )
    )
    empty_work_row = "<tr class=\"work-row\">" + "<td></td>" * 12 + "</tr>"

    return f"""
    <section class="report-page">
      <header class="report-header">
        <img src="{MAGILLAN_LOGO_DATA_URI}" alt="Magillan" />
        <h1>RAPPORT JOURNALIER</h1>
      </header>

      <div class="top-grid">
        <table class="request-table">
          <tr><th>N° DEMANDE:</th><td>{request_number}</td></tr>
          <tr><th>N° RAPPORT</th><td>{report_number}</td></tr>
        </table>

        <table class="info-table">
          <tr><th>CENTRAL</th><td colspan="3">{central}</td></tr>
          <tr><th>CLIENT</th><td colspan="3">{client}</td></tr>
          <tr class="address-row"><th>ADRESSE</th><td colspan="3">{address}</td></tr>
          <tr class="gps-row"><th>GPS</th><td colspan="3">{intervention_gps}</td></tr>
          <tr><th>SPLITTER</th><td colspan="3">{splitter_number}</td></tr>
          <tr>
            <th>PCO</th><td>{pco}</td><th>LOCALITE</th><td>{locality}</td>
          </tr>
        </table>
      </div>

      <table class="work-grid">
        <tr class="section-head group-head">
          <th colspan="7">POSE CABLE</th>
          <th colspan="5">RACCORDEMENT</th>
        </tr>
        <tr class="section-head columns-head">
          <th>TYPE</th><th>CODE</th><th>DEPART</th><th>ARRIVE</th>
          <th>CONDUITE</th><th>FACADE</th><th>AERIEN</th>
          <th>PCO</th><th>JOINT</th><th>SPLITTER</th><th>TIROIR</th><th>PRISE</th>
        </tr>
        <tr class="work-row">{first_work_row}</tr>
        {empty_work_row}
        {empty_work_row}
        {empty_work_row}
        {empty_work_row}
      </table>

      <table class="observation-table">
        <tr><th>OBSERVATION</th><td>{observation}</td></tr>
      </table>

      <table class="signature-grid">
        <tr class="signature-labels">
          <th>REPRESENTANT DE LA SOCIETE</th>
          <th>Surveillant CMO/CHEF DE SECTEUR</th>
        </tr>
        <tr class="signature-space"><td></td><td></td></tr>
      </table>
    </section>
    """


async def export_magillan_daily_report(
    db: AsyncSession,
    filters: dict | None = None,
) -> bytes:
    """Return one Magillan template page per intervention in the scope."""

    jobs = await FieldOptExportService.get_filtered_jobs(db, filters or {})

    if jobs:
        pages = "".join(_report_page(job) for job in jobs)
    else:
        class EmptyJob:
            pass

        pages = _report_page(EmptyJob())

    html = f"""
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <style>
          @page {{ size: A4 landscape; margin: 7mm; }}
          * {{ box-sizing: border-box; }}
          body {{ margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 8px; }}
          .report-page {{ height: 196mm; break-after: page; page-break-after: always; overflow: hidden; }}
          .report-page:last-child {{ break-after: auto; page-break-after: auto; }}
          .report-header {{ height: 22mm; display: grid; grid-template-columns: 72mm 1fr 72mm; align-items: center; }}
          .report-header img {{ width: 62mm; max-height: 21mm; object-fit: contain; object-position: left center; }}
          h1 {{ grid-column: 2; margin: 0; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 17px; }}
          table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
          th, td {{ border: .35mm solid #111; padding: 1mm 1.4mm; vertical-align: middle; overflow-wrap: anywhere; }}
          th {{ font-weight: 700; text-align: center; }}
          .top-grid {{ display: grid; grid-template-columns: 38% 60%; column-gap: 2%; height: 45mm; margin-top: 1mm; }}
          .request-table {{ align-self: start; margin-top: 10mm; height: 15mm; }}
          .request-table th {{ width: 31%; text-align: left; }}
          .request-table td {{ width: 69%; }}
          .info-table {{ height: 45mm; }}
          .info-table th {{ width: 31%; }}
          .info-table td {{ height: 6mm; }}
          .info-table .address-row td {{ height: 9mm; }}
          .info-table .gps-row td {{ height: 9mm; }}
          .info-table tr:last-child th:nth-child(3) {{ width: 19%; }}
          .work-grid {{ height: 68mm; margin-top: 2mm; font-size: 7px; }}
          .section-head th {{ background: #d9d9d9; }}
          .group-head th {{ height: 6mm; font-size: 8px; }}
          .columns-head th {{ height: 7mm; padding: .7mm .5mm; }}
          .work-row td {{ height: 11mm; padding: 1mm .6mm; }}
          .work-grid th:nth-child(1) {{ width: 11.8%; }}
          .work-grid th:nth-child(2), .work-grid th:nth-child(3), .work-grid th:nth-child(4) {{ width: 8.6%; }}
          .work-grid th:nth-child(5), .work-grid th:nth-child(6), .work-grid th:nth-child(7) {{ width: 8.6%; }}
          .work-grid th:nth-child(8) {{ width: 6%; }}
          .work-grid th:nth-child(9) {{ width: 8%; }}
          .work-grid th:nth-child(10) {{ width: 9.2%; }}
          .work-grid th:nth-child(11), .work-grid th:nth-child(12) {{ width: 7%; }}
          .observation-table {{ height: 14mm; margin-top: 2mm; }}
          .observation-table th {{ width: 29%; font-size: 9px; }}
          .observation-table td {{ white-space: pre-wrap; }}
          .signature-grid {{ height: 34mm; margin-top: 3mm; }}
          .signature-labels th {{ border: 0; height: 7mm; padding: 0 1mm; }}
          .signature-space td {{ height: 27mm; }}
          .signature-space td:first-child {{ border-right-width: .5mm; }}
        </style>
      </head>
      <body>{pages}</body>
    </html>
    """

    renderer = _html_renderer()
    return renderer(string=html).write_pdf()
