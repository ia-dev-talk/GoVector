from backend.services.excel.colors import interpret


class ExcelExtractor:

    def __init__(self, workbook):

        self.workbook = workbook

    def extract(self):

        result = []

        for sheet in self.workbook:

            rows = []

            for row in sheet["rows"]:

                values = []

                for cell in row:

                    values.append({

                        "coordinate": cell["coordinate"],

                        "row": cell["row"],

                        "column": cell["column"],

                        "value": cell["value"],

                        "status": interpret(
                            cell["color"]
                        ),

                        "color": cell["color"],

                        "font_color": cell["font_color"],

                        "bold": cell["bold"],

                        "italic": cell["italic"],

                        "font_size": cell["font_size"],

                        "horizontal_align": cell["horizontal_align"],

                        "vertical_align": cell["vertical_align"],

                        "number_format": cell["number_format"],

                        "merged": cell["merged"],

                        "comment": cell["comment"]

                    })

                rows.append(values)

            result.append({

                "sheet": sheet["sheet"],

                "rows": rows,

                "max_row": sheet["max_row"],

                "max_column": sheet["max_column"],

                "merged_ranges": sheet["merged_ranges"]

            })

        return result