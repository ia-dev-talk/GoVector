"""
Map parsed Excel row values to create_job()-compatible field dicts.
"""
from datetime import date as date_type
from datetime import datetime, time, timedelta, timezone
import math
import re
import unicodedata
from typing import Any, Optional

from backend.database.models import JobPriority, JobStatus, JobType

_PRIORITY_ALIASES = {
    "URGENT": JobPriority.URGENT,
    "URGENCE": JobPriority.URGENT,
    "HAUTE": JobPriority.HAUTE,
    "HIGH": JobPriority.HAUTE,
    "NORMALE": JobPriority.NORMALE,
    "NORMAL": JobPriority.NORMALE,
    "MOYENNE": JobPriority.NORMALE,
    "FAIBLE": JobPriority.FAIBLE,
    "LOW": JobPriority.FAIBLE,
    "BASSE": JobPriority.FAIBLE,
}

_STATUS_ALIASES = {
    "PENDING": JobStatus.PENDING,
    "EN ATTENTE": JobStatus.PENDING,
    "ASSIGNED": JobStatus.ASSIGNED,
    "AFFECTE": JobStatus.ASSIGNED,
    "AFFECTÉ": JobStatus.ASSIGNED,
    "IN_PROGRESS": JobStatus.IN_PROGRESS,
    "EN COURS": JobStatus.IN_PROGRESS,
    "COMPLETED": JobStatus.COMPLETED,
    "TERMINE": JobStatus.COMPLETED,
    "TERMINÉ": JobStatus.COMPLETED,
    "DONE": JobStatus.COMPLETED,
    "CANCELLED": JobStatus.CANCELLED,
    "ANNULE": JobStatus.CANCELLED,
    "ANNULÉ": JobStatus.CANCELLED,
    "FAILED": JobStatus.FAILED,
    "ON_HOLD": JobStatus.ON_HOLD,
    "EN PAUSE": JobStatus.ON_HOLD,
    "BLOCKED": JobStatus.ON_HOLD,
    "BLOQUE": JobStatus.ON_HOLD,
    "BLOQUEE": JobStatus.ON_HOLD,
}

_COLOR_STATUS = {
    "DONE": JobStatus.COMPLETED,
    "FAILED": JobStatus.FAILED,
    "WAITING": JobStatus.ON_HOLD,
}

_JOB_TYPE_ALIASES = {
    "INSTALLATION": JobType.INSTALLATION,
    "INSTALL": JobType.INSTALLATION,
    "DEPANNAGE": JobType.DEPANNAGE,
    "RÉPARATION": JobType.DEPANNAGE,
    "REPARATION": JobType.DEPANNAGE,
    "MIGRATION": JobType.MIGRATION,
    "MAINTENANCE": JobType.MAINTENANCE,
    "TUBAGE": JobType.TUBAGE,
    "NON JOIGNABLE": JobType.NON_JOIGNABLE,
    "NON_JOIGNABLE": JobType.NON_JOIGNABLE,
    "ANNULATION": JobType.ANNULATION,
    "SPLITTER": JobType.SPLITTER,
    "CROQUIS": JobType.CROQUIS_RESEAU,
    "CROQUIS RESEAU": JobType.CROQUIS_RESEAU,
}

from backend.services.excel.operator_profiles import get_operator_profile
from backend.logic.job_planning import default_estimated_duration_minutes


def _clean(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _lookup_key(value: Any) -> str:
    """Normalize human labels without losing their business meaning."""
    text = str(value).strip().upper()
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(character)
    )


def _clean_identifier(value: Any) -> Optional[str]:
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, int):
        return str(value)

    if isinstance(value, float):
        if value != value or not value.is_integer():
            return None
        return str(int(value))

    text = str(value).strip()
    if not text or text.casefold() in {"nan", "none", "true", "false"}:
        return None
    return text


_EXCEL_DATE_EPOCH = datetime(1899, 12, 30, tzinfo=timezone.utc)
_EXCEL_MAX_SERIAL = 2_958_465


