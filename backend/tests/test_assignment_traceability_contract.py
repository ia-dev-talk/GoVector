from datetime import datetime, timezone
from types import SimpleNamespace

from backend.api.schemas.jobs import (
    _current_assignment_assigned_at,
)
from backend.database.models import JobStatus
from backend.logic.workflow.engine import (
    _activity_action_for_transition,
    _activity_label_for_transition,
)


def test_current_assignment_exposes_assigned_at():
    assigned_at = datetime(
        2026,
        8,
        27,
        12,
        6,
        tzinfo=timezone.utc,
    )

    job = SimpleNamespace(
        assignment=SimpleNamespace(
            assigned_at=assigned_at,
        ),
    )

    assert (
        _current_assignment_assigned_at(job)
        == assigned_at
    )


def test_job_without_current_assignment_has_no_assigned_at():
    job = SimpleNamespace(
        assignment=None,
    )

    assert (
        _current_assignment_assigned_at(job)
        is None
    )


def test_manual_unassignment_is_not_creation():
    metadata = {
        "extra": {
            "source": "unassignment",
        }
    }

    assert (
        _activity_action_for_transition(
            JobStatus.PENDING,
            metadata,
        )
        == "unassigned"
    )

    assert (
        _activity_label_for_transition(
            JobStatus.PENDING,
            metadata,
        )
        == "Désaffectée"
    )


def test_reassignment_has_explicit_semantics():
    metadata = {
        "extra": {
            "source": "reassignment",
        }
    }

    assert (
        _activity_action_for_transition(
            JobStatus.PENDING,
            metadata,
        )
        == "unassigned"
    )

    assert (
        _activity_label_for_transition(
            JobStatus.PENDING,
            metadata,
        )
        == "Désaffectée pour réaffectation"
    )

    assert (
        _activity_action_for_transition(
            JobStatus.ASSIGNED,
            metadata,
        )
        == "reassigned"
    )

    assert (
        _activity_label_for_transition(
            JobStatus.ASSIGNED,
            metadata,
        )
        == "Réaffectée"
    )


def test_plain_pending_keeps_creation_semantics():
    assert (
        _activity_action_for_transition(
            JobStatus.PENDING,
            {},
        )
        == "pending"
    )

    assert (
        _activity_label_for_transition(
            JobStatus.PENDING,
            {},
        )
        == "Créée"
    )
