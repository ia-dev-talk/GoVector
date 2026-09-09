"""Small, delivery-safe GoVector PDF renderer.

The legacy export service remains the source of truth for filtering and column
projection. This module owns only the client-visible PDF presentation so the
pilot never leaks historical FieldOpt/BlueVector branding and never returns an
HTML fallback under a .pdf filename.
"""

from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from backend.services.export_service import FieldOptExportService


def _display(value: Any) -> str:
    if value is None:
        return ""
    return escape(str(value))


def _metric(summary: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in summary and summary[key] is not None:
            return summary[key]
    return "—"


async def export_govector_pdf(
    db: AsyncSession,
    columns: list[str],
    filters: dict | None = None,
    include_photos: bool = False,
    include_signatures: bool = False,
) -> bytes:
    """Generate a genuine, self-contained GoVector PDF report."""

    rows = await FieldOptExportService.get_jobs_data(db, filters, columns)
    summary = await FieldOptExportService.get_export_summary(db, filters)

    headers = list(rows[0].keys()) if rows else [
        FieldOptExportService.get_available_columns().get(key, {}).get("label", key)
        for key in columns
    ]

    table_head = "".join(f"<th>{_display(header)}</th>" for header in headers)
    table_rows = []
    for row in rows:
        cells = "".join(f"<td>{_display(row.get(header, ''))}</td>" for header in headers)
        table_rows.append(f"<tr>{cells}</tr>")

    if table_rows:
        table_body = "".join(table_rows)
    else:
        table_body = (
            f'<tr><td class="empty" colspan="{max(len(headers), 1)}">'
            "Aucune intervention dans ce périmètre.</td></tr>"
        )

    evidence_note = ""
    if include_photos:
        evidence_note = (
            '<div class="notice">Les références photo sont incluses dans les données. '
            "Pour embarquer les fichiers originaux, utilisez l’export ZIP avec photos.</div>"
        )
    if include_signatures:
        evidence_note += (
            '<div class="notice">Les informations de signature sont incluses lorsque '
            "le dossier intervention en contient.</div>"
        )

    generated_at = datetime.now().strftime("%d/%m/%Y à %H:%M")
    total = _metric(summary, "total")
    completed = _metric(summary, "completed", "terminees")
    in_progress = _metric(summary, "in_progress", "en_cours")
    failed = _metric(summary, "failed", "echecs")

    html = f"""
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
  @page {{ size: A4 landscape; margin: 13mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    color: #172033;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9px;
  }}
  .brand {{
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 2px solid #2563eb;
  }}
  .mark {{
    width: 34px;
    height: 34px;
    border: 3px solid #172554;
    border-radius: 11px;
    color: #172554;
    font-size: 20px;
    font-weight: 800;
    line-height: 28px;
    text-align: center;
  }}
  .brand-name {{ font-size: 22px; font-weight: 800; letter-spacing: -.4px; }}
  .brand-name .vector {{ color: #2563eb; }}
  .subtitle {{ color: #64748b; margin-top: 2px; }}
  h1 {{ margin: 16px 0 3px; font-size: 18px; color: #172554; }}
  .generated {{ color: #64748b; margin-bottom: 12px; }}
  .kpis {{ display: flex; gap: 8px; margin: 10px 0 14px; }}
  .kpi {{
    min-width: 118px;
    padding: 8px 10px;
    border: 1px solid #dbe3ef;
    border-radius: 7px;
    background: #f8fafc;
  }}
  .kpi span {{ display: block; color: #64748b; font-size: 8px; }}
  .kpi strong {{ display: block; margin-top: 2px; font-size: 15px; color: #172554; }}
  table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  th {{
    padding: 6px 5px;
    background: #172554;
    color: white;
    border: 1px solid #23366c;
    font-size: 7.7px;
    text-align: left;
    overflow-wrap: anywhere;
  }}
  td {{
    padding: 5px;
    border: 1px solid #dbe3ef;
    vertical-align: top;
    overflow-wrap: anywhere;
  }}
  tr:nth-child(even) td {{ background: #f8fafc; }}
  .empty {{ text-align: center; color: #64748b; padding: 16px; }}
  .notice {{
    margin-top: 8px;
    padding: 7px 9px;
    border-left: 3px solid #2563eb;
    background: #eff6ff;
    color: #334155;
  }}
  .footer {{
    margin-top: 12px;
    padding-top: 7px;
    border-top: 1px solid #dbe3ef;
    color: #94a3b8;
    font-size: 7.5px;
  }}
</style>
</head>
<body>
  <div class="brand">
    <div class="mark">G</div>
    <div>
      <div class="brand-name">Go<span class="vector">Vector</span></div>
      <div class="subtitle">ERP · Interventions & Stocks FTTH</div>
    </div>
  </div>

  <h1>Rapport interventions & stocks FTTH</h1>
  <div class="generated">Généré le {generated_at}</div>

  <div class="kpis">
    <div class="kpi"><span>Interventions</span><strong>{_display(total)}</strong></div>
    <div class="kpi"><span>Clôturées</span><strong>{_display(completed)}</strong></div>
    <div class="kpi"><span>En cours</span><strong>{_display(in_progress)}</strong></div>
    <div class="kpi"><span>Échecs</span><strong>{_display(failed)}</strong></div>
  </div>

  <table>
    <thead><tr>{table_head}</tr></thead>
    <tbody>{table_body}</tbody>
  </table>
  {evidence_note}

  <div class="footer">
    GoVector · Document généré depuis le périmètre d’export sélectionné. Les données
    d’audit et preuves originales restent conservées dans le dossier intervention.
  </div>
</body>
</html>
"""

    pdf = HTML(string=html).write_pdf()
    if not pdf.startswith(b"%PDF-"):
        raise RuntimeError("Le moteur GoVector n'a pas produit un PDF valide")
    return pdf
