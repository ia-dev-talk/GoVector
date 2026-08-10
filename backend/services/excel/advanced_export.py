# -*- coding: utf-8 -*-
"""
Export Excel avancé — FieldOpt
Supporte la sélection de feuilles et filtres personnalisés.
Prépare l'architecture pour l'export PDF futur.
"""
import io
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.chart import PieChart, BarChart, LineChart, Reference
from openpyxl.utils import get_column_letter

# ── CHARTE GRAPHIQUE ───────────────────────────────────────────
BLEU_NAVY    = "1F497D"
BLANC       = "FFFFFF"
JAUNE_OR    = "FFC000"
ROUGE_FONCE = "C00000"
VERT_VIF    = "00B050"
GRIS_BORDURE = "D9D9D9"


def _thin_border() -> Border:
    side = Side(style="thin", color=GRIS_BORDURE)
    return Border(left=side, right=side, top=side, bottom=side)


def _header_fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def _header_font(bold: bool = True, color: str = BLANC) -> Font:
    return Font(bold=bold, color=color, name="Calibri", size=10)


def _center_align() -> Alignment:
    return Alignment(horizontal="center", vertical="center", wrap_text=True)


def _left_align() -> Alignment:
    return Alignment(horizontal="left", vertical="center", wrap_text=True)


def _autofit_columns(ws, min_width: int = 12, max_width: int = 45):
    """Ajuste automatiquement la largeur des colonnes."""
    for col in ws.columns:
        max_length = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value:
                try:
                    cell_len = len(str(cell.value))
                    if cell_len > max_length:
                        max_length = cell_len
                except Exception:
                    pass
        adjusted = max(min_width, min(max_width, max_length + 2))
        ws.column_dimensions[col_letter].width = adjusted


def _apply_header_row(ws, row_idx: int, headers: List[str], fill_hex: str = BLEU_NAVY):
    """Applique le style d'en-tête sur une ligne."""
    fill = _header_fill(fill_hex)
    font = _header_font(color=BLANC if fill_hex == BLEU_NAVY else "000000")
    border = _thin_border()
    for col_idx, title in enumerate(headers, start=1):
        cell = ws.cell(row=row_idx, column=col_idx, value=title)
        cell.fill = fill
        cell.font = font
        cell.alignment = _center_align()
        cell.border = border


# ── EXPORT AVANCÉ AVEC OPTIONS ────────────────────────────────────

def generate_advanced_excel_report(
    jobs: List[Dict],
    technicians: List[Dict],
    orienteurs: List[Dict],
    sectors: List[Dict],
    stats: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None,
) -> bytes:
    """
    Génère un fichier Excel avec les feuilles sélectionnées.

    Options possibles:
    - sheets: Liste des feuilles à inclure
    - period, sector_id, orienteur_id, technician_id, job_type, status
    """
    options = options or {}
    sheets_to_include = options.get("sheets", ["dashboard_complet"])

    wb = Workbook()
    default_sheet = wb.active
    wb.remove(default_sheet)

    if "dashboard_complet" in sheets_to_include:
        _build_dashboard_sheet(wb, stats, sectors, orienteurs, technicians, jobs)

    if "interventions" in sheets_to_include:
        _build_interventions_sheet(wb, jobs)

    if "techniciens" in sheets_to_include:
        _build_technicians_sheet(wb, technicians)

    if "orienteurs" in sheets_to_include:
        _build_orienteurs_sheet(wb, orienteurs)

    if "secteurs" in sheets_to_include:
        _build_sectors_sheet(wb, sectors)

    if "kpi" in sheets_to_include:
        _build_kpi_sheet(wb, stats)

    if "performance_equipes" in sheets_to_include:
        _build_team_performance_sheet(wb, orienteurs)

    if "performance_techniciens" in sheets_to_include:
        _build_technician_performance_sheet(wb, technicians)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def _build_dashboard_sheet(wb: Workbook, stats: Dict, sectors: List[Dict], orienteurs: List[Dict], technicians: List[Dict], jobs: List[Dict]):
    """Feuille principale du dashboard avec KPIs et graphiques."""
    ws = wb.create_sheet(title="Dashboard")

    ws.merge_cells("A1:K1")
    titre_cell = ws["A1"]
    titre_cell.value = f"DASHBOARD MAGELLEN — {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    titre_cell.fill = _header_fill(BLEU_NAVY)
    titre_cell.font = Font(bold=True, color=BLANC, name="Calibri", size=12)
    titre_cell.alignment = _center_align()

    row = 3
    kpi_headers = ["KPI", "Valeur", "Unité"]
    _apply_header_row(ws, row, kpi_headers, fill_hex=BLEU_NAVY)
    row += 1

    kpis = [
        ("Total interventions", stats.get("totalJobs", 0), "nb"),
        ("Interventions aujourd'hui", stats.get("jobsToday", 0), "nb"),
        ("Interventions cette semaine", stats.get("jobsWeek", 0), "nb"),
        ("Interventions ce mois", stats.get("jobsMonth", 0), "nb"),
        ("Taux de réussite", f"{stats.get('successRate', 0)}%", "%"),
        ("Taux d'échec", f"{stats.get('failureRate', 0)}%", "%"),
        ("Taux de complétion", f"{stats.get('completionRate', 0)}%", "%"),
        ("Délai moyen", f"{stats.get('avgDelay', 0)}", "min"),
        ("Durée moyenne", f"{stats.get('avgDuration', 0)}", "min"),
        ("Techniciens actifs", stats.get("activeTechs", 0), "nb"),
        ("Techniciens occupés", stats.get("busyTechs", 0), "nb"),
        ("Techniciens inactifs", stats.get("offDutyTechs", 0), "nb"),
        ("Total orienteurs", len(orienteurs), "nb"),
        ("Total secteurs", len(sectors), "nb"),
    ]

    for kpi_name, value, unit in kpis:
        ws.cell(row=row, column=1, value=kpi_name)
        ws.cell(row=row, column=2, value=value)
        ws.cell(row=row, column=3, value=unit)
        for c in range(1, 4):
            ws.cell(row=row, column=c).border = _thin_border()
        row += 1

    _autofit_columns(ws)


