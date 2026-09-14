"""Multi-intervention Magillan export using the canonical complete report.

Every selected intervention receives its operational first page followed by its
labelled photo pages. Missing values stay visibly unfilled; an empty selection
is rejected instead of producing a fictitious blank report.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import get_settings
from backend.database.models import (
    Assignment,
    CableDrumConsumption,
    ClientOrganization,
    Job,
    JobVisit,
    Technician,
    TechnicianFieldAction,
    TechnicianMedia,
)
from backend.services.export_service import FieldOptExportService
from backend.services.intervention_report import (
    build_report_pdf_from_sections,
    render_intervention_report_sections,
)


def _group_by_job(items: Iterable[Any]) -> dict[int, list[Any]]:
    grouped: dict[int, list[Any]] = defaultdict(list)
    for item in items:
        grouped[item.job_id].append(item)
    return grouped


async def load_report_contexts(
    db: AsyncSession,
    jobs: Iterable[Job],
) -> list[dict[str, Any]]:
    records = list(jobs)
    job_ids = [job.id for job in records]
    if not job_ids:
        return []

    actions = (
        await db.execute(
            select(TechnicianFieldAction)
            .where(TechnicianFieldAction.job_id.in_(job_ids))
            .order_by(TechnicianFieldAction.job_id, TechnicianFieldAction.occurred_at)
        )
    ).scalars().all()
    media = (
        await db.execute(
            select(TechnicianMedia)
            .where(TechnicianMedia.job_id.in_(job_ids))
            .order_by(TechnicianMedia.job_id, TechnicianMedia.created_at)
        )
    ).scalars().all()
    visits = (
        await db.execute(
            select(JobVisit)
            .where(JobVisit.job_id.in_(job_ids))
            .order_by(JobVisit.job_id, JobVisit.attempt_number)
        )
    ).scalars().all()
    consumptions = (
        await db.execute(
            select(CableDrumConsumption)
            .where(CableDrumConsumption.job_id.in_(job_ids))
            .order_by(CableDrumConsumption.job_id, CableDrumConsumption.occurred_at)
        )
    ).scalars().all()
    assignments = (
        await db.execute(
            select(Assignment)
            .where(Assignment.job_id.in_(job_ids))
            .order_by(Assignment.job_id, Assignment.assigned_at.desc(), Assignment.id.desc())
        )
    ).scalars().all()

    actions_by_job = _group_by_job(actions)
    media_by_job = _group_by_job(media)
    visits_by_job = _group_by_job(visits)
    consumptions_by_job = _group_by_job(consumptions)
    assignments_by_job = _group_by_job(assignments)

    technician_id_by_job: dict[int, int] = {}
    for job in records:
        job_assignments = assignments_by_job.get(job.id, [])
        active = next(
            (assignment for assignment in job_assignments if assignment.ended_at is None),
            None,
        )
        selected = active or (job_assignments[0] if job_assignments else None)
        if selected is not None:
            technician_id_by_job[job.id] = selected.technician_id
            continue
        job_visits = visits_by_job.get(job.id, [])
        if job_visits and job_visits[-1].primary_technician_id is not None:
            technician_id_by_job[job.id] = job_visits[-1].primary_technician_id

    technician_ids = set(technician_id_by_job.values())
    technician_names = (
        dict(
            (
                await db.execute(
                    select(Technician.id, Technician.name).where(
                        Technician.id.in_(technician_ids)
                    )
                )
            ).all()
        )
        if technician_ids
        else {}
    )

    client_ids = {
        job.client_organization_id
        for job in records
        if job.client_organization_id is not None
    }
    client_names = (
        dict(
            (
                await db.execute(
                    select(ClientOrganization.id, ClientOrganization.name).where(
                        ClientOrganization.id.in_(client_ids)
                    )
                )
            ).all()
        )
        if client_ids
        else {}
    )

    media_root = Path(get_settings().TECHNICIAN_MEDIA_ROOT)
    return [
        {
            "job": job,
            "actions": actions_by_job.get(job.id, []),
            "media": media_by_job.get(job.id, []),
            "visits": visits_by_job.get(job.id, []),
            "cable_consumptions": consumptions_by_job.get(job.id, []),
            "technician_name": technician_names.get(technician_id_by_job.get(job.id)),
            "client_organization_name": client_names.get(job.client_organization_id),
            "media_root": media_root,
        }
        for job in records
    ]


async def export_magillan_daily_report(
    db: AsyncSession,
    filters: dict | None = None,
) -> bytes:
    jobs = await FieldOptExportService.get_filtered_jobs(db, filters or {})
    if not jobs:
        raise ValueError("Aucune intervention dans le périmètre sélectionné")

    contexts = await load_report_contexts(db, jobs)
    sections = "".join(
        render_intervention_report_sections(**context)
        for context in contexts
    )
    return build_report_pdf_from_sections(sections)
