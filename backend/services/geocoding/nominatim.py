"""
Nominatim geocoding for Morocco FTTH addresses.
"""
import logging
import re
import time
import unicodedata
from typing import Optional

import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)

_RELIABLE_GPS_SOURCES = {
    "GPS_PCO",
    "GPS_DERIVATION",
    "GPS_SPLITTER",
    "geocoded",
}

_cache: dict[
    str,
    tuple[
        Optional[float],
        Optional[float],
        bool,
        Optional[dict],
    ],
] = {}

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)

_GENERIC_LOCATION_TOKENS = {
    "casa",
    "casablanca",
    "maroc",
    "morocco",
}

_DETAIL_TOKENS = {
    "residence",
    "immeuble",
    "rue",
    "avenue",
    "boulevard",
    "route",
    "lot",
    "lotissement",
    "bloc",
    "appartement",
}

_AREA_TOKENS = {
    "zi",
    "zone",
    "industrielle",
    "industriel",
    "quartier",
    "district",
    "douar",
    "nouvelle",
    "nouveau",
}

_CONTEXT_PREFIX_TOKENS = {
    "ain",
    "sidi",
    "el",
    "al",
    "la",
    "le",
    "de",
    "du",
}

_CITY_ADDRESS_FIELDS = (
    "city",
    "town",
    "municipality",
    "village",
    "county",
)

_DISTRICT_ADDRESS_FIELDS = (
    "city_district",
    "suburb",
    "quarter",
    "neighbourhood",
)

_BUILDING_ADDRESS_TYPES = {
    "house",
    "building",
    "apartments",
    "detached",
    "terrace",
}

_STREET_ADDRESS_TYPES = {
    "road",
    "street",
    "pedestrian",
    "service",
}

_AREA_ADDRESS_TYPES = {
    "neighbourhood",
    "suburb",
    "quarter",
    "industrial",
    "commercial",
    "residential",
}

_LOCALITY_ADDRESS_TYPES = {
    "city",
    "town",
    "municipality",
    "village",
    "county",
    "state",
    "administrative",
}


