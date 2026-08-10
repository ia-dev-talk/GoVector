def sheet_to_dict(sheet):

    rows = sheet["rows"]

    if len(rows) == 0:
        return []

    headers = []

    for cell in rows[0]:
        headers.append(cell["value"])

    result = []

    for row in rows[1:]:

        obj = {}

        row_color = None

        for i, cell in enumerate(row):

            if i >= len(headers):
                continue

            obj[headers[i]] = cell["value"]

            if cell["color"]:

                row_color = cell["color"]

        obj["_color"] = row_color

        result.append(obj)

    return result