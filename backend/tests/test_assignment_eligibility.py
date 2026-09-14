from types import SimpleNamespace

from backend.database.models import TechnicianStatus
from backend.logic.assignments import assignment_profile_errors


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
