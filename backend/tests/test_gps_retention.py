"""Contracts for configurable, enforced raw GPS retention."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock

import pytest
from pydantic import ValidationError

from backend.api.schemas.settings import OperationalSettingsValues
from backend.logic.gps_retention import purge_expired_gps_history


def test_gps_retention_requires_an_explicit_bounded_duration():
    assert (
        OperationalSettingsValues().gps_history_retention_days
        is None
    )
    assert (
        OperationalSettingsValues(
            gps_history_retention_days=30
        ).gps_history_retention_days
        == 30
    )

    with pytest.raises(ValidationError):
        OperationalSettingsValues(gps_history_retention_days=0)

    with pytest.raises(ValidationError):
        OperationalSettingsValues(gps_history_retention_days=3651)


@pytest.mark.asyncio
async def test_gps_retention_does_not_delete_without_admin_policy():
    db = AsyncMock()
    settings_result = Mock()
    settings_result.scalar_one_or_none.return_value = None
    db.execute.return_value = settings_result

    deleted = await purge_expired_gps_history(
        db,
        now=datetime(2026, 8, 10, tzinfo=timezone.utc),
    )

    assert deleted == 0
    db.execute.assert_awaited_once()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_gps_retention_deletes_expired_points_and_commits():
    db = AsyncMock()
    settings_result = Mock()
    settings_result.scalar_one_or_none.return_value = {
        "gps_history_retention_days": 30,
    }
    snapshot_result = Mock(rowcount=2)
    delete_result = Mock(rowcount=7)
    db.execute.side_effect = [
        settings_result,
        snapshot_result,
        delete_result,
    ]

    deleted = await purge_expired_gps_history(
        db,
        now=datetime(2026, 8, 10, tzinfo=timezone.utc),
    )

    assert deleted == 7
    assert db.execute.await_count == 3
    db.commit.assert_awaited_once()
