"""The FastAPI application, not legacy snapshots, owns the OpenAPI contract."""

from pathlib import Path

from backend.api.main import app


ROOT = Path(__file__).resolve().parents[2]


def test_runtime_python_never_consumes_legacy_openapi_snapshots():
    offenders = []
    for path in (ROOT / "backend").rglob("*.py"):
        if path == Path(__file__):
            continue
        source = path.read_text(encoding="utf-8")
        if "backend/openapi.json" in source or 'open("openapi.json"' in source:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_live_openapi_contains_canonical_workflow_contract_and_security():
    schema = app.openapi()
    global_path = schema["paths"]["/api/v1/workflow/capabilities"]["get"]
    job_path = schema["paths"][
        "/api/v1/workflow/jobs/{job_id}/capabilities"
    ]["get"]

    assert global_path["security"] == [{"OAuth2PasswordBearer": []}]
    assert job_path["security"] == [{"OAuth2PasswordBearer": []}]
    schemas = schema["components"]["schemas"]
    assert "WorkflowCapabilitiesResponse" in schemas
    assert "JobWorkflowCapabilitiesResponse" in schemas


def test_live_openapi_protects_manual_site_merge_operations():
    schema = app.openapi()
    candidates = schema["paths"][
        "/api/v1/job-actions/{job_id}/site-merge-candidates"
    ]["get"]
    merge = schema["paths"]["/api/v1/job-actions/{job_id}/site-merge"]["post"]

    assert candidates["security"] == [{"OAuth2PasswordBearer": []}]
    assert merge["security"] == [{"OAuth2PasswordBearer": []}]
    assert "SiteMergePayload" in schema["components"]["schemas"]


def test_live_openapi_protects_operational_audit_log():
    schema = app.openapi()
    audit = schema["paths"]["/api/v1/admin/v1/audit-events"]["get"]
    assert audit["security"] == [{"OAuth2PasswordBearer": []}]
