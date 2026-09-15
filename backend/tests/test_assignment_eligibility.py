from datetime import datetime, timezone
from types import SimpleNamespace

from backend.database.models import TechnicianStatus
from backend.logic.assignments import _assignment_interval, assignment_profile_errors


def _job(**values):
    defaults = {
        "sector_id": 4,
        "required_skills": ["PTO", "MESURE"],
    }
    defaults.update(values)
    return SimpleNamespace(**defaults)


def _technician(**values):
    defaults = {
        "is_active": True,
        "status": TechnicianStatus.AVAILABLE,
        "team_id": 8,
        "skills": ["pto", "mesure"],
    }
    defaults.update(values)
    return SimpleNamespace(**defaults)


def _team(**values):
    defaults = {"is_active": True}
    defaults.update(values)
    return SimpleNamespace(**defaults)


def test_assignment_profile_accepts_governed_team_sector_and_skills():
    assert assignment_profile_errors(
        job=_job(),
        technician=_technician(),
        team=_team(),
        sector_covered=True,
    ) == []


def test_assignment_profile_rejects_missing_coverage_and_skill():
    errors = assignment_profile_errors(
        job=_job(),
        technician=_technician(skills=["PTO"]),
        team=_team(),
        sector_covered=False,
    )

    assert "Secteur non couvert par l'équipe du technicien" in errors
    assert "Compétences manquantes : mesure" in errors


def test_assignment_profile_rejects_inactive_or_unavailable_profile():
    errors = assignment_profile_errors(
        job=_job(),
        technician=_technician(
            is_active=False,
            status=TechnicianStatus.OFF_DUTY,
        ),
        team=_team(is_active=False),
        sector_covered=True,
    )

    assert "Profil technicien inactif" in errors
    assert "Technicien indisponible" in errors
    assert "Équipe opérationnelle inactive" in errors


def test_assignment_interval_accepts_a_complete_explicit_slot():
    interval = _assignment_interval(_job(
        scheduled_date=datetime(2026, 9, 15, 0, 0, tzinfo=timezone.utc),
        time_slot_start="08:15",
        time_slot_end="09:45",
        job_type="SAV",
        estimated_duration=60,
    ))

    assert interval is not None
    assert interval[0].isoformat() == "2026-09-15T08:15:00+00:00"
    assert interval[1].isoformat() == "2026-09-15T09:45:00+00:00"


def test_assignment_interval_rejects_partial_or_reversed_slots():
    base = {
        "scheduled_date": datetime(2026, 9, 15, 0, 0, tzinfo=timezone.utc),
        "job_type": "SAV",
        "estimated_duration": 60,
    }

    assert _assignment_interval(_job(
        **base,
        time_slot_start="08:00",
        time_slot_end=None,
    )) is None
    assert _assignment_interval(_job(
        **base,
        time_slot_start="10:00",
        time_slot_end="09:00",
    )) is None
