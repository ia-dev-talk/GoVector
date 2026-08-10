"""
Dashboard Service for FieldOpt
Aggregates real-time data and triggers WebSocket broadcasts

IMPORTANT — Gestion des sessions :
Chaque appel à broadcast_dashboard_update() doit créer SA PROPRE session.
NE JAMAIS réutiliser la session HTTP d'une route FastAPI.
NE JAMAIS appeler broadcast_dashboard_update() après db.commit() sur la même session.
"""
import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db, AsyncSessionLocal
from backend.services.realtime.kpi_calculator import KPICalculator
from backend.services.realtime.websocket_manager import ws_manager, WSEvent

logger = logging.getLogger(__name__)


class DashboardService:
    """
    Aggregates dashboard data and manages periodic broadcasts.

    Chaque appel à broadcast_dashboard_update() crée sa propre session
    pour éviter IllegalStateChangeError (concurrent operations on provisioning connection).
    Les appels broadcast_job_event / broadcast_tech_event / broadcast_notification
    ne nécessitent PAS de session (simple WebSocket).
    """

    def __init__(self, db: Optional[AsyncSession] = None):
        """
        Peut recevoir une session optionnelle pour les cas où
        on doit faire des requêtes synchronisées (ex: get_full_dashboard direct).
        Pour les broadcasts, on utilise toujours une session fraîche.
        """
        self.db = db
        self._kpi_calculator = KPICalculator(db) if db else None

    async def get_full_dashboard(self, target_date: Optional[date] = None) -> Dict:
        """Get the complete dashboard payload."""
        if not self.db:
            raise RuntimeError("DashboardService sans session — utiliser broadcast_dashboard_update()")
        return await self._kpi_calculator.get_dashboard_summary(target_date)

    async def get_orienteur_dashboard(self, orienteur_id: int, target_date: Optional[date] = None) -> Dict:
        """Get the dashboard payload for a specific orienteur (team view)."""
        if not self.db:
            raise RuntimeError("DashboardService sans session")
        return await self._kpi_calculator.get_orienteur_summary(orienteur_id, target_date)

    async def broadcast_dashboard_update(self, target_date: Optional[date] = None):
        """
        Recalculer et diffuser les données du Dashboard.
        Utilise SA PROPRE session pour éviter les conflits avec la session HTTP.
        """
        try:
            async with AsyncSessionLocal() as broadcast_db:
                kpi = KPICalculator(broadcast_db)
                data = await kpi.get_dashboard_summary(target_date)
                await ws_manager.broadcast(
                    WSEvent.DASHBOARD_UPDATE,
                    data,
                    room="dashboard",
                )
        except Exception as e:
            logger.error(f"Failed to broadcast dashboard update: {e}")

    async def broadcast_job_event(self, event_type: str, job_data: Dict):
        """Broadcast a job-related event. Aucune session DB nécessaire."""
        await ws_manager.broadcast(event_type, job_data)

    async def broadcast_tech_event(self, event_type: str, tech_data: Dict):
        """Broadcast a technician-related event. Aucune session DB nécessaire."""
        await ws_manager.broadcast(event_type, tech_data)

    async def broadcast_notification(self, notification: Dict):
        """Broadcast a new notification. Aucune session DB nécessaire."""
        await ws_manager.broadcast(WSEvent.NOTIFICATION, notification)


class DashboardBroadcaster:
    """
    Periodic broadcaster that sends dashboard updates at intervals.
    """

    def __init__(self, interval_seconds: int = 30):
        self.interval = interval_seconds
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """Start the periodic broadcast loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(f"Dashboard broadcaster started (interval={self.interval}s)")

    async def stop(self):
        """Stop the periodic broadcast loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("Dashboard broadcaster stopped")

    async def _loop(self):
        """Main loop: get a session, calculate, broadcast, sleep."""
        while self._running:
            try:
                async with AsyncSessionLocal() as db:
                    kpi = KPICalculator(db)
                    data = await kpi.get_dashboard_summary()
                    await ws_manager.broadcast(
                        WSEvent.DASHBOARD_UPDATE,
                        data,
                        room="dashboard",
                    )
            except Exception as e:
                logger.error(f"Broadcast loop error: {e}")
            await asyncio.sleep(self.interval)
