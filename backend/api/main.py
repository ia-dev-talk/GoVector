"""BlueVector main API application."""

import asyncio
import logging
import bcrypt
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Fix global du bug de compatibilité passlib/bcrypt
if not hasattr(bcrypt, "__about__"):
    class DummyAbout:
        __version__ = bcrypt.__version__

    bcrypt.__about__ = DummyAbout

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import get_settings
from backend.api.errors import install_business_error_handler
from backend.api.routes import (
    auth,
    technicians,
    jobs,
    job_actions,
    assignments,
    routing,
    simulation,
    interventions,
    import_excel,
    import_confirm,
    import_history,
    dashboard,
    realtime,
    smart_map,
    dispatch,
    export_center,
    ftth_network,
    incidents,
    tour,
    ai_assistant,
    stock,
    stock_ftth,
    supervision,
    reports,
    audit,
    orienteurs,
    sectors,
    tech_auth,
    tech_jobs,
    tech_history,
    tech_media,
    tech_ocr,
    tech_sync,
    workflow,
    seed,
    settings as app_settings,
    v1_admin,
    client_portal,
    job_context,
    geocoding,
)


logger = logging.getLogger(__name__)
settings = get_settings()


async def _daily_reseed_loop() -> None:
    """
    Wipe + reseed the demo DB once per UTC day at 04:00.
    """

    from backend.database.connection import reset_db
    from backend.database.seeds.seed_data import seed_all

    while True:
        now = datetime.now(timezone.utc)

        next_run = now.replace(
            hour=4,
            minute=0,
            second=0,
            microsecond=0,
        )

        if next_run <= now:
            next_run += timedelta(days=1)

        await asyncio.sleep((next_run - now).total_seconds())

        try:
            await reset_db()
            await seed_all()

            logger.info(
                "Daily reseed complete at %s",
                datetime.now(timezone.utc).isoformat(),
            )

        except Exception:
            logger.exception("Daily reseed failed")


async def _gps_retention_loop() -> None:
    """Enforce the administrator-approved raw GPS retention period daily."""

    from backend.database.connection import AsyncSessionLocal
    from backend.logic.gps_retention import purge_expired_gps_history

    while True:
        try:
            async with AsyncSessionLocal() as session:
                deleted = await purge_expired_gps_history(session)
                if deleted:
                    logger.info(
                        "GPS retention removed %s expired raw fixes",
                        deleted,
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("GPS retention enforcement failed")

        await asyncio.sleep(timedelta(days=1).total_seconds())


FRONTEND_DIST = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "dist"
)

SERVE_FRONTEND = (
    FRONTEND_DIST.is_dir()
    and (FRONTEND_DIST / "index.html").is_file()
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(
        f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} started"
    )

    print(
        f"📄 API Documentation: http://localhost:{settings.API_PORT}/docs"
    )

    reseed_task = None
    gps_retention_task = asyncio.create_task(
        _gps_retention_loop(),
        name="gps_retention",
    )

    if settings.IS_DEMO:

        print("🎬 IS_DEMO=true — simulation engine active")

        reseed_task = asyncio.create_task(
            _daily_reseed_loop(),
            name="daily_reseed",
        )

    yield

    from backend.simulation.loop import dispatch_loop

    dispatch_loop.stop()

    if reseed_task:
        reseed_task.cancel()

    gps_retention_task.cancel()
    try:
        await gps_retention_task
    except asyncio.CancelledError:
        pass

    # Fermer proprement le pool de connexions SQLAlchemy
    from backend.database.connection import engine
    await engine.dispose()
    print("🔌 Pool de connexions SQLAlchemy fermé")

    print(f"🛑 {settings.APP_NAME} shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    description="Open-source field service management system",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

install_business_error_handler(app)


uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)

app.mount(
    "/uploads",
    StaticFiles(directory="uploads"),
    name="uploads",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


if not SERVE_FRONTEND:

    @app.get("/")
    async def root():
        return {
            "message": f"Welcome to {settings.APP_NAME} API",
            "version": settings.APP_VERSION,
            "docs": "/docs",
            "status": "operational",
        }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
    }


# =====================================================
# ROUTERS
# =====================================================

app.include_router(
    tech_auth.router,
    prefix=f"{settings.API_V1_PREFIX}/tech",
    tags=["Technician Auth (Mobile)"],
)


app.include_router(
    auth.router,
    prefix=f"{settings.API_V1_PREFIX}/auth",
    tags=["Authentication"],
)

app.include_router(
    tech_ocr.router,
    prefix=f"{settings.API_V1_PREFIX}/tech",
    tags=["Technician OCR (Mobile)"],
)

app.include_router(
    tech_sync.router,
    prefix=f"{settings.API_V1_PREFIX}/tech",
    tags=["Technician Sync (Mobile)"],
)

app.include_router(
    tech_media.router,
    prefix=f"{settings.API_V1_PREFIX}/tech",
    tags=["Technician Media (Mobile)"],
)

app.include_router(
    tech_history.router,
    prefix=f"{settings.API_V1_PREFIX}/tech",
    tags=["Technician History (Mobile)"],
)

app.include_router(
    tech_jobs.router,
    prefix=f"{settings.API_V1_PREFIX}/tech/jobs",
    tags=["Technician Jobs (Mobile)"],
)

app.include_router(
    workflow.router,
    prefix=f"{settings.API_V1_PREFIX}/workflow",
    tags=["Workflow Capabilities"],
)

