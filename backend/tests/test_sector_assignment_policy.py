import inspect

import pytest
from fastapi import HTTPException

from backend.api.routes.sectors import (
    _validate_assignment_sector_rows,
    replace_technician_sector_assignment,
)


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


def test_legacy_sector_assignment_advances_profile_revision_under_lock():
    source = inspect.getsource(replace_technician_sector_assignment)

    lock_index = source.index("FOR UPDATE")
    delete_index = source.index("DELETE FROM technician_sectors")
    revision_index = source.index("SET updated_at = CURRENT_TIMESTAMP")
    commit_index = source.index("await db.commit()")

    assert lock_index < delete_index
    assert delete_index < revision_index < commit_index
    assert "UPDATE technicians" in source
