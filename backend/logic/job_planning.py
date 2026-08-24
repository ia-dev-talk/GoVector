"""Canonical planning defaults for BlueVector interventions.

The persisted ``Job.estimated_duration`` remains the source of truth for an
individual intervention.  These values are only used when a caller has not
provided an explicit estimate, and are exposed through the business catalog so
all clients initialise the same value.
"""

from types import MappingProxyType

from backend.database.models import JobType


FALLBACK_ESTIMATED_DURATION_MINUTES = 60

JOB_TYPE_DEFAULT_ESTIMATED_DURATION_MINUTES = MappingProxyType(
    {
        JobType.INSTALLATION: 90,
        JobType.DEPANNAGE: 60,
        JobType.MIGRATION: 75,
        JobType.RACCORDEMENT: 120,
        JobType.AUDIT: 45,
    }
)


def default_estimated_duration_minutes(job_type: JobType | str) -> int:
    """Return the governed default estimate for a supported job type.

    Types without a dedicated V1 wizard rule retain the historical 60-minute
    default.  Explicit estimates are never replaced by this helper.
    """

    try:
        normalized_type = (
            job_type if isinstance(job_type, JobType) else JobType(str(job_type))
        )
    except (TypeError, ValueError):
        return FALLBACK_ESTIMATED_DURATION_MINUTES

    return JOB_TYPE_DEFAULT_ESTIMATED_DURATION_MINUTES.get(
        normalized_type,
        FALLBACK_ESTIMATED_DURATION_MINUTES,
    )


def _slot_duration_minutes(start: str | None, end: str | None) -> int | None:
    try:
        start_hour, start_minute = (int(value) for value in str(start).split(":"))
        end_hour, end_minute = (int(value) for value in str(end).split(":"))
    except (TypeError, ValueError):
        return None

    if not (
        0 <= start_hour <= 23
        and 0 <= end_hour <= 23
        and 0 <= start_minute <= 59
        and 0 <= end_minute <= 59
    ):
        return None

    duration = end_hour * 60 + end_minute - (start_hour * 60 + start_minute)
    return duration if duration > 0 else None


def canonical_estimated_duration_minutes(
    *,
    job_type: JobType | str,
    estimated_duration: int | None,
    time_slot_start: str | None,
    time_slot_end: str | None,
) -> int:
    """Resolve the governed duration for reads and writes.

    Explicit estimates remain authoritative in every normal case. The single
    canonicalized combination is RACCORDEMENT + the former generic 60-minute
    default + a two-hour slot. New writes normalize it to 120 and old rows are
    projected identically, without rewriting data or affecting other types.
    """

    try:
        normalized_type = (
            job_type if isinstance(job_type, JobType) else JobType(str(job_type))
        )
    except (TypeError, ValueError):
        normalized_type = None

    governed_default = default_estimated_duration_minutes(job_type)
    slot_duration = _slot_duration_minutes(time_slot_start, time_slot_end)

    if (
        normalized_type == JobType.RACCORDEMENT
        and estimated_duration == FALLBACK_ESTIMATED_DURATION_MINUTES
        and slot_duration == governed_default
    ):
        return governed_default

    try:
        persisted = int(estimated_duration)
    except (TypeError, ValueError):
        persisted = 0
    return persisted if persisted > 0 else governed_default


def job_estimated_duration_minutes(job) -> int:
    """Return the duration every operational consumer must use for a job."""

    return canonical_estimated_duration_minutes(
        job_type=getattr(job, "job_type", ""),
        estimated_duration=getattr(job, "estimated_duration", None),
        time_slot_start=getattr(job, "time_slot_start", None),
        time_slot_end=getattr(job, "time_slot_end", None),
    )
