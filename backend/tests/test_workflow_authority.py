"""Contract tests for the single authoritative operational workflow engine."""

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OPERATIONAL_MODULES = (
    "backend/logic/jobs.py",
    "backend/logic/assignments.py",
    "backend/api/routes/job_actions.py",
    "backend/simulation/loop.py",
)


def _direct_status_writes(relative_path: str) -> list[int]:
    tree = ast.parse((ROOT / relative_path).read_text(encoding="utf-8"))
    lines: list[int] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            if isinstance(target, ast.Attribute) and target.attr == "status":
                if isinstance(target.value, ast.Name) and target.value.id == "job":
                    lines.append(node.lineno)
    return lines


def test_operational_modules_never_write_job_status_directly():
    offenders = {
        path: _direct_status_writes(path)
        for path in OPERATIONAL_MODULES
        if _direct_status_writes(path)
    }
    assert offenders == {}


def test_legacy_status_helper_delegates_to_workflow_engine():
    source = (ROOT / "backend/logic/jobs.py").read_text(encoding="utf-8")
    function = ast.parse(source).body
    update = next(
        node
        for node in function
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == "update_job_status"
    )
    calls = [
        node
        for node in ast.walk(update)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "transition_job"
    ]
    assert len(calls) == 1


def test_simulation_and_postpone_use_workflow_engine():
    for path in ("backend/simulation/loop.py", "backend/api/routes/job_actions.py"):
        source = (ROOT / path).read_text(encoding="utf-8")
        assert "WorkflowEngine" in source
        assert ".transition_job(" in source


def test_only_mobile_technician_client_owns_the_start_command():
    """Office clients must not call the legacy start endpoint.

    Starting a field visit is an assigned-technician command. The Web prepares
    and assigns the intervention; Flutter executes the canonical tech route.
    """

    web_sources = [
        *(ROOT / "frontend/src").rglob("*.js"),
        *(ROOT / "frontend/src").rglob("*.jsx"),
    ]
    web_offenders = [
        str(path.relative_to(ROOT))
        for path in web_sources
        if "api.startJob" in path.read_text(encoding="utf-8")
    ]
    assert web_offenders == []

    api_service = (
        ROOT / "mobile_app/lib/services/api_service.dart"
    ).read_text(encoding="utf-8")
    assert "AppConfig.apiUri('jobs/$id/start')" not in api_service

    intervention_service = (
        ROOT / "mobile_app/lib/services/intervention_service.dart"
    ).read_text(encoding="utf-8")
    assert "AppConfig.apiUri('tech/jobs/$jobId/start')" in intervention_service
