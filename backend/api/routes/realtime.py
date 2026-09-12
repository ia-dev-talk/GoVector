"""
Real-time WebSocket endpoint for FieldOpt
Provides live dashboard updates, job events, and notifications
"""
import json
import logging
from typing import Optional

from fastapi import (
    APIRouter,
    Query,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
    status,
)

from backend.auth.dependencies import get_current_user_ws
from backend.database.models import UserRole
from backend.services.realtime.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Real-time"])

ROOM_ROLE_PERMISSIONS = {
    None: {
        UserRole.ADMIN,
        UserRole.ORIENTEUR,
        UserRole.TECHNICIAN,
    },
    "dashboard": {
        UserRole.ADMIN,
        UserRole.ORIENTEUR,
        UserRole.TECHNICIAN,
    },
    "dispatch": {
        UserRole.ADMIN,
        UserRole.ORIENTEUR,
    },
    "admin": {
        UserRole.ADMIN,
    },
    "supervision": {
        UserRole.ADMIN,
        UserRole.ORIENTEUR,
    },
}


def can_join_room(role: UserRole, room: Optional[str]) -> bool:
    allowed_roles = ROOM_ROLE_PERMISSIONS.get(room)
    return allowed_roles is not None and role in allowed_roles


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    room: Optional[str] = Query(
        None,
        description="Room to join (dashboard, dispatch, admin, supervision)",
    ),
    token: Optional[str] = Query(
        None,
        description="JWT token for authentication",
    ),
):
    """
    WebSocket endpoint for real-time updates.

    Rooms:
    - dashboard: KPI updates, job status changes
    - dispatch: Assignment events, routing updates
    - admin: System events, import completions
    - supervision: Technician status and location updates
    - (none): Global events

    Events:
    - dashboard:update - KPI data refresh
    - job:created/updated/assigned/started/completed/cancelled
    - tech:status_changed/location_updated
    - notification:new
    - sla:breach
    - alert:new
    """
    if not token:
        await websocket.accept()
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Unauthorized",
        )
        return

    try:
        current_user = await get_current_user_ws(token)
    except WebSocketException:
        await websocket.accept()
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Unauthorized",
        )
        return
    except Exception:
        logger.exception(
            "Unexpected error during WebSocket authentication"
        )
        await websocket.accept()
        await websocket.close(
            code=status.WS_1011_INTERNAL_ERROR,
            reason="Internal server error",
        )
        return

    if not current_user.is_active:
        await websocket.accept()
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Unauthorized",
        )
        return

    room = room or None

    if not can_join_room(current_user.role, room):
        await websocket.accept()
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Forbidden room",
        )
        return

    manager_connection_attempted = False

    try:
        manager_connection_attempted = True
        await ws_manager.connect(websocket, room=room)

        while True:
            data = await websocket.receive_text()

            # Handle incoming messages (e.g., subscribe to rooms)
            try:
                msg = json.loads(data)
                action = msg.get("action")

                if action == "subscribe" and msg.get("room"):
                    new_room = msg["room"]

                    if (
                        not isinstance(new_room, str)
                        or not can_join_room(
                            current_user.role,
                            new_room,
                        )
                    ):
                        await websocket.close(
                            code=status.WS_1008_POLICY_VIOLATION,
                            reason="Forbidden room",
                        )
                        return

                    # Re-subscribe to a different room
                    async with ws_manager._lock:
                        if room and room in ws_manager._rooms:
                            ws_manager._rooms[room].discard(websocket)
                        if new_room not in ws_manager._rooms:
                            ws_manager._rooms[new_room] = set()
                        ws_manager._rooms[new_room].add(websocket)
                    room = new_room
                    await ws_manager.send_personal(
                        websocket,
                        "system:subscribed",
                        {"room": room},
                    )

                elif action == "ping":
                    await ws_manager.send_personal(
                        websocket,
                        "system:pong",
                        {},
                    )

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unexpected WebSocket error")
        try:
            await websocket.close(
                code=status.WS_1011_INTERNAL_ERROR,
                reason="Internal server error",
            )
        except RuntimeError:
            pass
    finally:
        if manager_connection_attempted:
            await ws_manager.disconnect(websocket, room=room)
