"""Focused regression tests for GPS values travelling through Excel import."""

import pytest

from backend.api.routes.import_confirm import _validate_reliable_coordinates
from backend.services.excel.jobs_builder import JobsBuilder
from backend.services.excel.mapper import ExcelMapper


def _cell(row: int, column: int, value):
    return {
        "row": row,
        "column": column,
        "coordinate": f"{row}:{column}",
        "value": value,
        "status": "NORMAL",
    }


@pytest.mark.parametrize(
    "gps_header",
    ["GPS", "COORDONNEES", "COORDONNÉES", "COORDONNEES GPS"],
)
def test_generic_gps_column_survives_preview_and_confirm_validation(gps_header):
    workbook = [
        {
            "sheet": "Import",
            "rows": [
                [
                    _cell(1, 1, "COMMANDE"),
                    _cell(1, 2, "TYPE"),
                    _cell(1, 3, gps_header),
                ],
                [
                    _cell(2, 1, "CMD-GPS-1"),
                    _cell(2, 2, "SAV"),
                    _cell(2, 3, "33.5731,-7.5898"),
                ],
            ],
        }
    ]

    mapped = ExcelMapper(workbook, operator="UNKNOWN").map()
    jobs = JobsBuilder(mapped).build()

    assert mapped[0]["mapping"]["GPS_PCO"] == 3
    assert len(jobs) == 1

    job = jobs[0]
    assert job["latitude"] == pytest.approx(33.5731)
    assert job["longitude"] == pytest.approx(-7.5898)
    assert job["gps_source"] == "GPS_PCO"

    confirmed_latitude, confirmed_longitude = _validate_reliable_coordinates(job)
    assert confirmed_latitude == pytest.approx(33.5731)
    assert confirmed_longitude == pytest.approx(-7.5898)


def test_invalid_generic_gps_is_never_invented():
    workbook = [
        {
            "sheet": "Import",
            "rows": [
                [_cell(1, 1, "TYPE"), _cell(1, 2, "GPS")],
                [_cell(2, 1, "SAV"), _cell(2, 2, "coordonnée inconnue")],
            ],
        }
    ]

    job = JobsBuilder(ExcelMapper(workbook).map()).build()[0]

    assert job["latitude"] is None
    assert job["longitude"] is None
    assert job["gps_source"] is None
    assert _validate_reliable_coordinates(job) == (None, None)
