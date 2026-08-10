"""
WebSocket Manager for FieldOpt
Manages real-time connections, broadcasting events to connected clients
"""
import asyncio
import json
import logging
from typing import Set, Dict, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Manages WebSocket connections and broadcasts.
    Supports rooms/channels for different data types.
    """

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._rooms: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, room: Optional[str] = None):
        """Accept a new WebSocket connection and optionally join a room."""
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
            if room:
                if room not in self._rooms:
                    self._rooms[room] = set()
                self._rooms[room].add(websocket)
        logger.info(f"WebSocket connected. Total: {len(self._connections)}")

    async def disconnect(self, websocket: WebSocket, room: Optional[str] = None):
        """Remove a WebSocket connection."""
        async with self._lock:
            self._connections.discard(websocket)
            if room and room in self._rooms:
                self._rooms[room].discard(websocket)
                if not self._rooms[room]:
                    del self._rooms[room]
        logger.info(f"WebSocket disconnected. Total: {len(self._connections)}")

    async def broadcast(self, event: str, data: Dict[str, Any], room: Optional[str] = None):
        """
        Broadcast an event to all connected clients or to a specific room.
        """
        message = json.dumps({
            "event": event,
            "data": data,
        }, default=str)

        async with self._lock:
            targets = self._rooms.get(room, self._connections) if room else self._connections
            disconnected = set()

            for ws in targets:
                try:
                    await ws.send_text(message)
                except Exception:
                    disconnected.add(ws)

            # Clean up disconnected clients
            for ws in disconnected:
                self._connections.discard(ws)
                for r in self._rooms.values():
                    r.discard(ws)

    async def broadcast_to_room(self, room: str, event: str, data: Dict[str, Any]):
        """Broadcast to a specific room only."""
        await self.broadcast(event, data, room=room)

    async def send_personal(self, websocket: WebSocket, event: str, data: Dict[str, Any]):
        """Send a message to a specific client."""
        try:
            message = json.dumps({
                "event": event,
                "data": data,
            }, default=str)
            await websocket.send_text(message)
        except Exception as e:
            logger.error(f"Failed to send personal message: {e}")

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Singleton instance
ws_manager = WebSocketManager()


# Event types constants
class WSEvent:
    """WebSocket event type constants."""
    DASHBOARD_UPDATE = "dashboard:update"
    JOB_CREATED = "job:created"
    JOB_UPDATED = "job:updated"
    JOB_ASSIGNED = "job:assigned"
    JOB_STARTED = "job:started"
    JOB_COMPLETED = "job:completed"
    JOB_CANCELLED = "job:cancelled"
    TECH_STATUS_CHANGED = "tech:status_changed"
    TECH_LOCATION_UPDATED = "tech:location_updated"
    INCIDENT_CREATED = "incident:created"
    INCIDENT_UPDATED = "incident:updated"
    NOTIFICATION = "notification:new"
    IMPORT_COMPLETED = "import:completed"
    SLA_BREACH = "sla:breach"
    ALERT = "alert:new"