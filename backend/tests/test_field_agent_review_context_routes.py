from backend.api.routes.orienteur_agent import router


def _route_paths() -> set[str]:
    return {route.path for route in router.routes}


def test_field_agent_review_context_routes_are_registered():
    paths = _route_paths()

    assert "/orienteur-agent/me/jobs/{job_id}/field-record" in paths
    assert "/orienteur-agent/me/jobs/{job_id}/stock-context" in paths


def test_field_agent_review_context_never_reuses_global_job_routes():
    paths = _route_paths()

    assert "/orienteur-agent/me/jobs/{job_id}/field-record" in paths
    assert "/orienteur-agent/me/jobs/{job_id}/stock-context" in paths
    assert "/jobs/{job_id}/field-record" not in paths
    assert "/stock/job-context/{job_id}" not in paths
