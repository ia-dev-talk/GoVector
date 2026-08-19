from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.api.routes import settings
from backend.api.schemas.settings import CatalogItem


def _grade_query_result(grades):
    scalars = MagicMock()
    scalars.all.return_value = list(grades)
    result = MagicMock()
    result.scalars.return_value = scalars
    return result


def _grade_query_db(*grade_sets):
    db = AsyncMock()
    results = [_grade_query_result(grades) for grades in grade_sets]
    if not results:
        results = [_grade_query_result([]), _grade_query_result([])]
    elif len(results) == 1:
        results.append(_grade_query_result(grade_sets[0]))
    db.execute.side_effect = results
    return db


@pytest.mark.asyncio
async def test_system_grade_cannot_be_removed_even_when_unused():
    values = settings._catalog_defaults()
    values.technician_grades = [
        item for item in values.technician_grades if item.code != "senior"
    ]

    with pytest.raises(HTTPException) as raised:
        await settings._validated_catalog(_grade_query_db(), values)

    assert raised.value.status_code == 422
    assert "système" in raised.value.detail
    assert "senior" in raised.value.detail


@pytest.mark.asyncio
async def test_referenced_custom_grade_cannot_be_deleted():
    values = settings._catalog_defaults()

    with pytest.raises(HTTPException) as raised:
        await settings._validated_catalog(
            _grade_query_db(["expert_ftth"], []),
            values,
        )

    assert raised.value.status_code == 409
    assert "supprimer" in raised.value.detail
    assert "expert_ftth" in raised.value.detail


@pytest.mark.asyncio
async def test_unused_custom_grade_can_be_removed_from_submitted_document():
    values = settings._catalog_defaults()
    values.technician_grades.append(
        CatalogItem(
            code="expert_ftth",
            label="Expert FTTH",
            color="#4B8DFF",
            sort_order=30,
            active=True,
            metadata={"custom": True},
        )
    )
    values.technician_grades = [
        item for item in values.technician_grades if item.code != "expert_ftth"
    ]

    validated = await settings._validated_catalog(_grade_query_db([], []), values)

    assert "expert_ftth" not in {item.code for item in validated.technician_grades}


@pytest.mark.asyncio
async def test_active_technician_grade_still_cannot_be_archived():
    values = settings._catalog_defaults()
    values.technician_grades = [
        CatalogItem(**{**item.model_dump(), "active": item.code != "senior"})
        for item in values.technician_grades
    ]

    with pytest.raises(HTTPException) as raised:
        await settings._validated_catalog(
            _grade_query_db(["senior"], ["senior"]),
            values,
        )

    assert raised.value.status_code == 409
    assert "archiver" in raised.value.detail