def _excel_serial_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, bool):
        return None

    try:
        serial = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(serial) or not 1 <= serial <= _EXCEL_MAX_SERIAL:
        return None

    try:
        return _EXCEL_DATE_EPOCH + timedelta(days=serial)
    except OverflowError:
        return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, date_type):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return _excel_serial_datetime(value)
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"[+-]?\d+(?:[.,]\d+)?", text):
        excel_date = _excel_serial_datetime(text.replace(",", "."))
        if excel_date is not None:
            return excel_date
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        pass
    for fmt in (
        "%d/%m/%Y",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y",
        "%d-%m-%Y %H:%M",
        "%d.%m.%Y",
        "%Y-%m-%d %H:%M:%S",
    ):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _parse_priority(value: Any) -> JobPriority:
    if value is None:
        return JobPriority.NORMALE
    if isinstance(value, JobPriority):
        return value
    text = _lookup_key(value)
    if text in _PRIORITY_ALIASES:
        return _PRIORITY_ALIASES[text]
    try:
        num = int(float(text))
        priority_map = {
            1: JobPriority.URGENT,
            2: JobPriority.HAUTE,
            3: JobPriority.NORMALE,
            4: JobPriority.FAIBLE,
            5: JobPriority.FAIBLE,
        }
        return priority_map.get(num, JobPriority.NORMALE)
    except (TypeError, ValueError):
        return JobPriority.NORMALE


def _parse_status(statut: Any, color_status: Optional[str]) -> JobStatus:
    if color_status and color_status in _COLOR_STATUS:
        return _COLOR_STATUS[color_status]
    text = _clean(statut)
    if text:
        key = _lookup_key(text)
        if key in _STATUS_ALIASES:
            return _STATUS_ALIASES[key]
    return JobStatus.PENDING


def _parse_job_type(value: Any) -> Optional[JobType]:
    text = _clean(value)
    if not text:
        return None
    key = _lookup_key(text)
    if key in _JOB_TYPE_ALIASES:
        return _JOB_TYPE_ALIASES[key]
    try:
        return JobType(key)
    except ValueError:
        return None


def _parse_int(value: Any) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def _json_value(value: Any) -> Any:
    """Return a JSON-safe source value without inventing a replacement."""
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (datetime, date_type)):
        return value.isoformat()
    return str(value).strip() or None


