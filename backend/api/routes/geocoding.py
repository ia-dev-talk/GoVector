"""Reliable office geocoding helpers for work-order preparation."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.auth.dependencies import require_orienteur
from backend.database.models import User
from backend.services.geocoding.nominatim import geocode_address_details
from backend.services.geocoding.shared_map import (
    SharedMapLocationError,
    resolve_shared_map_location,
)
from backend.config import get_settings


router = APIRouter(tags=["Geocoding"])


class GeocodingResolveRequest(BaseModel):
    address: str = Field(min_length=1, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    sector: str | None = Field(default=None, max_length=100)


class GeocodingResolveResponse(BaseModel):
    resolved: bool
    latitude: float | None = None
    longitude: float | None = None
    city: str | None = None
    postal_code: str | None = None
    district: str | None = None
    precision: str | None = None
    display_name: str | None = None
    source: str | None = None
    city_source: str | None = None
    postal_code_source: str | None = None
    district_source: str | None = None


class SharedMapLocationRequest(BaseModel):
    value: str = Field(min_length=3, max_length=2048)


class SharedMapLocationResponse(BaseModel):
    resolved: bool
    latitude: float
    longitude: float
    source: str
    precision: str


@router.post("/resolve", response_model=GeocodingResolveResponse)
async def resolve_prepared_address(
    payload: GeocodingResolveRequest,
    _current_user: User = Depends(require_orienteur),
):
    """Return reliable coordinates and non-destructive address suggestions."""
    return await run_in_threadpool(
        geocode_address_details,
        payload.address.strip(),
        payload.city.strip() if payload.city else None,
        payload.postal_code.strip() if payload.postal_code else None,
        payload.sector.strip() if payload.sector else None,
    )


@router.post("/shared-map-location", response_model=SharedMapLocationResponse)
async def import_shared_map_location(
    payload: SharedMapLocationRequest,
    _current_user: User = Depends(require_orienteur),
):
    """Import a user-confirmed Google Maps share link or coordinate pair.

    No Google search API is called and no page content is scraped. Short
    official share links are expanded through allow-listed HTTPS redirects.
    """
    try:
        return await run_in_threadpool(
            resolve_shared_map_location,
            payload.value,
            timeout=get_settings().GEOCODING_TIMEOUT,
        )
    except SharedMapLocationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Google Maps est momentanément inaccessible. Collez directement latitude, longitude.",
        ) from exc