def _clean_text(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""

    return " ".join(value.strip().split())


def _normalized_key(value: str) -> str:
    normalized = unicodedata.normalize(
        "NFKD",
        _clean_text(value),
    )
    return "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    ).casefold()


def _tokens(value: str) -> list[str]:
    return [
        _normalized_key(token)
        for token in _TOKEN_RE.findall(value)
    ]


def _deduplicate_parts(parts: list[str]) -> list[str]:
    unique = []
    seen = set()

    for part in parts:
        cleaned = _clean_text(part)
        key = _normalized_key(cleaned)

        if not cleaned or not key or key in seen:
            continue

        seen.add(key)
        unique.append(cleaned)

    return unique


def _fragment_precision(fragment: str) -> int:
    tokens = set(_tokens(fragment))
    score = 0

    if tokens & _DETAIL_TOKENS:
        score += 4

    if tokens & _AREA_TOKENS:
        score += 2

    if any(character.isdigit() for character in fragment):
        score += 3

    return score


def _repeated_locality(
    fragments: list[str],
    excluded_tokens: set[str],
) -> Optional[str]:
    occurrences: dict[str, set[int]] = {}
    display_values: dict[str, str] = {}

    ignored_tokens = (
        _GENERIC_LOCATION_TOKENS
        | _DETAIL_TOKENS
        | _AREA_TOKENS
        | _CONTEXT_PREFIX_TOKENS
        | excluded_tokens
    )

    for index, fragment in enumerate(fragments):
        for original_token in _TOKEN_RE.findall(fragment):
            token = _normalized_key(original_token)

            if not token or token in ignored_tokens:
                continue

            occurrences.setdefault(token, set()).add(index)
            display_values[token] = original_token

    repeated = [
        token
        for token, indexes in occurrences.items()
        if len(indexes) >= 2
    ]

    if not repeated:
        return None

    selected = max(
        repeated,
        key=lambda token: (
            len(occurrences[token]),
            max(occurrences[token]),
        ),
    )
    return display_values[selected]


def _significant_context_tokens(
    values: list[Optional[str]],
) -> set[str]:
    ignored_tokens = (
        _GENERIC_LOCATION_TOKENS
        | _DETAIL_TOKENS
        | _AREA_TOKENS
        | _CONTEXT_PREFIX_TOKENS
    )

    return {
        token
        for value in values
        for token in _tokens(_clean_text(value))
        if (
            token not in ignored_tokens
            and not token.isdigit()
            and len(token) >= 3
        )
    }


def _build_query_candidates(
    address: str,
    city: Optional[str] = None,
    zip_code: Optional[str] = None,
    sector: Optional[str] = None,
    country: Optional[str] = None,
) -> tuple[
    list[str],
    set[str],
    set[str],
]:
    fragments = _deduplicate_parts(
        address.split(",")
    )

    sector_clean = _clean_text(sector).title()
    country_clean = _clean_text(country).title()
    city_clean = _clean_text(city)
    zip_clean = _clean_text(zip_code)

    sector_tokens = set(_tokens(sector_clean))
    country_tokens = set(_tokens(country_clean))
    excluded_context_tokens = (
        sector_tokens
        | country_tokens
    )

    specific_fragments = []

    for fragment in fragments:
        fragment_tokens = set(_tokens(fragment))

        if not fragment_tokens:
            continue

        if fragment_tokens <= (
            _GENERIC_LOCATION_TOKENS
            | excluded_context_tokens
        ):
            continue

        specific_fragments.append(fragment)

    ranked_fragments = sorted(
        enumerate(specific_fragments),
        key=lambda item: (
            _fragment_precision(item[1]),
            item[0],
        ),
        reverse=True,
    )

    detailed_fragments = [
        fragment
        for _, fragment in ranked_fragments[:2]
    ]

    locality = _repeated_locality(
        fragments,
        excluded_context_tokens,
    )

    context_match_tokens = (
        _significant_context_tokens([
            sector_clean,
            city_clean,
        ])
    )

    specific_match_tokens = (
        _significant_context_tokens([
            locality,
        ])
    )

    if not specific_match_tokens:
        specific_match_tokens = (
            _significant_context_tokens(
                specific_fragments
            )
        )

    context_parts = []

    if (
        city_clean
        and not set(_tokens(city_clean))
        <= _GENERIC_LOCATION_TOKENS
    ):
        context_parts.append(city_clean)

    if zip_clean:
        context_parts.append(zip_clean)

    if sector_clean:
        context_parts.append(sector_clean)

    if country_clean:
        context_parts.append(country_clean)

    # Users often paste the city and postcode into the free-form address while
    # leaving the dedicated city field empty.  Keep such generic locality
    # fragments as query context without treating them as sufficient evidence
    # on their own.
    for fragment in fragments:
        fragment_tokens = {
            token
            for token in _tokens(fragment)
            if not token.isdigit()
        }
        if (
            fragment_tokens
            and fragment_tokens <= _GENERIC_LOCATION_TOKENS
        ):
            context_parts.append(fragment)

    candidates = []

    def add_candidate(parts: list[str]) -> None:
        query = ", ".join(
            _deduplicate_parts(parts)
        )
        key = _normalized_key(query)

        if query and all(
            _normalized_key(existing) != key
            for existing in candidates
        ):
            candidates.append(query)

    # Preserve the complete address as the first attempt.  The previous
    # ranking kept only two fragments and could drop a city/postcode embedded
    # in the address field (a common field-service input pattern), making a
    # precise address less geocodable than an incomplete one.
    if specific_fragments:
        add_candidate([
            *fragments,
            *context_parts,
        ])

    if detailed_fragments:
        add_candidate([
            *detailed_fragments,
            *context_parts,
        ])

    area_fragment = (
        detailed_fragments[1]
        if len(detailed_fragments) > 1
        else (
            detailed_fragments[0]
            if detailed_fragments
            else None
        )
    )

    if area_fragment and locality:
        add_candidate([
            area_fragment,
            locality,
            *context_parts,
        ])

    if locality:
        add_candidate([
            locality,
            *context_parts,
        ])

    return (
        candidates,
        context_match_tokens,
        specific_match_tokens,
    )


def _valid_coordinates(
    latitude,
    longitude,
) -> bool:
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return False

    return (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
    )


def _has_reliable_coordinates(job: dict) -> bool:
    return (
        job.get("gps_source") in _RELIABLE_GPS_SOURCES
        and _valid_coordinates(
            job.get("latitude"),
            job.get("longitude"),
        )
    )


def _result_matches_context(
    result: dict,
    context_tokens: set[str],
    specific_tokens: set[str],
    expected_country_code: str,
) -> bool:
    if not isinstance(result, dict):
        return False

    address_data = result.get("address")
    if not isinstance(address_data, dict):
        address_data = {}

    result_country_code = (
        address_data.get("country_code")
        or result.get("country_code")
    )

    if (
        _normalized_key(
            str(result_country_code or "")
        )
        != _normalized_key(expected_country_code)
    ):
        return False

    text_values = [
        result.get("display_name"),
        *address_data.values(),
    ]

    ignored_tokens = (
        _GENERIC_LOCATION_TOKENS
        | _DETAIL_TOKENS
        | _AREA_TOKENS
        | _CONTEXT_PREFIX_TOKENS
    )

    result_tokens = {
        token
        for value in text_values
        if isinstance(value, str)
        for token in _tokens(value)
        if (
            token not in ignored_tokens
            and not token.isdigit()
            and len(token) >= 3
        )
    }

    if specific_tokens:
        return bool(
            result_tokens & specific_tokens
        )

    if context_tokens:
        return bool(
            result_tokens & context_tokens
        )

    return False


def _address_detail(
    result: dict,
    fields: tuple[str, ...],
) -> tuple[Optional[str], Optional[str]]:
    address_data = result.get("address")
    if not isinstance(address_data, dict):
        return None, None

    for field in fields:
        value = address_data.get(field)
        cleaned = _clean_text(value)
        if cleaned:
            return cleaned, field

    return None, None


def _classify_geocoding_precision(
    result: dict,
) -> str:
    result_class = _normalized_key(
        str(result.get("class") or "")
    )
    result_type = _normalized_key(
        str(result.get("type") or "")
    )
    address_type = _normalized_key(
        str(result.get("addresstype") or "")
    )

    result_types = {
        result_type,
        address_type,
    }

    if (
        result_class == "building"
        or result_types & _BUILDING_ADDRESS_TYPES
    ):
        return "building_or_address"

    if (
        result_class == "highway"
        or result_types & _STREET_ADDRESS_TYPES
    ):
        return "street"

    if result_types & _AREA_ADDRESS_TYPES:
        return "neighbourhood_or_area"

    if result_types & _LOCALITY_ADDRESS_TYPES:
        return "locality"

    try:
        place_rank = int(
            float(result.get("place_rank"))
        )
    except (TypeError, ValueError):
        return "unknown"

    if place_rank >= 28:
        return "building_or_address"
    if place_rank >= 26:
        return "street"
    if place_rank >= 16:
        return "neighbourhood_or_area"
    if place_rank > 0:
        return "locality"

    return "unknown"


def _geocode_query(
    query: str,
    settings,
) -> tuple[
    Optional[float],
    Optional[float],
    bool,
    bool,
    Optional[dict],
]:
    cached = _cache.get(query)

    if cached is not None:
        if (
            isinstance(cached, tuple)
            and len(cached) == 4
            and (
                cached[3] is None
                or isinstance(cached[3], dict)
            )
        ):
            latitude, longitude, resolved, result_data = (
                cached
            )
            return (
                latitude,
                longitude,
                resolved,
                False,
                result_data,
            )

        _cache.pop(query, None)

    request_made = False

    try:
        with httpx.Client(
            timeout=settings.GEOCODING_TIMEOUT
        ) as client:
            request_made = True
            response = client.get(
                settings.NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "addressdetails": 1,
                    "accept-language": "fr",
                    "countrycodes": (
                        settings.GEOCODING_COUNTRY_CODE
                    ),
                },
                headers={
                    "User-Agent": (
                        settings.GEOCODING_USER_AGENT
                    ),
                },
            )

            response.raise_for_status()
            results = response.json()

            if not isinstance(results, list):
                raise ValueError(
                    "Invalid Nominatim response."
                )

            if not results:
                cache_entry = (
                    None,
                    None,
                    False,
                    None,
                )
                _cache[query] = cache_entry
                return (
                    None,
                    None,
                    False,
                    True,
                    None,
                )

            result_data = results[0]

            if not isinstance(result_data, dict):
                raise ValueError(
                    "Invalid Nominatim result."
                )

            try:
                latitude = float(result_data["lat"])
                longitude = float(result_data["lon"])
            except (KeyError, TypeError, ValueError):
                latitude = None
                longitude = None

            resolved = _valid_coordinates(
                latitude,
                longitude,
            )

            cache_entry = (
                latitude,
                longitude,
                resolved,
                dict(result_data),
            )
            _cache[query] = cache_entry

            return (
                latitude,
                longitude,
                resolved,
                True,
                result_data,
            )

    except Exception:
        logger.warning(
            "Geocoding failed for %s",
            query,
        )
        return (
            None,
            None,
            False,
            request_made,
            None,
        )

    finally:
        if request_made:
            time.sleep(
                settings.GEOCODING_DELAY_SECONDS
            )


