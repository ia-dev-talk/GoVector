from datetime import date

from sqlalchemy.dialects import postgresql

from backend.logic.jobs import _build_jobs_list_query


def test_jobs_list_range_uses_inclusive_civil_dates():
    statement = _build_jobs_list_query(
        scheduled_from=date(2026, 7, 30),
        scheduled_to=date(2026, 8, 28),
        skip=500,
        limit=500,
    )

    sql = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "jobs.scheduled_date >= '2026-07-30 00:00:00'" in sql
    assert "jobs.scheduled_date < '2026-08-29 00:00:00'" in sql
    assert "LIMIT 500 OFFSET 500" in sql
