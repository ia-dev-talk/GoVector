"""Retention policy enforcement for raw technician GPS history."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.settings import OperationalSettingsValues
from backend.database.models import ApplicationSetting, GPSHistory, Technician


_OPERATIONAL_NAMESPACE = "operational"


async def configured_gps_retention_days(
    db: AsyncSession,
) -> int | None:
    """Return the explicitly configured retention period, if any."""

    result = await db.execute(
        select(ApplicationSetting.values).where(
            ApplicationSetting.namespace == _OPERATIONAL_NAMESPACE
        )
    )
    values = result.scalar_one_or_none()
    if values is None:
        return None

    return OperationalSettingsValues.model_validate(
        values or {}
    ).gps_history_retention_days


async def purge_expired_gps_history(
    db: AsyncSession,
    *,
    now: datetime | None = None,
) -> int:
    """Delete raw GPS fixes older than the configured retention period.

    No deletion occurs until an administrator has explicitly configured a
    duration. This makes the missing governance decision visible instead of
    silently inventing a legal or business default.
    """

    retention_days = await configured_gps_retention_days(db)
    if retention_days is None:
        return 0

    reference_time = now or datetime.now(timezone.utc)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    cutoff = reference_time - timedelta(days=retention_days)
    await db.execute(
        update(Technician)
        .where(Technician.last_location_update < cutoff)
        .values(
            current_latitude=None,
            current_longitude=None,
            current_speed=None,
            current_heading=None,
            current_accuracy=None,
            current_battery=None,
            last_location_update=None,
        )
    )
    result = await db.execute(
        delete(GPSHistory).where(GPSHistory.recorded_at < cutoff)
    )
    await db.commit()
    return int(result.rowcount or 0)
