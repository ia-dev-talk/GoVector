from datetime import datetime


class ExcelNormalizer:

    def __init__(self, workbook):

        self.workbook = workbook

    def normalize(self):

        workbook = []

        for sheet in self.workbook:

            rows = []

            for row in sheet["rows"]:

                normalized_row = []

                for cell in row:

                    value = cell["value"]

                    if isinstance(value, str):

                        value = value.strip()

                        if value == "":
                            value = None

                    if isinstance(value, datetime):

                        value = value.isoformat()

                    normalized = dict(cell)

                    normalized["value"] = value

                    normalized_row.append(normalized)

                rows.append(normalized_row)

            workbook.append({

                "sheet": sheet["sheet"],

                "rows": rows,

                "max_row": sheet["max_row"],

                "max_column": sheet["max_column"],

                "merged_ranges": sheet["merged_ranges"]

            })

        return workbook