def _geocode_address_with_details(
    address: str,
    city: Optional[str] = None,
    zip_code: Optional[str] = None,
    sector: Optional[str] = None,
) -> tuple[
    Optional[float],
    Optional[float],
    bool,
    Optional[str],
    int,
    int,
    Optional[dict],
]:
    settings = get_settings()

    if not settings.GEOCODING_ENABLED:
        return None, None, False, None, 0, 0, None

    (
        candidates,
        context_match_tokens,
        specific_match_tokens,
    ) = _build_query_candidates(
        address,
        city,
        zip_code,
        sector,
        settings.GEOCODING_COUNTRY,
    )

    candidates_tried = 0
    http_requests = 0

    for query in candidates:
        candidates_tried += 1

        (
            latitude,
            longitude,
            resolved,
            request_made,
            result_data,
        ) = _geocode_query(
            query,
            settings,
        )

        if request_made:
            http_requests += 1

        if (
            resolved
            and result_data is not None
            and _result_matches_context(
                result_data,
                context_match_tokens,
                specific_match_tokens,
                settings.GEOCODING_COUNTRY_CODE,
            )
        ):
            return (
                latitude,
                longitude,
                True,
                query,
                candidates_tried,
                http_requests,
                result_data,
            )

        if resolved:
            logger.info(
                "Geocoding result rejected for query %s",
                query,
            )

    return (
        None,
        None,
        False,
        None,
        candidates_tried,
        http_requests,
        None,
    )


