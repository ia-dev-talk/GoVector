"""
Geo Clustering Engine for FieldOpt
DBSCAN-style clustering for map markers, zone detection, intelligent grouping
"""
import math
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field


@dataclass
class GeoPoint:
    """A geographic point with metadata."""
    lat: float
    lng: float
    id: Any = None
    label: str = ""
    type: str = "point"
    weight: float = 1.0
    color: str = "#4f8ff7"
    metadata: Dict = field(default_factory=dict)


@dataclass
class GeoCluster:
    """A cluster of geographic points."""
    center_lat: float
    center_lng: float
    count: int
    points: List[GeoPoint] = field(default_factory=list)
    type: str = "cluster"
    avg_weight: float = 1.0
    bounds: Tuple[float, float, float, float] = (0, 0, 0, 0)  # min_lat, min_lng, max_lat, max_lng


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class GeoClusterEngine:
    """
    Intelligent geo-clustering engine.
    Groups nearby points into clusters based on distance and zoom level.
    """

    # Zoom level to distance threshold (km)
    ZOOM_DISTANCE_MAP: Dict[int, float] = {
        1: 500.0, 2: 300.0, 3: 150.0, 4: 80.0,
        5: 40.0, 6: 20.0, 7: 10.0, 8: 5.0,
        9: 2.5, 10: 1.5, 11: 0.8, 12: 0.4,
        13: 0.2, 14: 0.1, 15: 0.05, 16: 0.025,
        17: 0.012, 18: 0.006,
    }

    def __init__(self, zoom: int = 12):
        self.zoom = max(1, min(18, zoom))

    @property
    def distance_threshold_km(self) -> float:
        """Get the distance threshold for the current zoom level."""
        return self.ZOOM_DISTANCE_MAP.get(self.zoom, 1.0)

    def cluster_points(self, points: List[GeoPoint]) -> List[GeoCluster]:
        """
        Cluster points using a simple grid-based approach.
        More efficient than DBSCAN for large datasets.
        """
        if not points:
            return []

        threshold = self.distance_threshold_km

        # Grid-based clustering
        grid_size = threshold / math.sqrt(2)
        grid: Dict[str, List[GeoPoint]] = {}

        for pt in points:
            # Grid cell key
            cell_lat = round(pt.lat / grid_size) if grid_size > 0 else 0
            cell_lng = round(pt.lng / grid_size) if grid_size > 0 else 0
            key = f"{cell_lat}:{cell_lng}"

            if key not in grid:
                grid[key] = []
            grid[key].append(pt)

        # Merge nearby cells
        merged: Dict[str, List[GeoPoint]] = {}
        cell_keys = sorted(grid.keys())

        for key in cell_keys:
            parts = key.split(":")
            cell_lat, cell_lng = int(parts[0]), int(parts[1])

            # Check if this cell is adjacent to an existing merged cell
            merged_key = None
            for mkey in merged:
                mparts = mkey.split(":")
                mlat, mlng = int(mparts[0]), int(mparts[1])
                if abs(cell_lat - mlat) <= 1 and abs(cell_lng - mlng) <= 1:
                    merged_key = mkey
                    break

            if merged_key:
                merged[merged_key].extend(grid[key])
            else:
                merged[key] = grid[key]

        # Build clusters
        clusters = []
        for key, pts in merged.items():
            if len(pts) == 1:
                # Single point - can remain as individual marker
                pt = pts[0]
                clusters.append(GeoCluster(
                    center_lat=pt.lat,
                    center_lng=pt.lng,
                    count=1,
                    points=[pt],
                    avg_weight=pt.weight,
                    bounds=(pt.lat, pt.lng, pt.lat, pt.lng),
                ))
            else:
                # Multi-point cluster
                lats = [p.lat for p in pts]
                lngs = [p.lng for p in pts]
                weights = [p.weight for p in pts]

                clusters.append(GeoCluster(
                    center_lat=sum(lats) / len(lats),
                    center_lng=sum(lngs) / len(lngs),
                    count=len(pts),
                    points=pts,
                    avg_weight=sum(weights) / len(weights),
                    bounds=(min(lats), min(lngs), max(lats), max(lngs)),
                ))

        return clusters

    def get_cluster_color(self, cluster: GeoCluster) -> str:
        """Get color based on cluster size and weight."""
        if cluster.count >= 10:
            return "#ef4444"  # Large cluster
        elif cluster.count >= 5:
            return "#f59e0b"  # Medium cluster
        elif cluster.count >= 3:
            return "#4f8ff7"  # Small cluster
        else:
            return cluster.points[0].color if cluster.points else "#6b7280"

    def get_cluster_size(self, cluster: GeoCluster) -> int:
        """Get marker size for cluster."""
        base = 12
        if cluster.count >= 10:
            return base + 12
        elif cluster.count >= 5:
            return base + 8
        elif cluster.count >= 3:
            return base + 4
        return base

    def serialize_cluster(self, cluster: GeoCluster) -> Dict:
        """Serialize cluster to dict for API response."""
        return {
            "lat": round(cluster.center_lat, 6),
            "lng": round(cluster.center_lng, 6),
            "count": cluster.count,
            "is_cluster": cluster.count > 1,
            "avg_weight": round(cluster.avg_weight, 2),
            "color": self.get_cluster_color(cluster),
            "size": self.get_cluster_size(cluster),
            "bounds": {
                "min_lat": round(cluster.bounds[0], 6),
                "min_lng": round(cluster.bounds[1], 6),
                "max_lat": round(cluster.bounds[2], 6),
                "max_lng": round(cluster.bounds[3], 6),
            },
            "points": [
                {
                    "id": str(p.id),
                    "lat": round(p.lat, 6),
                    "lng": round(p.lng, 6),
                    "label": p.label,
                    "type": p.type,
                    "color": p.color,
                    "metadata": p.metadata,
                }
                for p in cluster.points
            ] if cluster.count <= 20 else [],  # Only include details for small clusters
        }