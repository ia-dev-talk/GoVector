# API routes package initialization
from . import (
    ai_assistant,
    audit,
    assignments,
    auth,
    dashboard,
    dispatch,
    export_center,
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

# Import after the base routers: these modules intentionally extend existing
# routers with public-V2 connected workflows.
from . import stock_v2_patch  # noqa: E402,F401
from . import stock_v2_atomic  # noqa: E402,F401
from . import stock_history_v2  # noqa: E402,F401
from . import tech_stock_v2  # noqa: E402,F401
from . import job_stock_v2  # noqa: E402,F401
