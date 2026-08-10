from pathlib import Path

from backend.services.excel.parser import parse_spreadsheet
from backend.services.excel.detector import detect_operator


class ExcelImporter:

    def __init__(self, filepath: str):

        self.filepath = filepath

        self.filename = Path(filepath).name

        self.workbook = parse_spreadsheet(filepath)

        self.operator = detect_operator(self.filename, self.workbook)

    # --------------------------------------------------
    # Informations générales
    # --------------------------------------------------

    def info(self):

        return {

            "filename": self.filename,

            "operator": self.operator,

            "sheet_count": len(self.workbook),

            "sheets": [
                sheet["sheet"]
                for sheet in self.workbook
            ]

        }

    # --------------------------------------------------
    # Feuille
    # --------------------------------------------------

    def get_sheet(self, index=0):

        return self.workbook[index]

    # --------------------------------------------------
    # Toutes les feuilles
    # --------------------------------------------------

    def get_sheets(self):

        return self.workbook

    # --------------------------------------------------
    # Prévisualisation
    # --------------------------------------------------

    def preview(self, rows=10):

        previews = []

        for sheet in self.workbook:

            previews.append({

                "sheet": sheet["sheet"],

                "rows": len(sheet["rows"]),

                "preview": sheet["rows"][:rows]

            })

        return {

            "filename": self.filename,

            "operator": self.operator,

            "sheet_count": len(previews),

            "sheets": previews

        }