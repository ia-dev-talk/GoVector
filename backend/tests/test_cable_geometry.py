import pytest

from backend.logic.cable_geometry import (
    CableGeometryError,
    may_replace_job_length_from_same_route,
    rounded_job_cable_length_m,
    route_geometry_length_m,
)


def test_linestring_uses_all_route_segments_not_endpoint_distance():
    straight = route_geometry_length_m(
        {
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [0.001, 0.0]],
        }
    )
    routed = route_geometry_length_m(
        {
            "type": "LineString",
            "coordinates": [[0.0, 0.0], [0.0, 0.001], [0.001, 0.001]],
        }
    )
    assert straight == pytest.approx(111.319, abs=0.2)
    assert routed == pytest.approx(221.894, abs=0.5)
    assert routed > straight * 1.9


def test_multilinestring_sums_every_part():
    value = route_geometry_length_m(
        {
            "type": "MultiLineString",
            "coordinates": [
                [[0.0, 0.0], [0.001, 0.0]],
                [[0.001, 0.0], [0.002, 0.0]],
            ],
        }
    )
    assert value == pytest.approx(222.639, abs=0.4)


def test_non_line_geometry_does_not_invent_cable_length():
    assert route_geometry_length_m(
        {"type": "Point", "coordinates": [-7.62, 33.59]}
    ) is None


def test_invalid_line_coordinates_are_rejected():
    with pytest.raises(CableGeometryError, match="position_out_of_bounds"):
        route_geometry_length_m(
            {
                "type": "LineString",
                "coordinates": [[-7.62, 33.59], [-190.0, 33.60]],
            }
        )


def test_job_projection_rounds_to_meter():
    assert rounded_job_cable_length_m(124.51) == 125


def test_route_can_fill_empty_job_length():
    assert may_replace_job_length_from_same_route(
        current_job_length_m=None,
        previous_projected_value_m=None,
    ) is True


def test_route_can_refresh_only_its_own_previous_projection():
    assert may_replace_job_length_from_same_route(
        current_job_length_m=125,
        previous_projected_value_m=125,
    ) is True
    assert may_replace_job_length_from_same_route(
        current_job_length_m=130,
        previous_projected_value_m=125,
    ) is False
