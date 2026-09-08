import math

import pytest

from backend.logic.cable_measurements import (
    calculate_cable_length_m,
    parse_meter_mark,
)
from backend.logic.technician_jobs import TechnicianJobMutationError


def test_parse_meter_mark_accepts_decimal_comma_and_canonicalizes():
    assert parse_meter_mark({"meter_mark_m": "125,5"}) == pytest.approx(125.5)
    assert parse_meter_mark({"cable_counter_m": 401}) == pytest.approx(401.0)


def test_parse_meter_mark_is_optional_for_existing_gps_only_events():
    assert parse_meter_mark({"latitude": 33.57, "longitude": -7.59}) is None


def test_calculate_cable_length_is_absolute_meter_delta():
    assert calculate_cable_length_m(120.0, 166.25) == pytest.approx(46.25)
    assert calculate_cable_length_m(166.25, 120.0) == pytest.approx(46.25)


@pytest.mark.parametrize("value", [-1, "-0.1", math.inf, -math.inf, math.nan, True, "abc"])
def test_parse_meter_mark_rejects_invalid_values(value):
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        parse_meter_mark({"meter_reading_m": value})

    assert exc_info.value.code == "invalid_cable_meter"
    assert exc_info.value.status == "rejected"
