"""Reliable office geocoding helpers for work-order preparation."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from backend.auth.dependencies import require_orienteur
from backend.database.models import User
from backend.services.geocoding.nominatim import geocode_address


router = APIRouter(tags=["Geocoding"])


class GeocodingResolveRequest(BaseModel):
    address: str = Field(min_length=1, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    sector: str | None = Field(default=None, max_length=100)


@router.post("/resolve")
async def resolve_prepared_address(
    payload: GeocodingResolveRequest,
    _current_user: User = Depends(require_orienteur),
):
    """Return a coordinate only when Nominatim passes BlueVector's context checks."""
    latitude, longitude, resolved = await run_in_threadpool(
        geocode_address,
        payload.address.strip(),
        payload.city.strip() if payload.city else None,
        payload.postal_code.strip() if payload.postal_code else None,
        payload.sector.strip() if payload.sector else None,
    )
    return {
        "resolved": bool(resolved),
        "latitude": latitude if resolved else None,
        "longitude": longitude if resolved else None,
        "source": "nominatim" if resolved else None,
    }