def _build_interventions_sheet(wb: Workbook, jobs: List[Dict]):
    """Feuille des interventions."""
    ws = wb.create_sheet(title="Interventions")

    headers = ["ID", "Type", "Statut", "Client", "Adresse", "Priorité", "Technicien", "Date prévue", "Durée (min)"]
    _apply_header_row(ws, 1, headers, fill_hex=BLEU_NAVY)

    for idx, job in enumerate(jobs[:500], start=2):
        ws.cell(row=idx, column=1, value=job.get("id"))
        ws.cell(row=idx, column=2, value=job.get("job_type"))
        ws.cell(row=idx, column=3, value=job.get("status"))
        ws.cell(row=idx, column=4, value=job.get("customer_name"))
        ws.cell(row=idx, column=5, value=job.get("service_address"))
        ws.cell(row=idx, column=6, value=job.get("priority"))
        ws.cell(row=idx, column=7, value=job.get("assigned_technician_name"))
        ws.cell(row=idx, column=8, value=str(job.get("scheduled_date", "")))
        ws.cell(row=idx, column=9, value=job.get("real_duration_minutes", 0))
        for c in range(1, 10):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)


def _build_technicians_sheet(wb: Workbook, technicians: List[Dict]):
    """Feuille des techniciens."""
    ws = wb.create_sheet(title="Techniciens")

    headers = ["ID", "Nom", "Statut", "Téléphone", "Email", "Interventions assignées", "Interventions complétées", "Équipe"]
    _apply_header_row(ws, 1, headers, fill_hex=BLEU_NAVY)

    for idx, tech in enumerate(technicians, start=2):
        ws.cell(row=idx, column=1, value=tech.get("id"))
        ws.cell(row=idx, column=2, value=tech.get("name"))
        ws.cell(row=idx, column=3, value=tech.get("status"))
        ws.cell(row=idx, column=4, value=tech.get("phone"))
        ws.cell(row=idx, column=5, value=tech.get("email"))
        ws.cell(row=idx, column=6, value=tech.get("assigned_jobs", 0))
        ws.cell(row=idx, column=7, value=tech.get("completed_jobs", 0))
        ws.cell(row=idx, column=8, value=tech.get("orienteur_name", "N/A"))
        for c in range(1, 9):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)


def _build_orienteurs_sheet(wb: Workbook, orienteurs: List[Dict]):
    """Feuille des orienteurs."""
    ws = wb.create_sheet(title="Orienteurs")

    headers = ["ID", "Nom", "Email", "Téléphone", "Secteur", "Techniciens", "Statut"]
    _apply_header_row(ws, 1, headers, fill_hex=BLEU_NAVY)

    for idx, o in enumerate(orienteurs, start=2):
        ws.cell(row=idx, column=1, value=o.get("id"))
        ws.cell(row=idx, column=2, value=o.get("name"))
        ws.cell(row=idx, column=3, value=o.get("email"))
        ws.cell(row=idx, column=4, value=o.get("phone"))
        ws.cell(row=idx, column=5, value=o.get("sector_name", "N/A"))
        ws.cell(row=idx, column=6, value=o.get("technician_count", 0))
        ws.cell(row=idx, column=7, value="Actif" if o.get("is_active") else "Inactif")
        for c in range(1, 8):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)


