from datetime import date
from statistics import mean

from backend.database.models import JobStatus
from backend.database.seeds.historical_dataset import (
    generate_historical_job_specs,
)


ANCHOR = date(2026, 8, 27)


def test_demo_dataset_is_deterministic():
    first = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )
    second = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )

    assert first == second


def test_demo_dataset_covers_exactly_30_days():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )

    days = sorted({spec.scheduled_day for spec in specs})

    assert len(days) == 30
    assert days[0] == date(2026, 7, 29)
    assert days[-1] == ANCHOR
    assert 450 <= len(specs) <= 1000


def test_demo_dataset_covers_release_statuses_and_edge_cases():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )

    statuses = {spec.status for spec in specs}

    assert {
        JobStatus.PENDING,
        JobStatus.ASSIGNED,
        JobStatus.IN_PROGRESS,
        JobStatus.COMPLETED,
        JobStatus.CANCELLED,
        JobStatus.FAILED,
        JobStatus.POSTPONED,
    }.issubset(statuses)

    assert any(spec.reassignments for spec in specs)
    assert any(spec.stock_anomaly for spec in specs)

    assert {
        "recent",
        "old",
        "absent",
        "degraded",
    } == {spec.gps_quality for spec in specs}


def test_dataset_contains_only_explicitly_synthetic_identity_data():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )

    for spec in specs:
        assert "Synthétique" in spec.customer_name
        assert spec.customer_email.endswith("@example.invalid")
        assert "synthétique" in spec.notes.lower()
        assert spec.customer_phone == "+212000000000"
        assert 33.45 <= spec.latitude <= 33.70
        assert -7.80 <= spec.longitude <= -7.45


def test_weekend_volume_is_lower_than_weekday_volume():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )

    counts = {}
    for spec in specs:
        counts[spec.scheduled_day] = (
            counts.get(spec.scheduled_day, 0) + 1
        )

    weekday_counts = [
        count
        for day, count in counts.items()
        if day.weekday() < 5
    ]

    weekend_counts = [
        count
        for day, count in counts.items()
        if day.weekday() >= 5
    ]

    assert mean(weekend_counts) < mean(weekday_counts)


def test_stress_profile_exceeds_real_pagination_threshold():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="stress",
        seed=20260827,
    )

    assert len(specs) > 1000


def test_generator_supports_explicit_days_and_daily_volume():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=7,
        days=5,
        jobs_per_day=9,
    )

    assert len(specs) == 45
    assert len({spec.scheduled_day for spec in specs}) == 5


def test_pending_jobs_never_claim_reassignment():
    specs = generate_historical_job_specs(
        date(2026, 8, 27),
        profile="demo",
        seed=20260827,
    )

    pending = [
        spec
        for spec in specs
        if spec.status == JobStatus.PENDING
    ]

    assert pending
    assert all(
        spec.reassignments == 0
        for spec in pending
    )


def test_demo_reassignment_count_is_stable():
    specs = generate_historical_job_specs(
        date(2026, 8, 27),
        profile="demo",
        seed=20260827,
    )

    assert sum(
        spec.reassignments
        for spec in specs
    ) == 40
