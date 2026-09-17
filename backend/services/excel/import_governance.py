"""Governed reference data exposed to the Excel import flow.

Import choices come from the administered GoVector catalog/database.  This
module deliberately returns only active values and never chooses a value on the
user's behalf.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.routes import settings as settings_routes
from backend.database.models import JobType, Sector
from backend.logic.job_sectors import sector_registry_aliases


async def active_job_type_choices(db: AsyncSession) -> list[dict]:
    document = await settings_routes._get_document(
        db,
        settings_routes._CATALOG_NAMESPACE,
    )
    catalog = settings_routes._catalog_response(document).values
    choices: list[dict] = []
    for item in catalog.job_types:
        if not item.active:
            continue
        metadata = dict(item.metadata or {})
        canonical = str(metadata.get("canonical") or item.code).strip()
        try:
            canonical = JobType(canonical).value
        except ValueError:
            # A malformed catalog row must never leak an unsupported value into
            # an imported Job. Catalog administration remains the correction
            # surface for such a row.
            continue
        choices.append(
            {
                "code": item.code,
                "label": item.label,
                "canonical": canonical,
                "custom": bool(metadata.get("custom")),
            }
        )
    return choices


async def resolve_active_job_type_choice(
    db: AsyncSession,
    code: str,
) -> dict | None:
    requested = str(code or "").strip()
    if not requested:
        return None
    for choice in await active_job_type_choices(db):
        if choice["code"] == requested:
            return choice
    return None


async def active_sector_choices(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(
            select(Sector.id, Sector.name, Sector.description)
            .where(Sector.is_active.is_(True))
            .order_by(Sector.name.asc(), Sector.id.asc())
        )
    ).all()
    return [
        {
            "id": sector_id,
            "name": name,
            "aliases": sorted(
                sector_registry_aliases(
                    {"name": name, "description": description}
                )
            ),
        }
        for sector_id, name, description in rows
    ]
