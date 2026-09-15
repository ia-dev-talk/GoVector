from backend.services.excel.job_fields import build_job_record


_JOB_SHEET_FIELDS = {
    "N_COM",
    "REFERENCE",
    "ID_CLIENT",
    "CLIENT",
    "INTITULE_CLIENT",
    "NOM_CLIENT",
    "ADRESSE",
    "TYPE",
    "DATE",
}


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
            if not (_JOB_SHEET_FIELDS & set(mapping)):
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

                jobs.append(job)

        return jobs
