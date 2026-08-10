"""Safely import coordinates explicitly shared by an office user.

This module does not scrape Google Maps.  It only parses coordinates already
present in user-provided text/URLs and, for official short share links, follows
Google-owned HTTP redirects before parsing the resulting URL.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import httpx


_NUMBER = r"-?\d{1,3}(?:\.\d+)?"
_PLAIN_COORDINATES = re.compile(
    rf"^\s*(?P<lat>{_NUMBER})\s*[,;]\s*(?P<lng>{_NUMBER})\s*$"
)
_GOOGLE_DATA_COORDINATES = re.compile(
    rf"!3d(?P<lat>{_NUMBER})!4d(?P<lng>{_NUMBER})",
    re.IGNORECASE,
)
_GOOGLE_VIEW_COORDINATES = re.compile(
    rf"/@(?P<lat>{_NUMBER}),(?P<lng>{_NUMBER})(?:,|/|$)",
    re.IGNORECASE,
)
_QUERY_COORDINATES = re.compile(
    rf"^\s*(?P<lat>{_NUMBER})\s*,\s*(?P<lng>{_NUMBER})\s*$"
)

_GOOGLE_HOSTS = {
    "google.com",
    "google.co.ma",
    "maps.google.com",
    "maps.google.co.ma",
    "www.google.com",
    "www.google.co.ma",
    "maps.app.goo.gl",
    "goo.gl",
}
_SHORT_LINK_HOSTS = {"maps.app.goo.gl", "goo.gl"}
_COORDINATE_QUERY_KEYS = (
    "query",
    "q",
    "ll",
    "center",
    "destination",
    "daddr",
)


class SharedMapLocationError(ValueError):
    """Raised when a shared location cannot be validated without guessing."""


def _valid_coordinates(latitude: float, longitude: float) -> bool:
    return -90 <= latitude <= 90 and -180 <= longitude <= 180


def _coordinates(match: re.Match[str] | None) -> tuple[float, float] | None:
    if match is None:
        return None
    latitude = float(match.group("lat"))
    longitude = float(match.group("lng"))
    if not _valid_coordinates(latitude, longitude):
        return None
    return latitude, longitude


def _allowed_google_url(value: str) -> str:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or host not in _GOOGLE_HOSTS:
        raise SharedMapLocationError(
            "Utilisez un lien HTTPS officiel Google Maps ou des coordonnées latitude, longitude."
        )
    return host


def parse_shared_map_location(value: str) -> tuple[float, float] | None:
    """Parse explicit coordinates without resolving or scraping web content."""
    cleaned = unquote((value or "").strip())
    if not cleaned:
        return None

    plain = _coordinates(_PLAIN_COORDINATES.fullmatch(cleaned))
    if plain is not None:
        return plain

    _allowed_google_url(cleaned)

    # Google place URLs carry the selected place in !3d/!4d. Prefer it over
    # the @lat,lng viewport centre when both are present.
    place = _coordinates(_GOOGLE_DATA_COORDINATES.search(cleaned))
    if place is not None:
        return place

    parsed = urlparse(cleaned)
    query = parse_qs(parsed.query)
    for key in _COORDINATE_QUERY_KEYS:
        for candidate in query.get(key, []):
            coordinates = _coordinates(_QUERY_COORDINATES.fullmatch(candidate))
            if coordinates is not None:
                return coordinates

    return _coordinates(_GOOGLE_VIEW_COORDINATES.search(cleaned))


def _expand_short_google_url(value: str, *, timeout: float) -> str:
    current = value
    with httpx.Client(timeout=timeout) as client:
        for _ in range(6):
            host = _allowed_google_url(current)
            if host not in _SHORT_LINK_HOSTS:
                return current
            response = client.get(
                current,
                follow_redirects=False,
                headers={"User-Agent": "BlueVector/1.0 shared-map-import"},
            )
            if response.status_code not in {301, 302, 303, 307, 308}:
                return str(response.url)
            location = response.headers.get("location")
            if not location:
                return str(response.url)
            next_url = urljoin(str(response.url), location)
            _allowed_google_url(next_url)
            current = next_url
    raise SharedMapLocationError("Le lien Google Maps contient trop de redirections.")


def resolve_shared_map_location(value: str, *, timeout: float = 8.0) -> dict:
    """Resolve a pasted coordinate pair or official Google Maps share URL."""
    cleaned = (value or "").strip()
    is_url = urlparse(cleaned).scheme != ""
    coordinates = parse_shared_map_location(cleaned)
    source = "google_maps_shared_link" if is_url else "manual_coordinates"

    if coordinates is None:
        host = _allowed_google_url(cleaned)
        if host in _SHORT_LINK_HOSTS:
            cleaned = _expand_short_google_url(cleaned, timeout=timeout)
            coordinates = parse_shared_map_location(cleaned)

    if coordinates is None:
        raise SharedMapLocationError(
            "Ce lien ne contient pas de coordonnées exploitables. Dans Google Maps, "
            "ouvrez le lieu exact puis utilisez Partager, ou copiez directement la latitude et la longitude."
        )

    return {
        "resolved": True,
        "latitude": coordinates[0],
        "longitude": coordinates[1],
        "source": source,
        "precision": "user_confirmed",
    }
