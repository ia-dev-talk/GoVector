"""Render the user-supplied Magillan RAPPORT JOURNALIER as a genuine PDF.

The workbook `RAPPORT JOURNALIER(1).xlsx` is the terminology/layout source of
truth. Missing business data is deliberately rendered blank rather than inferred
from nearby FTTH concepts.
"""

from __future__ import annotations

from html import escape
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from backend.services.export_service import FieldOptExportService
from backend.services.magillan_logo_data import MAGILLAN_LOGO_DATA_URI


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
    return _text(
        getattr(job, "coordinator_comments", None)
        or getattr(job, "notes", None)
        or getattr(job, "description", None)
    )


def _report_page(job: Any) -> str:
    # Directly supported by the current Job model.
    request_number = _text(getattr(job, "job_number", None))
    central = _text(getattr(job, "nro_raw", None))
    client = _text(getattr(job, "customer_name", None))
    address = _text(getattr(job, "service_address", None))
    intervention_gps = _gps(
        getattr(job, "latitude", None),
        getattr(job, "longitude", None),
    )
    splitter_number = _text(getattr(job, "splitter_raw", None))
    locality = _text(getattr(job, "service_city", None))
    distance = _text(getattr(job, "cable_length_m", None))
    observation = _observation(job)

    # Intentionally blank until the product has authoritative, explicit data.
    # We do not silently equate PBO with PCO, splitter port with "BR AFFECTÉE",
    # or intervention type/equipment with cable type.
    report_number = ""
    central_gps = ""
    first_splitter = ""
    affected_branch = ""
    pco = ""
    cable_type = ""
    cable_number = ""
    cable_departure = ""
    cable_arrival = ""
    pose_type = ""
    splitter_in = ""
    splitter_out = ""
    divider_in = ""
    divider_out = ""

    return f"""
    <section class="report-page">
      <header class="report-header">
        <img src="{MAGILLAN_LOGO_DATA_URI}" alt="Magillan" />
        <h1>RAPPORT JOURNALIER</h1>
      </header>

      <table class="identity-table">
        <tr>
          <th>N° de demande :</th><td>{request_number}</td>
          <th>N° de rapport :</th><td>{report_number}</td>
        </tr>
      </table>

      <table class="info-grid">
        <tr class="section-head">
          <th>CENTRAL</th><th>CLIENT</th><th>ADRESSE</th>
        </tr>
        <tr class="value-row">
          <td>{central}</td><td>{client}</td><td>{address}</td>
        </tr>
      </table>

      <table class="network-grid">
        <tr class="section-head">
          <th>G.P.S du Central</th>
          <th>1° SPLITTER</th>
          <th>G.P.S</th>
          <th>N° SPLITTER</th>
          <th>N° BR AFFECTÉE</th>
        </tr>
        <tr class="value-row">
          <td>{central_gps}</td>
          <td>{first_splitter}</td>
          <td>{intervention_gps}</td>
          <td>{splitter_number}</td>
          <td>{affected_branch}</td>
        </tr>
      </table>

      <table class="location-grid">
        <tr class="section-head"><th>PCO</th><th>LOCALITE</th></tr>
        <tr class="value-row"><td>{pco}</td><td>{locality}</td></tr>
      </table>

      <table class="work-grid">
        <tr class="section-head group-head">
          <th colspan="6">POSE CABLE</th>
          <th colspan="4">RACCORDEMENT</th>
          <th rowspan="2">OBSERVATION</th>
        </tr>
        <tr class="section-head columns-head">
          <th>TYPE</th>
          <th>N° CABLE</th>
          <th>DEPART</th>
          <th>ARRIVE</th>
          <th>DISTANCE(m)</th>
          <th>TYPE DE POSE</th>
          <th>ENTRANT SPLITTER</th>
          <th>SORTANT SPLITTER</th>
          <th>ENTRANT DIVISEUR</th>
          <th>SORTANT DIVISEUR</th>
        </tr>
        <tr class="work-row">
          <td>{cable_type}</td>
          <td>{cable_number}</td>
          <td>{cable_departure}</td>
          <td>{cable_arrival}</td>
          <td>{distance}</td>
          <td>{pose_type}</td>
          <td>{splitter_in}</td>
          <td>{splitter_out}</td>
          <td>{divider_in}</td>
          <td>{divider_out}</td>
          <td rowspan="5" class="observation">{observation}</td>
        </tr>
        <tr class="work-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="work-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="work-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr class="work-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      </table>

      <table class="signature-grid">
        <tr class="section-head">
          <th>Signature de technicien :</th>
          <th>Signature de responsable d 'équipe :</th>
          <th>Responsable MAGILLAN</th>
        </tr>
        <tr class="signature-labels">
          <td>Signature :</td><td>Signature :</td><td></td>
        </tr>
        <tr class="signature-space"><td></td><td></td><td></td></tr>
      </table>
    </section>
    """