app.include_router(
    seed.router,
    prefix=f"{settings.API_V1_PREFIX}/seed",
    tags=["Development Seed"],
)

app.include_router(
    interventions.router,
    prefix=f"{settings.API_V1_PREFIX}/interventions",
    tags=["Interventions"],
)

app.include_router(
    technicians.router,
    prefix=f"{settings.API_V1_PREFIX}/technicians",
    tags=["Technicians"],
)

app.include_router(
    jobs.router,
    prefix=f"{settings.API_V1_PREFIX}/jobs",
    tags=["Jobs"],
)

app.include_router(
    v1_admin.router,
    prefix=f"{settings.API_V1_PREFIX}/admin/v1",
    tags=["V1 Administration"],
)

app.include_router(
    client_portal.router,
    prefix=f"{settings.API_V1_PREFIX}/client/v1",
    tags=["Client Portal"],
)

app.include_router(
    job_context.router,
    prefix=f"{settings.API_V1_PREFIX}/job-actions",
    tags=["V1 Job Context"],
)

app.include_router(
    geocoding.router,
    prefix=f"{settings.API_V1_PREFIX}/geocoding",
    tags=["Geocoding"],
)

# =====================================================
# JOB ACTIONS (Réaffectation, Report, Duplication, etc.)
# =====================================================

app.include_router(
    job_actions.router,
    prefix=f"{settings.API_V1_PREFIX}/job-actions",
    tags=["Job Actions"],
)

app.include_router(
    assignments.router,
    prefix=f"{settings.API_V1_PREFIX}/assignments",
    tags=["Assignments"],
)

app.include_router(
    routing.router,
    prefix=f"{settings.API_V1_PREFIX}/routing",
    tags=["Routing"],
)

app.include_router(
    simulation.router,
    prefix=f"{settings.API_V1_PREFIX}/simulation",
    tags=["Simulation"],
)

# =====================================================
# DASHBOARD & REALTIME
# =====================================================

app.include_router(
    dashboard.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Dashboard"],
)

app.include_router(
    realtime.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Real-time"],
)

# =====================================================
# DISPATCH
# =====================================================

app.include_router(
    dispatch.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Dispatch"],
)

# =====================================================
# TOUR MANAGEMENT
# =====================================================

app.include_router(
    tour.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Tour Management"],
)

# =====================================================
# FTTH NETWORK
# =====================================================

app.include_router(
    ftth_network.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["FTTH Network"],
)

# =====================================================
# INCIDENT MANAGEMENT
# =====================================================

app.include_router(
    incidents.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Incident Management"],
)

# =====================================================
# AI ASSISTANT
# =====================================================

app.include_router(
    ai_assistant.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["AI Assistant"],
)

# =====================================================
# REPORTS
# =====================================================

# Ancien endpoint /reports/export a été remplacé par /reports/export/advanced
# Les routes /reports/jobs, /reports/technicians, etc. sont obsolètes et commentées dans reports.py
app.include_router(
    reports.router,
    prefix=f"{settings.API_V1_PREFIX}/reports",
    tags=["Reports"],
)

# =====================================================
# STOCK MANAGEMENT
# =====================================================

app.include_router(
    stock.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Stock Management"],
)

# =====================================================
# STOCK FTTH
# =====================================================

app.include_router(
    stock_ftth.router,
    tags=["Stock FTTH"],
)

app.include_router(
    stock_ftth.simple_router,
    tags=["Stock"],
)

# =====================================================
# AUDIT & SECURITY
# =====================================================

app.include_router(
    audit.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Audit & Security"],
)

# =====================================================
# ORIENTEURS (Gestion des équipes)
# =====================================================

app.include_router(
    orienteurs.router,
    prefix=f"{settings.API_V1_PREFIX}/orienteurs",
    tags=["Orienteurs"],
)

# =====================================================
# SECTORS (Gestion des secteurs géographiques)
# =====================================================

app.include_router(
    sectors.router,
    prefix=f"{settings.API_V1_PREFIX}/sectors",
    tags=["Sectors"],
)


# =====================================================
# SUPERVISION TEMPS RÉEL (Sprint 7)
# =====================================================

app.include_router(
    supervision.router,
    prefix=f"{settings.API_V1_PREFIX}/supervision",
    tags=["Supervision Temps Réel"],
)

# =====================================================
# EXPORT CENTER
# =====================================================

app.include_router(
    export_center.router,
    prefix=f"{settings.API_V1_PREFIX}",
    tags=["Export Center"],
)

# =====================================================
# IMPORT EXCEL
# =====================================================

app.include_router(
    import_excel.router,
    prefix=f"{settings.API_V1_PREFIX}/import",
    tags=["Excel Import"],
)

app.include_router(
    import_confirm.router,
    prefix=f"{settings.API_V1_PREFIX}/import",
    tags=["Excel Import"],
)

app.include_router(
    import_history.router,
    prefix=f"{settings.API_V1_PREFIX}/import",
    tags=["Excel Import"],
)


# =====================================================
# APPLICATION SETTINGS
# =====================================================

app.include_router(
    app_settings.router,
    prefix=f"{settings.API_V1_PREFIX}/settings",
    tags=["Application Settings"],
)

# =====================================================
# FRONTEND
# =====================================================

if SERVE_FRONTEND:

    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):

        candidate = FRONTEND_DIST / full_path

        if full_path and candidate.is_file():
            return FileResponse(candidate)

        return FileResponse(
            FRONTEND_DIST / "index.html"
        )


if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "backend.api.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_RELOAD,
    )
