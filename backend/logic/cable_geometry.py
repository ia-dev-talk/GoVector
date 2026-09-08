"""Geodesic cable-route length helpers for QGIS/QField geometries.

GeoJSON coordinates are WGS84 longitude/latitude. Cable length is therefore
computed segment-by-segment on the WGS84 ellipsoid, not in degrees and never as
a straight line between the first and last point of the route.

Only LineString and MultiLineString are cable-route candidates. Other geometry
types return ``None`` so point observations remain valid without inventing a
length.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence


class CableGeometryError(ValueError):
    """Raised when a line geometry cannot represent a safe WGS84 route."""


_WGS84_A = 6_378_137.0
_WGS84_F = 1 / 298.257223563
_WGS84_B = (1 - _WGS84_F) * _WGS84_A
_MEAN_EARTH_RADIUS_M = 6_371_008.8
_MAX_SEGMENTS = 100_000


def _position(value: Any) -> tuple[float, float]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or len(value) < 2:
        raise CableGeometryError("invalid_position")
    lon_raw, lat_raw = value[0], value[1]
    if isinstance(lon_raw, bool) or isinstance(lat_raw, bool):
        raise CableGeometryError("invalid_position")
    try:
        lon = float(lon_raw)
        lat = float(lat_raw)
    except (TypeError, ValueError) as exc:
        raise CableGeometryError("invalid_position") from exc
    if not math.isfinite(lon) or not math.isfinite(lat):
        raise CableGeometryError("invalid_position")
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise CableGeometryError("position_out_of_bounds")
    return lon, lat


def _haversine_distance_m(left: tuple[float, float], right: tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, left)
    lon2, lat2 = map(math.radians, right)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    value = min(1.0, max(0.0, value))
    return 2 * _MEAN_EARTH_RADIUS_M * math.asin(math.sqrt(value))


def _vincenty_distance_m(left: tuple[float, float], right: tuple[float, float]) -> float:
    """Return WGS84 ellipsoidal distance, with a safe antipodal fallback."""

    if left == right:
        return 0.0

    lon1, lat1 = left
    lon2, lat2 = right
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    longitude_delta = math.radians(lon2 - lon1)

    reduced1 = math.atan((1 - _WGS84_F) * math.tan(phi1))
    reduced2 = math.atan((1 - _WGS84_F) * math.tan(phi2))
    sin_u1, cos_u1 = math.sin(reduced1), math.cos(reduced1)
    sin_u2, cos_u2 = math.sin(reduced2), math.cos(reduced2)

    lam = longitude_delta
    for _ in range(200):
        sin_lam, cos_lam = math.sin(lam), math.cos(lam)
        x = cos_u2 * sin_lam
        y = cos_u1 * sin_u2 - sin_u1 * cos_u2 * cos_lam
        sin_sigma = math.hypot(x, y)
        if sin_sigma == 0:
            return 0.0
        cos_sigma = sin_u1 * sin_u2 + cos_u1 * cos_u2 * cos_lam
        sigma = math.atan2(sin_sigma, cos_sigma)
        sin_alpha = cos_u1 * cos_u2 * sin_lam / sin_sigma
        cos_sq_alpha = 1 - sin_alpha * sin_alpha
        if cos_sq_alpha == 0:
            cos_2_sigma_m = 0.0
        else:
            cos_2_sigma_m = cos_sigma - 2 * sin_u1 * sin_u2 / cos_sq_alpha
        coefficient = (
            _WGS84_F
            / 16
            * cos_sq_alpha
            * (4 + _WGS84_F * (4 - 3 * cos_sq_alpha))
        )
        previous = lam
        lam = longitude_delta + (1 - coefficient) * _WGS84_F * sin_alpha * (
            sigma
            + coefficient
            * sin_sigma
            * (
                cos_2_sigma_m
                + coefficient
                * cos_sigma
                * (-1 + 2 * cos_2_sigma_m * cos_2_sigma_m)
            )
        )
        if abs(lam - previous) <= 1e-12:
            break
    else:
        # Vincenty can fail near antipodal points. Such a segment is not a
        # realistic FTTH route, but returning a bounded spherical distance is
        # safer than hanging or returning NaN.
        return _haversine_distance_m(left, right)

    u_sq = cos_sq_alpha * (
        (_WGS84_A * _WGS84_A - _WGS84_B * _WGS84_B) / (_WGS84_B * _WGS84_B)
    )
    big_a = 1 + u_sq / 16384 * (
        4096 + u_sq * (-768 + u_sq * (320 - 175 * u_sq))
    )
    big_b = u_sq / 1024 * (
        256 + u_sq * (-128 + u_sq * (74 - 47 * u_sq))
    )
    delta_sigma = big_b * sin_sigma * (
        cos_2_sigma_m
        + big_b
        / 4
        * (
            cos_sigma * (-1 + 2 * cos_2_sigma_m * cos_2_sigma_m)
            - big_b
            / 6
            * cos_2_sigma_m
            * (-3 + 4 * sin_sigma * sin_sigma)
            * (-3 + 4 * cos_2_sigma_m * cos_2_sigma_m)
        )
    )
    distance = _WGS84_B * big_a * (sigma - delta_sigma)
    if not math.isfinite(distance) or distance < 0:
        raise CableGeometryError("distance_not_finite")
    return distance


def _line_length_m(coordinates: Any) -> tuple[float, int]:
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        raise CableGeometryError("line_requires_two_positions")
    points = [_position(value) for value in coordinates]
    segments = len(points) - 1
    if segments > _MAX_SEGMENTS:
        raise CableGeometryError("route_too_complex")
    total = sum(
        _vincenty_distance_m(points[index - 1], points[index])
        for index in range(1, len(points))
    )
    return total, segments


def route_geometry_length_m(geometry: Mapping[str, Any] | None) -> float | None:
    """Return routed WGS84 length for LineString/MultiLineString, else ``None``."""

    if geometry is None:
        return None
    if not isinstance(geometry, Mapping):
        raise CableGeometryError("invalid_geometry")
    geometry_type = geometry.get("type")
    if geometry_type == "LineString":
        total, _segments = _line_length_m(geometry.get("coordinates"))
        return total
    if geometry_type == "MultiLineString":
        lines = geometry.get("coordinates")
        if not isinstance(lines, list) or not lines:
            raise CableGeometryError("multiline_requires_lines")
        total = 0.0
        segment_total = 0
        for line in lines:
            length, segments = _line_length_m(line)
            total += length
            segment_total += segments
            if segment_total > _MAX_SEGMENTS:
                raise CableGeometryError("route_too_complex")
        return total
    return None


def rounded_job_cable_length_m(value: float) -> int:
    if not math.isfinite(value) or value < 0:
        raise CableGeometryError("invalid_route_length")
    return int(round(value))


def may_replace_job_length_from_same_route(
    *,
    current_job_length_m: int | None,
    previous_projected_value_m: Any,
) -> bool:
    """Preserve physical/manual higher-priority values over GIS route projection."""

    if current_job_length_m is None:
        return True
    if previous_projected_value_m is None or isinstance(previous_projected_value_m, bool):
        return False
    try:
        previous = int(previous_projected_value_m)
    except (TypeError, ValueError):
        return False
    return previous == int(current_job_length_m)
