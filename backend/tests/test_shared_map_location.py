import pytest

from backend.services.geocoding.shared_map import (
    SharedMapLocationError,
    parse_shared_map_location,
    resolve_shared_map_location,
)


def test_plain_coordinates_are_imported_without_network_access():
    result = resolve_shared_map_location("33.54789, -7.59582")

    assert result == {
        "resolved": True,
        "latitude": 33.54789,
        "longitude": -7.59582,
        "source": "manual_coordinates",
        "precision": "user_confirmed",
    }


def test_google_place_coordinates_win_over_viewport_coordinates():
    value = (
        "https://www.google.com/maps/place/Residence/"
        "@33.500000,-7.500000,17z/data=!4m6!3m5!8m2!3d33.54789!4d-7.59582"
    )

    assert parse_shared_map_location(value) == (33.54789, -7.59582)
    assert resolve_shared_map_location(value)["source"] == "google_maps_shared_link"


def test_google_query_coordinates_are_supported():
    assert parse_shared_map_location(
        "https://www.google.com/maps/search/?api=1&query=33.54789%2C-7.59582"
    ) == (33.54789, -7.59582)


def test_non_google_urls_are_rejected_before_any_request():
    with pytest.raises(SharedMapLocationError):
        resolve_shared_map_location("https://example.com/@33.54789,-7.59582,17z")


def test_google_search_without_explicit_coordinates_is_not_guessed():
    with pytest.raises(SharedMapLocationError):
        resolve_shared_map_location(
            "https://www.google.com/maps/search/?api=1&query=Residence+Yahya"
        )
