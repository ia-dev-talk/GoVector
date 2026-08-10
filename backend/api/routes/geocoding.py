"""Reliable office geocoding helpers for work-order preparation."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.auth.dependencies import require_orienteur
from backend.database.models import User
from backend.services.geocoding.nominatim import geocode_address_details


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
