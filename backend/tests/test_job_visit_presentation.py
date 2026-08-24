from types import SimpleNamespace

from backend.api.routes.job_context import _visit_is_current, _visit_status_label


def test_old_open_visit_is_historical_when_active_assignment_changed_technician():
    legacy_karim_visit = SimpleNamespace(
        id=10,
        ended_at=None,
        primary_technician_id=1,
    )
    khadija_assignment = SimpleNamespace(
        visit_id=None,
        technician_id=2,
    )

    assert _visit_is_current(legacy_karim_visit, khadija_assignment) is False


def test_only_visit_linked_to_active_assignment_is_current():
    current_visit = SimpleNamespace(
        id=11,
        ended_at=None,
        primary_technician_id=2,
    )
    current_assignment = SimpleNamespace(
        visit_id=11,
        technician_id=2,
    )

    assert _visit_is_current(current_visit, current_assignment) is True
    assert _visit_status_label("reassigned") == "Réaffecté"