def _build_sectors_sheet(wb: Workbook, sectors: List[Dict]):
    """Feuille des secteurs."""
    ws = wb.create_sheet(title="Secteurs")

    headers = ["ID", "Nom", "Couleur", "Description", "Techniciens", "Orienteurs", "Statut"]
    _apply_header_row(ws, 1, headers, fill_hex=BLEU_NAVY)

    for idx, s in enumerate(sectors, start=2):
        ws.cell(row=idx, column=1, value=s.get("id"))
        ws.cell(row=idx, column=2, value=s.get("name"))
        ws.cell(row=idx, column=3, value=s.get("color"))
        ws.cell(row=idx, column=4, value=s.get("description"))
        ws.cell(row=idx, column=5, value=s.get("tech_count", 0))
        ws.cell(row=idx, column=6, value=s.get("orienteur_count", 0))
        ws.cell(row=idx, column=7, value="Actif" if s.get("is_active") else "Inactif")
        for c in range(1, 8):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)


def _build_kpi_sheet(wb: Workbook, stats: Dict):
    """Feuille des KPIs détaillés."""
    ws = wb.create_sheet(title="KPIs")

    headers = ["KPI", "Valeur", "Date"]
    _apply_header_row(ws, 1, headers, fill_hex=JAUNE_OR)

    kpis = [
        ("Interventions totales", stats.get("totalJobs", 0), datetime.now().strftime("%d/%m/%Y")),
        ("Réussies", stats.get("completedJobs", 0), ""),
        ("En attente", stats.get("pendingJobs", 0), ""),
        ("En cours", stats.get("inProgressJobs", 0), ""),
        ("Annulées", stats.get("cancelledJobs", 0), ""),
        ("Taux complétion", f"{stats.get('completionRate', 0)}%", ""),
    ]

    for idx, (kpi, val, dt) in enumerate(kpis, start=2):
        ws.cell(row=idx, column=1, value=kpi)
        ws.cell(row=idx, column=2, value=val)
        ws.cell(row=idx, column=3, value=dt)
        for c in range(1, 4):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)


def _build_team_performance_sheet(wb: Workbook, orienteurs: List[Dict]):
    """Feuille performance des équipes."""
    ws = wb.create_sheet(title="Performance Équipes")

    headers = ["Orienteur", "Secteur", "Techs", "Jobs aujourd'hui", "Jobs semaine", "Taux complétion"]
    _apply_header_row(ws, 1, headers, fill_hex=BLEU_NAVY)

    for idx, o in enumerate(orienteurs, start=2):
        ws.cell(row=idx, column=1, value=o.get("name"))
        ws.cell(row=idx, column=2, value=o.get("sector_name", "N/A"))
        ws.cell(row=idx, column=3, value=o.get("tech_count", 0))
        ws.cell(row=idx, column=4, value=o.get("jobs_today", 0))
        ws.cell(row=idx, column=5, value=o.get("jobs_week", 0))
        ws.cell(row=idx, column=6, value=f"{o.get('completion_rate', 0)}%")
        for c in range(1, 7):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)


def _build_technician_performance_sheet(wb: Workbook, technicians: List[Dict]):
    """Feuille performance des techniciens."""
    ws = wb.create_sheet(title="Performance Techs")

    headers = ["Nom", "Jobs totaux", "Jobs complétés", "Durée moyenne", "Productivité"]
    _apply_header_row(ws, 1, headers, fill_hex=BLEU_NAVY)

    for idx, t in enumerate(technicians, start=2):
        ws.cell(row=idx, column=1, value=t.get("name"))
        ws.cell(row=idx, column=2, value=t.get("total_jobs", 0))
        ws.cell(row=idx, column=3, value=t.get("completed_jobs", 0))
        ws.cell(row=idx, column=4, value=f"{t.get('avg_duration_minutes', 0)} min")
        ws.cell(row=idx, column=5, value=f"{t.get('productivity', 0)}%")
        for c in range(1, 6):
            ws.cell(row=idx, column=c).border = _thin_border()

    _autofit_columns(ws)