async def export_magillan_daily_report(
    db: AsyncSession,
    filters: dict | None = None,
) -> bytes:
    """Return one Magillan template page per intervention in the selected scope."""
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
          @page {{ size: A4 landscape; margin: 8mm; }}
          * {{ box-sizing: border-box; }}
          body {{ margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 8.4px; }}
          .report-page {{ page-break-after: always; min-height: 190mm; }}
          .report-page:last-child {{ page-break-after: auto; }}
          .report-header {{ position: relative; height: 28mm; border: 1px solid #111; display: flex; align-items: center; justify-content: center; padding: 2mm 4mm; }}
          .report-header img {{ position: absolute; left: 5mm; top: 3mm; width: 54mm; height: auto; max-height: 21mm; object-fit: contain; }}
          h1 {{ margin: 0; font-size: 19px; letter-spacing: .5px; font-weight: 700; }}
          table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
          th, td {{ border: 1px solid #111; padding: 2.2mm 2mm; vertical-align: middle; overflow-wrap: anywhere; }}
          th {{ font-weight: 700; text-align: center; }}
          .identity-table {{ margin-top: 2mm; }}
          .identity-table th {{ width: 17%; text-align: left; background: #f2f2f2; }}
          .identity-table td {{ width: 33%; height: 8mm; }}
          .info-grid, .network-grid, .location-grid, .work-grid, .signature-grid {{ margin-top: 2mm; }}
          .info-grid th:nth-child(1) {{ width: 22%; }}
          .info-grid th:nth-child(2) {{ width: 27%; }}
          .info-grid th:nth-child(3) {{ width: 51%; }}
          .network-grid th:nth-child(1) {{ width: 20%; }}
          .network-grid th:nth-child(2) {{ width: 18%; }}
          .network-grid th:nth-child(3) {{ width: 22%; }}
          .network-grid th:nth-child(4) {{ width: 18%; }}
          .network-grid th:nth-child(5) {{ width: 22%; }}
          .location-grid th:nth-child(1) {{ width: 35%; }}
          .location-grid th:nth-child(2) {{ width: 65%; }}
          .section-head th {{ background: #e7e7e7; }}
          .value-row td {{ height: 9mm; font-size: 9px; }}
          .work-grid {{ font-size: 7.1px; }}
          .work-grid th {{ padding: 1.5mm .8mm; }}
          .work-grid th:nth-child(1) {{ width: 8%; }}
          .work-grid th:nth-child(2) {{ width: 9%; }}
          .work-grid th:nth-child(3), .work-grid th:nth-child(4) {{ width: 8%; }}
          .work-grid th:nth-child(5) {{ width: 8%; }}
          .work-grid th:nth-child(6) {{ width: 11%; }}
          .work-row td {{ height: 8mm; padding: 1.5mm 1mm; }}
          .observation {{ width: 16%; vertical-align: top; white-space: pre-wrap; }}
          .signature-grid th {{ text-align: left; }}
          .signature-labels td {{ height: 8mm; }}
          .signature-space td {{ height: 31mm; vertical-align: top; }}
        </style>
      </head>
      <body>{pages}</body>
    </html>
    """

    return HTML(string=html).write_pdf()
