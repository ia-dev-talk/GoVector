"""
FTTH Network Layer Service for FieldOpt
Provides network element data for the smart map layers
"""
import logging
from typing import List, Dict, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import Job, Technician

logger = logging.getLogger(__name__)


# Simulated FTTH network elements (in production, these come from database/ftth_models.py)
# For now we derive from existing job data

class FTTHNetworkLayer:
    """
    Provides FTTH network data organized by layers for the smart map.
    Layers: NRO, SRO, PBO, PTO, Splitters, Fibre routes, Zones
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_job_positions(self) -> List[Dict]:
        """Get all job positions for the job layer."""
        result = await self.db.execute(
            select(Job).where(
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
        )
        jobs = result.scalars().all()
        return [
            {
                "id": f"job-{j.id}",
                "label": f"#{j.id} {j.customer_name[:20]}",
                "type": "PTO" if j.pto_raw else "job",
                "lat": j.latitude,
                "lng": j.longitude,
                "color": self._job_color(j.status.value if hasattr(j.status, 'value') else str(j.status)),
                "weight": 2.0,
                "metadata": {
                    "job_id": j.id,
                    "status": j.status.value if hasattr(j.status, 'value') else str(j.status),
                    "operator": j.operator,
                    "address": j.service_address[:40],
                    "customer": j.customer_name,
                    "pto": j.pto_raw,
                    "pbo": j.pbo_raw,
                    "nro": j.nro_raw,
                }
            }
            for j in jobs
        ]

    async def get_technician_positions(self) -> List[Dict]:
        """Get all technician current positions."""
        result = await self.db.execute(
            select(Technician).where(
                Technician.is_active == True,
                Technician.current_latitude.isnot(None),
                Technician.current_longitude.isnot(None),
            )
        )
        techs = result.scalars().all()
        return [
            {
                "id": f"tech-{t.id}",
                "label": t.name,
                "type": "technician",
                "lat": t.current_latitude,
                "lng": t.current_longitude,
                "color": self._tech_color(t.status.value if hasattr(t.status, 'value') else str(t.status)),
                "weight": 3.0,
                "metadata": {
                    "tech_id": t.id,
                    "name": t.name,
                    "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
                    "phone": t.phone,
                    "skills": t.skills or [],
                }
            }
            for t in techs
        ]

    async def get_nro_positions(self) -> List[Dict]:
        """Extract NRO positions from jobs."""
        result = await self.db.execute(
            select(
                Job.nro_raw.label("nro"),
                func.avg(Job.latitude).label("avg_latitude"),
                func.avg(Job.longitude).label("avg_longitude"),
                func.count(Job.id).label("count"),
            )
            .where(
                Job.nro_raw.isnot(None),
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
            .group_by(Job.nro_raw)
        )
        rows = result.all()
        return [
            {
                "id": f"nro-{i}",
                "label": row.nro,
                "type": "NRO",
                "lat": float(row.avg_latitude),
                "lng": float(row.avg_longitude),
                "color": "#ef4444",
                "weight": 5.0,
                "size": 14,
                "metadata": {
                    "nro": row.nro,
                    "job_count": row.count,
                }
            }
            for i, row in enumerate(rows)
            if row.nro and row.avg_latitude is not None and row.avg_longitude is not None
        ]

    async def get_pbo_positions(self) -> List[Dict]:
        """Extract PBO positions from jobs."""
        result = await self.db.execute(
            select(
                Job.pbo_raw.label("pbo"),
                func.avg(Job.latitude).label("avg_latitude"),
                func.avg(Job.longitude).label("avg_longitude"),
                func.count(Job.id).label("count"),
            )
            .where(
                Job.pbo_raw.isnot(None),
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
            .group_by(Job.pbo_raw)
        )
        rows = result.all()
        return [
            {
                "id": f"pbo-{i}",
                "label": row.pbo,
                "type": "PBO",
                "lat": float(row.avg_latitude),
                "lng": float(row.avg_longitude),
                "color": "#f59e0b",
                "weight": 3.0,
                "size": 10,
                "metadata": {
                    "pbo": row.pbo,
                    "job_count": row.count,
                }
            }
            for i, row in enumerate(rows)
            if row.pbo and row.avg_latitude is not None and row.avg_longitude is not None
        ]

    async def get_pto_positions(self) -> List[Dict]:
        """Extract PTO positions from jobs."""
        result = await self.db.execute(
            select(
                Job.pto_raw.label("pto"),
                Job.latitude,
                Job.longitude,
                Job.customer_name,
                Job.id,
            )
            .where(
                Job.pto_raw.isnot(None),
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
        )
        rows = result.all()
        return [
            {
                "id": f"pto-{row.id}",
                "label": row.pto or f"PTO-{row.id}",
                "type": "PTO",
                "lat": row.latitude,
                "lng": row.longitude,
                "color": "#22c55e",
                "weight": 2.0,
                "size": 8,
                "metadata": {
                    "pto": row.pto,
                    "customer": row.customer_name,
                    "job_id": row.id,
                }
            }
            for row in rows if row.pto
        ]

    async def get_splitter_positions(self) -> List[Dict]:
        """Extract splitter positions from jobs."""
        result = await self.db.execute(
            select(
                Job.splitter_raw.label("splitter"),
                func.avg(Job.latitude).label("avg_latitude"),
                func.avg(Job.longitude).label("avg_longitude"),
                func.count(Job.id).label("count"),
            )
            .where(
                Job.splitter_raw.isnot(None),
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
            .group_by(Job.splitter_raw)
        )
        rows = result.all()
        return [
            {
                "id": f"spl-{i}",
                "label": row.splitter,
                "type": "splitter",
                "lat": float(row.avg_latitude),
                "lng": float(row.avg_longitude),
                "color": "#8b5cf6",
                "weight": 2.5,
                "size": 9,
                "metadata": {
                    "splitter": row.splitter,
                    "job_count": row.count,
                }
            }
            for i, row in enumerate(rows)
            if row.splitter and row.avg_latitude is not None and row.avg_longitude is not None
        ]

    async def get_operator_zones(self) -> List[Dict]:
        """Calculate approximate operator zones from job distribution."""
        result = await self.db.execute(
            select(
                Job.operator,
                func.avg(Job.latitude).label("avg_latitude"),
                func.avg(Job.longitude).label("avg_longitude"),
                func.count(Job.id).label("count"),
            )
            .where(
                Job.operator.isnot(None),
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
            .group_by(Job.operator)
        )
        rows = result.all()
        return [
            {
                "id": f"zone-{row.operator.lower()}",
                "label": f"Zone {row.operator}",
                "type": "zone",
                "operator": row.operator,
                "lat": float(row.avg_latitude),
                "lng": float(row.avg_longitude),
                "radius_km": 5.0 + (row.count * 0.5),
                "color": self._operator_color(row.operator),
                "job_count": row.count,
            }
            for row in rows
            if row.operator and row.avg_latitude is not None and row.avg_longitude is not None
        ]

    async def get_heatmap_data(self) -> List[Dict]:
        """Get weighted points for heatmap generation."""
        points = []

        # Jobs as heat points
        result = await self.db.execute(
            select(Job).where(
                Job.latitude.isnot(None),
                Job.longitude.isnot(None),
            )
        )
        jobs = result.scalars().all()
        for j in jobs:
            points.append({
                "lat": j.latitude,
                "lng": j.longitude,
                "weight": 1.0 if j.status.value == "completed" else 2.0,
            })

        return points

    async def get_all_layers(self, layers: Optional[List[str]] = None) -> Dict:
        """Get all requested layers data."""
        import asyncio

        layer_map = {
            "jobs": self.get_job_positions,
            "technicians": self.get_technician_positions,
            "nro": self.get_nro_positions,
            "pbo": self.get_pbo_positions,
            "pto": self.get_pto_positions,
            "splitters": self.get_splitter_positions,
            "zones": self.get_operator_zones,
            "heatmap": self.get_heatmap_data,
        }

        if layers:
            selected = {k: layer_map[k] for k in layers if k in layer_map}
        else:
            selected = layer_map

        tasks = {name: func() for name, func in selected.items()}
        results = {}
        for name, coro in tasks.items():
            try:
                results[name] = await coro
            except Exception as e:
                logger.warning("Smart-map layer %s unavailable: %s", name, e)
                results[name] = []

        return results

    def _job_color(self, status: str) -> str:
        colors = {
            "pending": "#6b7280",
            "assigned": "#f59e0b",
            "in_progress": "#4f8ff7",
            "completed": "#22c55e",
            "cancelled": "#ef4444",
            "on_hold": "#8b5cf6",
        }
        return colors.get(status, "#6b7280")

    def _tech_color(self, status: str) -> str:
        colors = {
            "disponible": "#22c55e",
            "en_tache": "#4f8ff7",
            "en_route": "#f59e0b",
            "pause": "#8b5cf6",
            "hors_service": "#6b7280",
        }
        return colors.get(status, "#6b7280")

    def _operator_color(self, operator: str) -> str:
        colors = {
            "IAM": "#e91e63",
            "ORANGE": "#ff6f00",
            "INWI": "#d32f2f",
            "MAROC_TELECOM": "#1565c0",
        }
        return colors.get(operator.upper(), "#4f8ff7")
