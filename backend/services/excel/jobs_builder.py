import unicodedata

from backend.database.models import JobType
from backend.services.excel.job_fields import build_job_record


_TYPE_ALIASES = {
    "INSTALL": JobType.INSTALLATION,
    "INSTALLATION": JobType.INSTALLATION,
    "DEPANNAGE": JobType.DEPANNAGE,
    "REPARATION": JobType.DEPANNAGE,
    "MAINTENANCE": JobType.MAINTENANCE,
    "SAV": JobType.SAV,
    "DECONNEXION": JobType.DISCONNECT,
    "DISCONNECT": JobType.DISCONNECT,
    "INSPECTION": JobType.INSPECTION,
    "INCIDENT": JobType.INCIDENT,
    "URGENCE": JobType.URGENCE,
    "MIGRATION": JobType.MIGRATION,
    "RACCORDEMENT": JobType.RACCORDEMENT,
    "AUDIT": JobType.AUDIT,
    "TUBAGE": JobType.TUBAGE,
    "NON JOIGNABLE": JobType.NON_JOIGNABLE,
    "ANNULATION": JobType.ANNULATION,
    "SPLITTER": JobType.SPLITTER,
    "CROQUIS": JobType.CROQUIS_RESEAU,
    "CROQUIS RESEAU": JobType.CROQUIS_RESEAU,
}


def _fold_type(value):
    if value is None:
        return ""
    raw = str(value).strip().upper()
    raw = "".join(
        character
        for character in unicodedata.normalize("NFKD", raw)
        if not unicodedata.combining(character)
    )
    return " ".join(raw.replace("_", " ").replace("-", " ").split())


def _normalize_job_type(job, raw_type):
    """Recognize the 16 delivery types; unknown values remain undecided."""
    source = None if raw_type is None else str(raw_type).strip() or None
    canonical = _TYPE_ALIASES.get(_fold_type(source))
    warnings = list(job.get("import_warnings") or [])
    operational_data = dict(job.get("operational_data") or {})

    # Remove the older parser warning when this layer recognized the label.
    warnings = [
        warning
        for warning in warnings
        if not (
            canonical is not None
            and isinstance(warning, str)
            and "type d'intervention" in warning.casefold()
        )
    ]

    if canonical is not None:
        job["job_type"] = canonical.value
        operational_data.pop("job_type_pending", None)
        operational_data["source_job_type"] = source or canonical.value
    else:
        job["job_type"] = None
        operational_data["job_type_pending"] = True
        operational_data["source_job_type"] = source
        message = "Type d'intervention à décider par l'orienteur."
        if message not in warnings:
            warnings.append(message)

    job["import_warnings"] = warnings
    job["operational_data"] = operational_data
    return job


class JobsBuilder:

    def __init__(self, workbook, operator: str = "UNKNOWN"):

        self.workbook = workbook
        self.operator = operator

    def build(self):

        jobs = []

        for sheet in self.workbook:

            mapping = sheet["mapping"]
            rows = sheet["rows"]
            header_row = int(sheet.get("header_row") or 1)

            if len(rows) < 2:
                continue

            for row_index, row in enumerate(rows[1:], start=header_row + 1):

                values = {}

                for cell in row:
                    values[cell["column"]] = cell["value"]

                if not any(v is not None for v in values.values()):
                    continue

                job = build_job_record(
                    values=values,
                    mapping=mapping,
                    operator=self.operator,
                    sheet_name=sheet["sheet"],
                    row_cells=row,
                    row_index=row_index,
                )

                type_column = mapping.get("TYPE")
                raw_type = values.get(type_column) if type_column is not None else None
                _normalize_job_type(job, raw_type)

                jobs.append(job)

        return jobs
