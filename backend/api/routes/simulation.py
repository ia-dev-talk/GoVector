"""
Simulation control endpoints and WebSocket broadcaster.

All simulation endpoints are registered only when IS_DEMO=true.
REST control endpoints require authenticated active users.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
)
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user, get_current_user_ws
from backend.config import get_settings
from backend.database.models import User, UserRole
from backend.simulation.broadcaster import manager
from backend.simulation.clock import clock, ClockMode
from backend.simulation.loop import dispatch_loop
from backend.simulation.strategy import MLStrategy


logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

MAX_SIMULATION_SPEED = 1000.0


class StartRequest(BaseModel):
    virtual_start: datetime | None = None
    speed: float = Field(
        default=500.0,
        gt=0,
        le=MAX_SIMULATION_SPEED,
    )


class SpeedRequest(BaseModel):
    speed: float = Field(
        gt=0,
        le=MAX_SIMULATION_SPEED,
    )


async def _require_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active account required",
        )
    return current_user


async def _require_active_admin(
    current_user: User = Depends(_require_active_user),
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user


if settings.IS_DEMO:

    @router.websocket("/ws")
    async def simulation_ws(ws: WebSocket):
        """Stream DispatchEvents to authenticated active users."""
        token = ws.query_params.get("token")
        if not token:
            await ws.close(
                code=1008,
                reason="Authentication required",
            )
            return

        try:
            current_user = await get_current_user_ws(token)
        except WebSocketException as exc:
            await ws.close(
                code=exc.code,
                reason="Authentication required",
            )
            return
        except Exception:
            logger.exception(
                "Unexpected simulation WebSocket authentication error"
            )
            await ws.close(
                code=1011,
                reason="Internal server error",
            )
            return

        if not current_user.is_active:
            await ws.close(
                code=1008,
                reason="Active account required",
            )
            return

        try:
            await manager.connect(ws)
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception(
                "Unexpected simulation WebSocket connection error"
            )
            try:
                await ws.close(
                    code=1011,
                    reason="Internal server error",
                )
            except Exception:
                logger.debug(
                    "Simulation WebSocket was already closed",
                    exc_info=True,
                )
        finally:
            manager.disconnect(ws)

    @router.post("/start")
    async def sim_start(
        req: StartRequest,
        _current_user: User = Depends(_require_active_admin),
    ):
        virtual_start = req.virtual_start or datetime.now(
            timezone.utc
        ).replace(
            hour=8,
            minute=0,
            second=0,
            microsecond=0,
        )

        if (
            virtual_start.tzinfo is None
            or virtual_start.utcoffset() is None
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="virtual_start must be timezone-aware",
            )

        try:
            from backend.database.connection import reset_db
            from backend.database.seeds.seed_data import seed_all

            dispatch_loop.stop()
            await reset_db()
            await seed_all()
            clock.start_simulation(
                virtual_start,
                speed=req.speed,
            )
            dispatch_loop.start(
                MLStrategy(),
                on_events=manager.broadcast_events,
            )
            return {
                "status": "started",
                "virtual_start": virtual_start.isoformat(),
                "speed": req.speed,
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Unexpected error while starting simulation"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to start simulation",
            )

    @router.post("/pause")
    async def sim_pause(
        _current_user: User = Depends(_require_active_admin),
    ):
        try:
            clock.pause()
            return {
                "status": "paused",
                "virtual_time": clock.now().isoformat(),
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Unexpected error while pausing simulation"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to pause simulation",
            )

    @router.post("/resume")
    async def sim_resume(
        _current_user: User = Depends(_require_active_admin),
    ):
        try:
            clock.resume()
            return {
                "status": "resumed",
                "virtual_time": clock.now().isoformat(),
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Unexpected error while resuming simulation"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to resume simulation",
            )

    @router.post("/stop")
    async def sim_stop(
        _current_user: User = Depends(_require_active_admin),
    ):
        try:
            dispatch_loop.stop()
            clock.use_real_time()
            return {"status": "stopped"}
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Unexpected error while stopping simulation"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to stop simulation",
            )

    @router.post("/speed")
    async def sim_set_speed(
        req: SpeedRequest,
        _current_user: User = Depends(_require_active_admin),
    ):
        if clock.mode != ClockMode.SIMULATED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Simulation not running",
            )

        try:
            clock.set_speed(req.speed)
            return {
                "status": "ok",
                "speed": req.speed,
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Unexpected error while changing simulation speed"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to change simulation speed",
            )

    @router.get("/status")
    async def sim_status(
        _current_user: User = Depends(_require_active_user),
    ):
        try:
            return {
                "is_demo": settings.IS_DEMO,
                "mode": clock.mode,
                "speed": clock.speed,
                "is_paused": clock.is_paused,
                "loop_running": dispatch_loop.is_running,
                "virtual_time": clock.now().isoformat(),
                "ws_clients": manager.connection_count,
            }
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Unexpected error while reading simulation status"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to read simulation status",
            )
