import asyncio
from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from backend.services.export_service import FieldOptExportService
from backend.api.routes.reports import (
    _advanced_export_job_filters,
    _filtered_job_dashboard_stats,
)
from backend.database.models import JobStatus


def _compile_filters(filters: dict) -> str:
    query = asyncio.run(FieldOptExportService.build_job_query(None, filters))
    return str(
        query.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_report_export_operator_filter_is_exact_and_normalized():
    sql = _compile_filters({"operator": " orange "})

    assert "upper(trim(jobs.operator)) = 'ORANGE'" in sql
    assert "%ORANGE%" not in sql


def test_report_export_civil_end_date_includes_the_whole_final_day():
    sql = _compile_filters({
        "start_date": "2026-08-03",
        "end_date": "2026-08-24",
    })

    assert "jobs.scheduled_date >= '2026-08-03 00:00:00'" in sql
    assert "jobs.scheduled_date < '2026-08-25 00:00:00'" in sql
    assert "jobs.scheduled_date <= '2026-08-24 00:00:00'" not in sql


def test_report_export_normalizes_frontend_enum_tokens_and_excludes_archives():
    sql = _compile_filters({
        "status": "assigned",
        "job_type": "raccordement",
    })

    assert "jobs.deleted_at IS NULL" in sql
    assert "jobs.status = 'ASSIGNED'" in sql
    assert "jobs.job_type = 'RACCORDEMENT'" in sql


def test_report_export_rejects_unknown_enum_tokens():
    with pytest.raises(ValueError, match="statut invalide"):
        asyncio.run(
            FieldOptExportService.build_job_query(None, {"status": "invented"})
        )


@pytest.mark.asyncio
async def test_report_export_sector_filter_uses_the_hydrated_canonical_identity(
    monkeypatch,
):
    jobs = [
        SimpleNamespace(id=31, route_criteria="CAS-SIDI-MAAROUF"),
        SimpleNamespace(id=32, route_criteria="CAS-POLO"),
    ]
    scalars = SimpleNamespace(all=lambda: jobs)
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalars=lambda: scalars))
    )

    async def hydrate(_db, records):
        for job in records:
            job._canonical_sector_id = (
                4 if job.route_criteria == "CAS-SIDI-MAAROUF" else 3
            )
        return records

    monkeypatch.setattr(
        "backend.services.export_service.hydrate_job_sector_identities",
        hydrate,
    )

    filtered = await FieldOptExportService.get_filtered_jobs(
        db,
        {"sector_id": 4},
    )

    assert [job.id for job in filtered] == [31]


@pytest.mark.asyncio
async def test_report_export_rejects_an_invalid_sector_filter():
    with pytest.raises(ValueError, match="secteur invalide"):
        await FieldOptExportService.get_filtered_jobs(
            SimpleNamespace(),
            {"sector_id": "4x"},
        )


def test_advanced_export_applies_all_documented_job_filters_and_full_end_day():
    filters = _advanced_export_job_filters(
        start_date=date(2026, 8, 3),
        end_date=date(2026, 8, 24),
        sector_id=4,
        orienteur_id=8,
        technician_id=12,
        job_type="RACCORDEMENT",
        status="assigned",
    )

    assert filters == {
        "start_date": datetime.combine(date(2026, 8, 3), time.min),
        "end_date": datetime.combine(date(2026, 8, 24), time.max),
        "sector_id": 4,
        "orienteur_id": 8,
        "technician_id": 12,
        "job_type": "RACCORDEMENT",
        "status": "assigned",
    }


def test_advanced_dashboard_job_kpis_reconcile_with_filtered_rows():
    now = datetime.utcnow()
    stats = _filtered_job_dashboard_stats(
        {"totalJobs": 999, "activeTechs": 7},
        [
            SimpleNamespace(
                status=JobStatus.ASSIGNED,
                scheduled_date=now,
                real_duration_minutes=None,
            ),
            SimpleNamespace(
                status=JobStatus.COMPLETED,
                scheduled_date=now,
                real_duration_minutes=120,
            ),
        ],
    )

    assert stats["totalJobs"] == 2
    assert stats["completedJobs"] == 1
    assert stats["completionRate"] == 50
    assert stats["jobsToday"] == 2
    assert stats["activeTechs"] == 7
