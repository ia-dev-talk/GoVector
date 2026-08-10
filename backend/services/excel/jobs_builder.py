from backend.services.excel.job_fields import build_job_record


class JobsBuilder:

    def __init__(self, workbook, operator: str = "UNKNOWN"):

        self.workbook = workbook
        self.operator = operator

    def build(self):

        jobs = []

        for sheet in self.workbook:

            mapping = sheet["mapping"]
            rows = sheet["rows"]

            if len(rows) < 2:
                continue

            for row_index, row in enumerate(rows[1:], start=2):

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
