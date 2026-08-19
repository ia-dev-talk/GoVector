import pytest
from pydantic import ValidationError

from backend.api.routes.auth import CockpitViewPreferences, _cockpit_namespace


def test_cockpit_preferences_default_keeps_all_recovery_surfaces_visible():
    preferences = CockpitViewPreferences()
    assert all(preferences.model_dump().values())


def test_cockpit_preferences_reject_completely_empty_cockpit():
    with pytest.raises(ValidationError):
        CockpitViewPreferences(
            metrics=False,
            progression=False,
            decisions=False,
            capacity=False,
            quality=False,
            activity=False,
            quickAccess=False,
        )


def test_cockpit_namespace_is_scoped_to_authenticated_user():
    assert _cockpit_namespace(7) == "cockpit_view:user:7"
    assert _cockpit_namespace(8) == "cockpit_view:user:8"
    assert _cockpit_namespace(7) != _cockpit_namespace(8)