def geocode_address(
    address: str,
    city: Optional[str] = None,
    zip_code: Optional[str] = None,
    sector: Optional[str] = None,
) -> tuple[
    Optional[float],
    Optional[float],
    bool,
]:
    (
        latitude,
        longitude,
        resolved,
        _,
        _,
        _,
        _,
    ) = _geocode_address_with_details(
        address,
        city,
        zip_code,
        sector,
    )

    return latitude, longitude, resolved


def geocode_address_details(
    address: str,
    city: Optional[str] = None,
    zip_code: Optional[str] = None,
    sector: Optional[str] = None,
) -> dict:
    """Resolve a prepared address and expose safe structured suggestions.

    Suggestions are intentionally separate from persistence.  The caller may
    use them to fill missing office fields, but must never overwrite an
    explicit user value without confirmation.
    """
    (
        latitude,
        longitude,
        resolved,
        _,
        _,
        _,
        result_data,
    ) = _geocode_address_with_details(
        address,
        city,
        zip_code,
        sector,
    )

    response = {
        "resolved": bool(resolved),
        "latitude": latitude if resolved else None,
        "longitude": longitude if resolved else None,
        "city": None,
        "postal_code": None,
        "district": None,
        "precision": None,
        "display_name": None,
        "source": "nominatim" if resolved else None,
        "city_source": None,
        "postal_code_source": None,
        "district_source": None,
    }

    if not resolved or not isinstance(result_data, dict):
        return response

    resolved_city, city_source = _address_detail(
        result_data,
        _CITY_ADDRESS_FIELDS,
    )
    postal_code, postal_code_source = _address_detail(
        result_data,
        ("postcode",),
    )
    district, district_source = _address_detail(
        result_data,
        _DISTRICT_ADDRESS_FIELDS,
    )

    if resolved_city and len(resolved_city) > 100:
        resolved_city = None
        city_source = None
    if postal_code and len(postal_code) > 10:
        postal_code = None
        postal_code_source = None
    if district and len(district) > 100:
        district = None
        district_source = None

    response.update(
        {
            "city": resolved_city,
            "postal_code": postal_code,
            "district": district,
            "precision": _classify_geocoding_precision(result_data),
            "display_name": _clean_text(result_data.get("display_name")) or None,
            "city_source": (
                f"nominatim:{city_source}" if city_source else None
            ),
            "postal_code_source": (
                f"nominatim:{postal_code_source}"
                if postal_code_source
                else None
            ),
            "district_source": (
                f"nominatim:{district_source}" if district_source else None
            ),
        }
    )
    return response


