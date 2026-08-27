from datetime import date
from pathlib import Path

import pytest

from backend.database.seeds.historical_dataset import (
    generate_historical_job_specs,
)
from backend.database.seeds.historical_loader import (
    CONFIRM_RESET_TOKEN,
    summarize_specs,
    validate_apply_guard,
)


ANCHOR = date(2026, 8, 27)


def test_loader_summary_matches_generated_dataset():
    specs = generate_historical_job_specs(
        ANCHOR,
        profile="demo",
        seed=20260827,
    )

    summary = summarize_specs(specs)

    assert summary["total_jobs"] == len(specs)
    assert summary["days"] == 30
    assert summary["first_day"] == date(
        2026,
        7,
        29,
    )
    assert summary["last_day"] == ANCHOR

    assert sum(
        summary["statuses"].values()
    ) == len(specs)

    assert sum(
        summary["operators"].values()
    ) == len(specs)

    assert sum(
        summary["sectors"].values()
    ) == len(specs)


@pytest.mark.parametrize(
    "environment",
    [
        "production",
        "staging",
        "PRODUCTION",
        "",
    ],
)
def test_loader_refuses_unsafe_environments(
    environment,
):
    with pytest.raises(RuntimeError):
        validate_apply_guard(
            environment=environment,
            confirm_reset=(
                CONFIRM_RESET_TOKEN
            ),
        )


def test_loader_refuses_missing_confirmation():
    with pytest.raises(RuntimeError):
        validate_apply_guard(
            environment="development",
            confirm_reset="",
        )


def test_loader_accepts_explicit_local_confirmation():
    validate_apply_guard(
        environment="development",
        confirm_reset=CONFIRM_RESET_TOKEN,
    )


def test_loader_has_no_post_seed_truncate_cascade():
    source = Path(
        "backend/database/seeds/historical_loader.py"
    ).read_text(encoding="utf-8")

    assert "_clear_transient_seed_jobs" not in source
    assert "TRUNCATE TABLE" not in source
    assert "seed_all(include_jobs=False)" in source


def test_reference_seed_supports_jobs_opt_out():
    source = Path(
        "backend/database/seeds/seed_data.py"
    ).read_text(encoding="utf-8")

    assert (
        "async def seed_all(*, include_jobs: bool = True):"
        in source
    )
    assert "if not include_jobs:" in source


def test_technician_seed_templates_are_not_mutated():
    from backend.database.seeds.seed_data import (
        TECHNICIANS,
        technician_seed_rows,
    )

    original = TECHNICIANS[0]["orienteur_name"]

    first = technician_seed_rows()
    first[0].pop("orienteur_name")

    second = technician_seed_rows()

    assert TECHNICIANS[0]["orienteur_name"] == original
    assert second[0]["orienteur_name"] == original
