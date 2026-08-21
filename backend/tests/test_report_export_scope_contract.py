import asyncio

from sqlalchemy.dialects import postgresql

from backend.services.export_service import FieldOptExportService


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


def test_report_export_sector_filter_uses_authoritative_sector_id():
    sql = _compile_filters({"sector_id": 42})

    assert "jobs.sector_id = 42" in sql
    assert "route_criteria" not in sql
