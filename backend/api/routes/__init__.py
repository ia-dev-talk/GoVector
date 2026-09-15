# API routes package initialization
from . import (
    ai_assistant,
    audit,
    assignments,
    auth,
    dashboard,
    dispatch,
    export_center,
    feedback,
    ftth_network,
    import_confirm,
    import_excel,
    import_history,
    incidents,
    interventions,
    jobs,
    orienteurs,
    realtime,
    reports,
    routing,
    sectors,
    simulation,
    smart_map,
    stock,
    stock_ftth,
    supervision,
    technicians,
    tech_auth,
    tech_jobs,
    tech_history,
    tech_ocr,
    territories,
    tour,
)

audit.router.include_router(feedback.router)

# Delivery-safe extensions. They are mounted under existing canonical routers
# so backend/api/main.py keeps a single registration surface.
from . import operational_jobs  # noqa: E402
from . import sector_tools  # noqa: E402
from . import import_confirm_fix  # noqa: E402
jobs.router.include_router(operational_jobs.router)
territories.router.include_router(sector_tools.router)
# main.py registers import_excel before the historical import_confirm router;
# this resilient /confirm endpoint therefore handles the request first.
import_excel.router.include_router(import_confirm_fix.router)

from . import stock_v2_patch  # noqa: E402,F401
from . import stock_v2_atomic  # noqa: E402,F401
from . import stock_history_v2  # noqa: E402,F401
from . import warehouse_admin_v2  # noqa: E402,F401
from . import tech_stock_v2  # noqa: E402,F401
from . import tech_serialized_custody  # noqa: E402,F401
from . import job_stock_v2  # noqa: E402,F401
from . import orienteur_agent_context  # noqa: E402,F401
from . import magillan_report  # noqa: E402,F401
