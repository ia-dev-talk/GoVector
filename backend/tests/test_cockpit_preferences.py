import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.api.routes.auth import (
    _COCKPIT_MAX_FUTURE_SKEW_MS,
    CockpitViewPreferences,
    CockpitViewUpdate,
    _cockpit_document_values,
    _cockpit_intent_rank,
    _cockpit_namespace,
    _cockpit_stored_intent,
    _cockpit_view_values,
    _ensure_fresh_cockpit_intent,
    _validate_cockpit_intent_clock,
)


def _view(**overrides):
    values = CockpitViewPreferences().model_dump()
    values.update(overrides)
    return CockpitViewPreferences(**values)


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


def test_cockpit_document_reads_legacy_flat_values_and_v2_nested_values():
    legacy = _view(metrics=False).model_dump()
    assert _cockpit_view_values(legacy) == legacy

    update = CockpitViewUpdate(
        view=_view(metrics=False),
        client_intent="1000000:1:first",
    )
    stored = _cockpit_document_values(update)

    assert _cockpit_view_values(stored)["metrics"] is False
    assert _cockpit_stored_intent(stored) == "1000000:1:first"


def test_cockpit_update_rejects_malformed_client_intent():
    with pytest.raises(ValidationError):
        CockpitViewUpdate(
            view=_view(),
            client_intent="not-a-ranked-intent",
        )


def test_cockpit_intent_rank_orders_newer_action_before_arrival_order():
    older = "1000000:1:older"
    newer = "1000001:1:newer"

    assert _cockpit_intent_rank(newer) > _cockpit_intent_rank(older)
    _ensure_fresh_cockpit_intent(
        newer,
        {
            "view": _view(metrics=False).model_dump(),
            "client_intent": older,
        },
        now_ms=2_000_000,
    )

    with pytest.raises(HTTPException) as exc_info:
        _ensure_fresh_cockpit_intent(
            older,
            {
                "view": _view(metrics=True).model_dump(),
                "client_intent": newer,
            },
            now_ms=2_000_000,
        )

    assert exc_info.value.status_code == 409
    assert "plus récente" in str(exc_info.value.detail)


def test_cockpit_intent_sequence_breaks_same_clock_ties():
    assert _cockpit_intent_rank("1000000:2:second") > _cockpit_intent_rank(
        "1000000:1:first"
    )


def test_cockpit_intent_rejects_extreme_future_client_clock():
    server_now = 1_000_000
    too_far = server_now + _COCKPIT_MAX_FUTURE_SKEW_MS + 1

    with pytest.raises(ValueError, match="futur"):
        _validate_cockpit_intent_clock(
            f"{too_far}:1:future",
            now_ms=server_now,
        )

    assert _validate_cockpit_intent_clock(
        f"{server_now + _COCKPIT_MAX_FUTURE_SKEW_MS}:1:tolerated",
        now_ms=server_now,
    ).endswith(":tolerated")


def test_poisoned_stored_future_intent_does_not_block_clock_recovery():
    server_now = 10_000_000
    poisoned_clock = server_now + _COCKPIT_MAX_FUTURE_SKEW_MS + 86_400_000
    normal_intent = f"{server_now}:3:clock-corrected"

    _ensure_fresh_cockpit_intent(
        normal_intent,
        {
            "view": _view(metrics=False).model_dump(),
            "client_intent": f"{poisoned_clock}:1:poisoned",
        },
        now_ms=server_now,
    )


def test_future_clock_attack_cannot_poison_follow_up_normal_intent():
    server_now = 50_000_000
    legitimate = f"{server_now}:1:legitimate"
    future_attack = (
        f"{server_now + _COCKPIT_MAX_FUTURE_SKEW_MS + 86_400_000}:1:future"
    )

    with pytest.raises(ValueError, match="futur"):
        _validate_cockpit_intent_clock(future_attack, now_ms=server_now)

    _ensure_fresh_cockpit_intent(
        f"{server_now + 1}:1:after-recovery",
        {
            "view": _view(metrics=False).model_dump(),
            "client_intent": legitimate,
        },
        now_ms=server_now + 1,
    )
