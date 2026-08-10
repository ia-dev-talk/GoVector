from backend.logic.assignments import estimate_assignment_route
from backend.services.geocoding.nominatim import _build_query_candidates


def test_address_only_job_can_be_assigned_without_route_estimates():
    distance, travel_time = estimate_assignment_route(
        33.5731,
        -7.5898,
        None,
        None,
    )

    assert distance is None
    assert travel_time is None


def test_unknown_technician_position_does_not_fabricate_route_estimates():
    distance, travel_time = estimate_assignment_route(
        None,
        None,
        33.5731,
        -7.5898,
    )

    assert distance is None
    assert travel_time is None


def test_known_endpoints_keep_route_estimates():
    distance, travel_time = estimate_assignment_route(
        33.5731,
        -7.5898,
        33.5899,
        -7.6039,
    )

    assert distance is not None
    assert distance > 0
    assert travel_time is not None
    assert travel_time >= 0


def test_complete_address_keeps_embedded_city_in_first_geocoding_candidate():
    candidates, _, _ = _build_query_candidates(
        (
            "Résidence Yahya, 739 Rue de Boukraa, Bourgogne "
            "Appartement 9, Casablanca"
        ),
        country="Morocco",
    )

    assert candidates
    assert "739 Rue de Boukraa" in candidates[0]
    assert "Casablanca" in candidates[0]
    assert candidates[0].endswith("Morocco")
    assert any(
        "739 Rue de Boukraa" in candidate
        and "Casablanca" in candidate
        for candidate in candidates[1:]
    )


def test_noisy_address_retries_the_street_without_apartment_details():
    candidates, _, _ = _build_query_candidates(
        (
            "3 eme étage, Résidence Yahya, 739 Rue de Boukraa, "
            "bourgone Appartement N: 9, Casablanca 20000"
        ),
        country="Morocco",
    )

    assert any(
        candidate.startswith("739 Rue de Boukraa, ")
        and "Casablanca 20000" in candidate
        and "Appartement" not in candidate
        and "étage" not in candidate
        for candidate in candidates
    )