def _parse_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(str(value).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


_GPS_NUMBER_RE = re.compile(
    r"(?<!\d)[+-]?\d{1,3}(?:[.,]\d+)?(?!\d)"
)
_GOOGLE_MAPS_RE = re.compile(
    r"(?:@|[?&](?:q|query|ll)=)"
    r"\s*([+-]?\d{1,2}(?:\.\d+)?)"
    r"\s*[,;]\s*"
    r"([+-]?\d{1,3}(?:\.\d+)?)",
    re.IGNORECASE,
)


def _parse_gps(value: Any) -> Optional[tuple[float, float]]:
    if (
        value is None
        or isinstance(value, bool)
        or isinstance(value, (int, float))
    ):
        return None

    text = str(value).strip()
    if not text:
        return None

    google_match = _GOOGLE_MAPS_RE.search(text)
    if google_match:
        tokens = list(google_match.groups())
    else:
        tokens = _GPS_NUMBER_RE.findall(text)

    if len(tokens) != 2:
        return None

    try:
        latitude = float(tokens[0].replace(",", "."))
        longitude = float(tokens[1].replace(",", "."))
    except ValueError:
        return None

    if not (-90 <= latitude <= 90):
        return None
    if not (-180 <= longitude <= 180):
        return None

    return latitude, longitude


def _select_gps_coordinates(
    gps_values: dict[str, Any],
) -> tuple[
    Optional[float],
    Optional[float],
    Optional[str],
    list[str],
]:
    valid_coordinates = []
    warnings = []

    for source in (
        "GPS_PCO",
        "GPS_DERIVATION",
        "GPS_SPLITTER",
    ):
        raw_value = gps_values.get(source)
        if _clean(raw_value) is None:
            continue

        coordinates = _parse_gps(raw_value)
        if coordinates is None:
            warnings.append(
                f"{source} invalide ou ambigu : coordonnées ignorées."
            )
            continue

        valid_coordinates.append((source, coordinates))

    if not valid_coordinates:
        return None, None, None, warnings

    selected_source, selected_coordinates = valid_coordinates[0]
    latitude, longitude = selected_coordinates

    return latitude, longitude, selected_source, warnings


def _has_explicit_time(value: Any) -> bool:
    """Distinguish a planning datetime from a date-only spreadsheet cell."""
    if isinstance(value, datetime):
        return value.time() != time.min
    if isinstance(value, date_type):
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return not math.isclose(float(value) % 1, 0.0, abs_tol=1e-9)
        except (TypeError, ValueError):
            return False
    text = _clean(value)
    if not text:
        return False
    return bool(re.search(r"(?:T|\s)\d{1,2}:\d{2}(?::\d{2})?", text))


def _dominant_color_status(cells: list) -> Optional[str]:
    priority = {"FAILED": 4, "WAITING": 3, "WARNING": 2, "DONE": 1, "NORMAL": 0}
    best = None
    best_rank = -1
    for cell in cells:
        status = cell.get("status")
        if status and priority.get(status, 0) > best_rank:
            best_rank = priority[status]
            best = status
    return best


def build_job_record(
    values: dict[str, Any],
    mapping: dict[str, int],
    operator: str,
    sheet_name: str,
    row_cells: list,
    row_index: int,
) -> dict[str, Any]:
    """Build a serializable job dict compatible with create_job()."""

    def col(field: str) -> Any:
        column = mapping.get(field)
        if column is None:
            return None
        return values.get(column)

    # ── Support des colonnes des fichiers opérationnels FTTH ──
    # Nouvelles Commandes : INTITULE_CLIENT, CONTACT_CLIENT, SECTEUR_MAPPE
    # SAV FTTH DOWN : NOM_CLIENT, TELEPHONE_REF, ID_CLIENT, VALEUR, DELAI
    # Situation Production : EN_COURS_MAGELLAN, VALIDATION_AUJOURDHUI, PRODUCTION, RESTE_EN_COURS

    customer_name = (
        _clean(col("INTITULE_CLIENT"))
        or _clean(col("NOM_CLIENT"))
        or _clean(col("CLIENT"))
    )
    service_address = _clean(col("ADRESSE"))
    service_city = _clean(col("VILLE"))
    service_zip = _clean(col("CODE_POSTAL"))
    sector_raw = _clean(col("SECTEUR_MAPPE"))
    import_warnings = []

    if not service_city and sector_raw:
        import_warnings.append(
            "Ville absente : secteur Excel conservé séparément."
        )

    customer_phone = (
        _clean(col("CONTACT_CLIENT"))
        or _clean(col("TELEPHONE_REF"))
        or _clean(col("TELEPHONE"))
    )
    s_produit = _clean(col("S_PRODUIT")) or ""
    n_com = _clean_identifier(col("N_COM"))
    etat_col = _clean(col("ETAT")) or _clean(col("STATUT")) or "PENDING"
    op_col = _clean(col("OP")) or ""
    date_enreg = _clean(col("DATE_ENREG")) or _clean(col("DATE")) or ""
    id_client = _clean(col("ID_CLIENT")) or ""
    valeur = col("VALEUR")
    delai = _clean(col("DELAI")) or ""
    telephone_ref = _clean(col("TELEPHONE_REF")) or ""
    en_cours_magellan = col("EN_COURS_MAGELLAN")
    validation_aujourdhui = col("VALIDATION_AUJOURDHUI")
    production_val = col("PRODUCTION")
    reste_en_cours = col("RESTE_EN_COURS")

    nro = _clean(col("NRO"))
    sro = _clean(col("SRO"))
    pbo = _clean(col("PBO"))
    pto = _clean(col("PTO"))
    splitter = _clean(col("SPLITTER_MSAN")) or _clean(col("SPLITTER"))
    splitter_port = _parse_int(col("PORT"))
    reference = _clean_identifier(col("REFERENCE"))

    scheduled_date = _parse_datetime(col("DATE"))
    priority = _parse_priority(col("PRIORITE"))
    job_type = _parse_job_type(col("TYPE"))
    color_status = _dominant_color_status(row_cells)
    status = _parse_status(col("STATUT"), color_status)
    estimated_duration = None
    time_slot_start = None
    time_slot_end = None
    if (
        scheduled_date is not None
        and job_type is not None
        and _has_explicit_time(col("DATE"))
    ):
        estimated_duration = default_estimated_duration_minutes(job_type)
        slot_end = scheduled_date + timedelta(minutes=estimated_duration)
        if slot_end.date() == scheduled_date.date():
            time_slot_start = scheduled_date.strftime("%H:%M")
            time_slot_end = slot_end.strftime("%H:%M")

    observation = _clean(col("OBSERVATION"))
    remark = _clean(col("REMARQUE"))
    comment = observation or remark or _clean(col("COMMENTAIRE"))
    source_technician_name = (
        _clean(col("TECH_CABLE"))
        or _clean(col("TECH_RAC"))
        or _clean(col("TECH_CB"))
        or _clean(col("TECHNICIEN"))
    )

    detected_operator = _clean(col("OPERATEUR")) or operator
    if detected_operator == "UNKNOWN":
        detected_operator = operator if operator != "UNKNOWN" else None

    profile = get_operator_profile(operator)
    skills = list(profile.get("skills") or [])

    if job_type is None and profile.get("default_job_type") is not None:
        job_type = profile["default_job_type"]
    if job_type is None:
        if _clean(col("TYPE")):
            import_warnings.append(
                "Type d'intervention source non reconnu : ligne à corriger avant confirmation."
            )
        else:
            import_warnings.append(
                "Type d'intervention absent : aucune valeur INSTALLATION n'a été inventée."
            )

    if priority == JobPriority.NORMALE and not col("PRIORITE"):
        priority = profile["default_priority"]

    lat, lng, gps_source, gps_warnings = _select_gps_coordinates({
        "GPS_PCO": col("GPS_PCO"),
        "GPS_DERIVATION": col("GPS_DERIVATION"),
        "GPS_SPLITTER": col("GPS_SPLITTER"),
    })
    import_warnings.extend(gps_warnings)

    if lat is None or lng is None:
        import_warnings.append(
            "Aucun GPS Excel fiable : coordonnées laissées inconnues, à compléter au bureau ou sur le terrain."
        )

    job_number = reference or n_com
    if not job_number and profile.get("reference_prefix") and nro:
        job_number = f"{profile['reference_prefix']}-{nro}-{row_index}"
    if not job_number and nro and pbo:
        job_number = f"{nro}-{pbo}-{row_index}"

    route_criteria = nro or sro

    cable_start = _parse_float(col("CABLE_DEPART"))
    cable_end = _parse_float(col("CABLE_ARRIVE"))
    cable_length = None
    if cable_start is not None and cable_end is not None:
        cable_length = int(round(abs(cable_start - cable_end)))

    operational_fields = {
        "avancement_magillan": "AVANCEMENT_MAGILLAN",
        "date_action": "DATE_ACTION",
        "observation": "OBSERVATION",
        "splitter_msan": "SPLITTER_MSAN",
        "pco": "PCO",
        "sn": "SN",
        "position_pco": "POSITION_PCO",
        "gps_pco": "GPS_PCO",
        "gps_derivation": "GPS_DERIVATION",
        "gps_splitter": "GPS_SPLITTER",
        "statut_source": "STATUT",
        "tech_cb": "TECH_CB",
        "tech_rac": "TECH_RAC",
        "tech_cable": "TECH_CABLE",
        "source_technician_name": "TECHNICIEN",
        "cb": "CB",
        "cable_type": "CABLE",
        "cable_code": "CABLE_CODE",
        "cable_depart_m": "CABLE_DEPART",
        "cable_arrive_m": "CABLE_ARRIVE",
        "pose_sp_m": "POSE_SP",
        "pose_fsd_m": "POSE_FSD",
        "pose_tr_m": "POSE_TR",
        "signal": "SIGNAL",
        "remarque": "REMARQUE",
    }
    operational_data = {
        key: _json_value(col(field))
        for key, field in operational_fields.items()
        if _json_value(col(field)) is not None
    }
    action_date = _parse_datetime(col("DATE_ACTION"))
    if action_date is not None:
        operational_data["date_action"] = action_date.isoformat()
    if cable_length is not None:
        operational_data["cable_length_m"] = cable_length
    if source_technician_name is not None:
        operational_data["source_technician_name"] = source_technician_name

    return {
        "job_number": job_number,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "service_address": service_address,
        "service_city": service_city,
        "service_zip": service_zip,
        "sector_raw": sector_raw,
        "latitude": lat,
        "longitude": lng,
        "gps_source": gps_source,
        "import_warnings": import_warnings,
        "job_type": job_type.value if job_type is not None else None,
        "required_skills": skills,
        "route_criteria": route_criteria,
        "priority": priority.value,
        "status": status.value,
        "scheduled_date": scheduled_date.isoformat() if scheduled_date else None,
        "time_slot_start": time_slot_start,
        "time_slot_end": time_slot_end,
        "estimated_duration": estimated_duration,
        "source_technician_name": source_technician_name,
        "notes": comment,
        "description": comment,
        "operator": detected_operator,
        "nro": nro,
        "sro": sro,
        "pbo": pbo,
        "pto": pto,
        "splitter": splitter,
        "splitter_port": splitter_port,
        "optical_power_dbm": _parse_float(col("SIGNAL")),
        "cable_length_m": cable_length,
        "ont_serial": _clean(col("SN")),
        "operational_data": operational_data,
        "_import_id": f"{sheet_name}:{row_index}:{job_number or row_index}",
        "_meta": {
            "sheet": sheet_name,
            "row": row_index,
            "operator_detected": operator,
            "color_status": color_status,
        },
    }
