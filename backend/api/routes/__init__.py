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
    tour,
)

# Import after stock_ftth: these modules intentionally extend the existing
# stock router with public-V2 custody transfer endpoints.
from . import stock_v2_patch  # noqa: E402,F401
from . import stock_v2_atomic  # noqa: E402,F401
