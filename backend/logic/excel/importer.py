import pandas as pd

from backend.logic.excel.parser import (
    detect_operator,
    normalize,
    dataframe_info,
)


class ExcelImporter:

    def __init__(self, path):

        self.path = path

        self.workbook = pd.ExcelFile(path)

        self.sheet_names = self.workbook.sheet_names

        self.sheet_name = self.sheet_names[0]

        self.df = pd.read_excel(
            path,
            sheet_name=self.sheet_name
        )

        self.df = normalize(self.df)

        self.operator = detect_operator(self.df)

    # ----------------------------------------------------
    # Informations générales
    # ----------------------------------------------------

    def info(self):

        info = dataframe_info(self.df)

        info["sheet"] = self.sheet_name

        info["available_sheets"] = self.sheet_names

        return info

    # ----------------------------------------------------
    # Aperçu
    # ----------------------------------------------------

    def preview(self, rows=10):

        return {

            "operator": self.operator,

            "sheet": self.sheet_name,

            "available_sheets": self.sheet_names,

            "rows": len(self.df),

            "columns": list(self.df.columns),

            "sample": (
                self.df
                .head(rows)
                .fillna("")
                .to_dict(orient="records")
            )

        }

    # ----------------------------------------------------
    # DataFrame complet
    # ----------------------------------------------------

    def dataframe(self):

        return self.df.copy()

    # ----------------------------------------------------
    # Colonnes
    # ----------------------------------------------------

    def columns(self):

        return list(self.df.columns)