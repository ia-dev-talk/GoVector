"""
Smart Map API Routes for FieldOpt
Endpoints for map layers, clustering, heatmap, and search
"""
import logging
from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.auth.dependencies import require_orienteur
from backend.database.models import User
from backend.logic.mapping.ftth_network_layer import FTTHNetworkLayer
from backend.logic.mapping.geo_clustering import GeoClusterEngine, GeoPoint, _haversine_km

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Smart Map"])


@router.get("/map/layers")
async def get_map_layers(
    layers: Optional[str] = Query(None, description="Comma-separated layer names: jobs,technicians,nro,pbo,pto,splitters,zones,heatmap"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get all requested map layers data."""
    layer_list = None
    if layers:
        layer_list = [l.strip() for l in layers.split(",") if l.strip()]

    network = FTTHNetworkLayer(db)
    data = await network.get_all_layers(layer_list)
    return {"layers": data}


@router.get("/map/clusters")
async def get_map_clusters(
    lat: float = Query(33.5731, description="Center latitude"),
    lng: float = Query(-7.5898, description="Center longitude"),
    zoom: int = Query(12, ge=1, le=18, description="Zoom level"),
    radius_km: Optional[float] = Query(None, description="Search radius in km"),
    layer: Optional[str] = Query("jobs", description="Layer to cluster: jobs, technicians, nro, pbo, pto"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get clustered map points for a given layer at a given zoom level."""
    network = FTTHNetworkLayer(db)

    # Get raw points for the requested layer
    layer_map = {
        "jobs": network.get_job_positions,
        "technicians": network.get_technician_positions,
        "nro": network.get_nro_positions,
        "pbo": network.get_pbo_positions,
        "pto": network.get_pto_positions,
        "splitters": network.get_splitter_positions,
    }

    fetcher = layer_map.get(layer)
    if not fetcher:
        return {"clusters": [], "error": f"Unknown layer: {layer}"}

    raw_points = await fetcher()

    # Convert to GeoPoints
    geo_points = []
    for pt in raw_points:
        # Filter by radius if specified
        if radius_km:
            dist = _haversine_km(lat, lng, pt["lat"], pt["lng"])
            if dist > radius_km:
                continue

        geo_points.append(GeoPoint(
            lat=pt["lat"],
            lng=pt["lng"],
            id=pt.get("id"),
            label=pt.get("label", ""),
            type=pt.get("type", "point"),
            weight=pt.get("weight", 1.0),
            color=pt.get("color", "#4f8ff7"),
            metadata=pt.get("metadata", {}),
        ))

    # Cluster
    engine = GeoClusterEngine(zoom=zoom)
    clusters = engine.cluster_points(geo_points)

    return {
        "clusters": [engine.serialize_cluster(c) for c in clusters],
        "total_points": len(geo_points),
        "cluster_count": len(clusters),
        "zoom": zoom,
        "threshold_km": engine.distance_threshold_km,
    }


@router.get("/map/search")
async def search_on_map(
    q: str = Query(..., description="Search query"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Search for jobs, technicians, PTOs, NROs on the map."""
    network = FTTHNetworkLayer(db)
    q = q.lower().strip()

    if not q:
        return {"results": []}

    results = []

    # Search jobs
    jobs = await network.get_job_positions()
    for j in jobs:
        meta = j.get("metadata", {})
        if (q in meta.get("customer", "").lower() or
            q in meta.get("address", "").lower() or
            q in str(meta.get("job_id", "")) or
            q in j.get("label", "").lower()):
            results.append({**j, "layer": "jobs"})

    # Search technicians
    techs = await network.get_technician_positions()
    for t in techs:
        meta = t.get("metadata", {})
        if q in meta.get("name", "").lower():
            results.append({**t, "layer": "technicians"})

    # Search PTOs
    ptos = await network.get_pto_positions()
    for p in ptos:
        meta = p.get("metadata", {})
        if (q in meta.get("pto", "").lower() or
            q in meta.get("customer", "").lower()):
            results.append({**p, "layer": "ptos"})

    # Search NROs
    nros = await network.get_nro_positions()
    for n in nros:
        meta = n.get("metadata", {})
        if q in meta.get("nro", "").lower():
            results.append({**n, "layer": "nros"})

    return {"results": results}


@router.get("/map/bounds")
async def get_layer_bounds(
    layer: Optional[str] = Query("jobs", description="Layer name"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_orienteur),
):
    """Get geographic bounds for a layer (to auto-fit map)."""
    network = FTTHNetworkLayer(db)

    layer_map = {
        "jobs": network.get_job_positions,
        "technicians": network.get_technician_positions,
        "nro": network.get_nro_positions,
        "pbo": network.get_pbo_positions,
        "pto": network.get_pto_positions,
    }

    fetcher = layer_map.get(layer)
    if not fetcher:
        return {"bounds": None}

    points = await fetcher()
    if not points:
        return {"bounds": None}

    lats = [p["lat"] for p in points]
    lngs = [p["lng"] for p in points]

    return {
        "bounds": {
            "min_lat": min(lats),
            "min_lng": min(lngs),
            "max_lat": max(lats),
            "max_lng": max(lngs),
        },
        "center": {
            "lat": sum(lats) / len(lats),
            "lng": sum(lngs) / len(lngs),
        },
        "count": len(points),
    }
