import pytest
from fastapi import HTTPException

from backend.api.routes.sectors import _validate_assignment_sector_rows


def test_active_sector_assignment_validation_accepts_requested_ids():
    _validate_assignment_sector_rows(
        [11, 12],
        [
            {"id": 11, "is_active": True},
            {"id": 12, "is_active": True},
        ],
    )


def test_inactive_sector_assignment_validation_rejects_without_mutation_path():
    with pytest.raises(HTTPException) as exc_info:
        _validate_assignment_sector_rows(
            [11, 12],
            [
                {"id": 11, "is_active": True},
                {"id": 12, "is_active": False},
            ],
        )

    assert exc_info.value.status_code == 409
    assert "12" in exc_info.value.detail
    assert "inactif" in exc_info.value.detail.lower()


def test_missing_sector_assignment_validation_stays_distinct_from_inactive():
    with pytest.raises(HTTPException) as exc_info:
        _validate_assignment_sector_rows(
            [11, 99],
            [{"id": 11, "is_active": True}],
        )

    assert exc_info.value.status_code == 400
    assert "99" in exc_info.value.detail
    assert "introuvable" in exc_info.value.detail.lower()