def enrich_jobs_coordinates(
    jobs: list[dict],
) -> list[dict]:
    enriched = []

    for job in jobs:
        copy = dict(job)
        meta = dict(copy.get("_meta") or {})

        if _has_reliable_coordinates(copy):
            meta["geocoded"] = (
                copy.get("gps_source") == "geocoded"
            )
            meta.setdefault(
                "geocoding_query",
                None,
            )
            meta.setdefault(
                "geocoding_candidates_tried",
                0,
            )
            meta.setdefault(
                "geocoding_http_requests",
                0,
            )
            meta.setdefault(
                "geocoding_precision",
                None,
            )
            meta.setdefault(
                "geocoding_class",
                None,
            )
            meta.setdefault(
                "geocoding_type",
                None,
            )
            meta.setdefault(
                "geocoding_addresstype",
                None,
            )
            meta.setdefault(
                "geocoding_place_rank",
                None,
            )
            meta.setdefault(
                "geocoding_importance",
                None,
            )
            meta.setdefault(
                "geocoding_display_name",
                None,
            )
            meta.setdefault(
                "geocoding_city_source",
                None,
            )
            copy["_meta"] = meta
            enriched.append(copy)
            continue

        (
            latitude,
            longitude,
            resolved,
            geocoding_query,
            candidates_tried,
            http_requests,
            result_data,
        ) = _geocode_address_with_details(
            copy.get("service_address") or "",
            copy.get("service_city"),
            copy.get("service_zip"),
            copy.get("sector_raw"),
        )
        copy["latitude"] = latitude
        copy["longitude"] = longitude

        geocoding_precision = None
        geocoding_city_source = None

        if resolved:
            copy["gps_source"] = "geocoded"

            warnings = [
                warning
                for warning in (
                    copy.get("import_warnings") or []
                )
                if warning != (
                    "Aucun GPS Excel valide : "
                    "coordonnées temporaires estimées."
                )
            ]

            city, city_source = _address_detail(
                result_data,
                _CITY_ADDRESS_FIELDS,
            )
            if (
                not _clean_text(copy.get("service_city"))
                and city
                and len(city) <= 100
            ):
                copy["service_city"] = city
                geocoding_city_source = city_source

            postcode, _ = _address_detail(
                result_data,
                ("postcode",),
            )
            if (
                not _clean_text(copy.get("service_zip"))
                and postcode
                and len(postcode) <= 10
            ):
                copy["service_zip"] = postcode

            # A geocoder-confirmed neighbourhood is useful operational context,
            # but remains explicitly derived instead of replacing an Excel sector.
            neighbourhood, neighbourhood_source = _address_detail(
                result_data,
                _DISTRICT_ADDRESS_FIELDS,
            )
            if (
                not _clean_text(copy.get("sector_raw"))
                and neighbourhood
                and len(neighbourhood) <= 100
            ):
                copy["sector_raw"] = neighbourhood
                meta["sector_source"] = f"geocoded:{neighbourhood_source}"

            geocoding_precision = (
                _classify_geocoding_precision(
                    result_data,
                )
            )

            if geocoding_precision in {
                "neighbourhood_or_area",
                "locality",
            }:
                warning = (
                    "Localisation approximative au niveau "
                    "du quartier ou du secteur."
                )
                if warning not in warnings:
                    warnings.append(warning)

            copy["import_warnings"] = warnings
        else:
            copy["gps_source"] = None

            warnings = [
                warning
                for warning in (
                    copy.get("import_warnings") or []
                )
                if warning != (
                    "Aucun GPS Excel valide : "
                    "coordonnées temporaires estimées."
                )
            ]

            warning = (
                "Géocodage impossible : "
                "aucune coordonnée fiable."
            )
            if warning not in warnings:
                warnings.append(warning)

            copy["import_warnings"] = warnings

        meta["geocoded"] = resolved
        meta["geocoding_query"] = geocoding_query
        meta["geocoding_candidates_tried"] = (
            candidates_tried
        )
        meta["geocoding_http_requests"] = (
            http_requests
        )
        meta["geocoding_precision"] = (
            geocoding_precision
        )
        meta["geocoding_class"] = (
            result_data.get("class")
            if isinstance(result_data, dict)
            else None
        )
        meta["geocoding_type"] = (
            result_data.get("type")
            if isinstance(result_data, dict)
            else None
        )
        meta["geocoding_addresstype"] = (
            result_data.get("addresstype")
            if isinstance(result_data, dict)
            else None
        )
        meta["geocoding_place_rank"] = (
            result_data.get("place_rank")
            if isinstance(result_data, dict)
            else None
        )
        meta["geocoding_importance"] = (
            result_data.get("importance")
            if isinstance(result_data, dict)
            else None
        )
        meta["geocoding_display_name"] = (
            result_data.get("display_name")
            if isinstance(result_data, dict)
            else None
        )
        meta["geocoding_city_source"] = (
            geocoding_city_source
        )
        copy["_meta"] = meta

        enriched.append(copy)

    return enriched
