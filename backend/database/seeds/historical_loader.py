from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import random

from sqlalchemy import func, select

from backend.config import get_settings
from backend.database.connection import (
    AsyncSessionLocal,
    reset_db,
)
from backend.database.models import (
    Assignment,
    Job,
    JobStatus,
    JobVisit,
    Orienteur,
    Sector,
    Technician,
)
from backend.database.seeds.historical_dataset import (
    PROFILES,
    SyntheticJobSpec,
    generate_historical_job_specs,
)


CONFIRM_RESET_TOKEN = "BLUEVECTOR_SYNTHETIC_RESET"

SAFE_ENVIRONMENTS = {
    "development",
    "dev",
    "local",
    "test",
    "testing",
    "demo",
}

TERMINAL_STATUSES = {
    JobStatus.COMPLETED,
    JobStatus.CANCELLED,
    JobStatus.FAILED,
    JobStatus.POSTPONED,
}


def validate_apply_guard(
    *,
    environment: str,
    confirm_reset: str,
) -> None:
    normalized = str(environment or "").strip().lower()

    if normalized not in SAFE_ENVIRONMENTS:
        raise RuntimeError(
            "Le dataset synthétique ne peut être chargé "
            f"dans l'environnement {environment!r}."
        )

    if confirm_reset != CONFIRM_RESET_TOKEN:
        raise RuntimeError(
            "Confirmation destructive absente ou invalide. "
            f"Utilisez --confirm-reset {CONFIRM_RESET_TOKEN}"
        )


def summarize_specs(
    specs: list[SyntheticJobSpec],
) -> dict:
    if not specs:
        return {
            "total_jobs": 0,
            "first_day": None,
            "last_day": None,
            "days": 0,
            "statuses": {},
            "operators": {},
            "sectors": {},
            "job_types": {},
            "reassignments": 0,
            "stock_anomalies": 0,
        }

    days = sorted(
        {spec.scheduled_day for spec in specs}
    )

    return {
        "total_jobs": len(specs),
        "first_day": days[0],
        "last_day": days[-1],
        "days": len(days),
        "statuses": dict(
            sorted(
                Counter(
                    spec.status.value
                    for spec in specs
                ).items()
            )
        ),
        "operators": dict(
            sorted(
                Counter(
                    spec.operator
                    for spec in specs
                ).items()
            )
        ),
        "sectors": dict(
            sorted(
                Counter(
                    spec.sector_name
                    for spec in specs
                ).items()
            )
        ),
        "job_types": dict(
            sorted(
                Counter(
                    spec.job_type.value
                    for spec in specs
                ).items()
            )
        ),
        "reassignments": sum(
            spec.reassignments
            for spec in specs
        ),
        "stock_anomalies": sum(
            1
            for spec in specs
            if spec.stock_anomaly
        ),
    }


def print_summary(
    summary: dict,
    *,
    profile: str,
    seed: int,
    anchor_date: date,
    mode: str,
) -> None:
    print()
    print("=" * 68)
    print("BlueVector — dataset historique synthétique")
    print("=" * 68)
    print(f"Mode          : {mode}")
    print(f"Profil        : {profile}")
    print(f"Seed          : {seed}")
    print(f"Date ancre    : {anchor_date.isoformat()}")
    print(
        "Période       : "
        f"{summary['first_day']} -> {summary['last_day']}"
    )
    print(f"Jours         : {summary['days']}")
    print(f"Interventions : {summary['total_jobs']}")
    print(
        f"Réaffectations: {summary['reassignments']}"
    )
    print(
        f"Anomalies QA  : {summary['stock_anomalies']}"
    )

    for label, key in (
        ("Statuts", "statuses"),
        ("Opérateurs", "operators"),
        ("Secteurs", "sectors"),
        ("Types", "job_types"),
    ):
        print()
        print(f"{label}:")
        for name, count in summary[key].items():
            print(f"  {name:<24} {count:>5}")

    print("=" * 68)
    print()


def _technician_candidates(
    spec: SyntheticJobSpec,
    technicians: list[Technician],
) -> list[Technician]:
    required = set(spec.required_skills)

    exact = [
        technician
        for technician in technicians
        if required.issubset(
            set(technician.skills or [])
        )
        and spec.route_criteria
        in set(technician.assigned_routes or [])
    ]

    if exact:
        return exact

    skill_match = [
        technician
        for technician in technicians
        if required.issubset(
            set(technician.skills or [])
        )
    ]

    return skill_match or technicians


def _select_technician(
    spec: SyntheticJobSpec,
    technicians: list[Technician],
    sequence: int,
    *,
    exclude_id: int | None = None,
) -> Technician:
    candidates = _technician_candidates(
        spec,
        technicians,
    )

    if exclude_id is not None:
        alternatives = [
            candidate
            for candidate in candidates
            if candidate.id != exclude_id
        ]
        if alternatives:
            candidates = alternatives

    if not candidates:
        raise RuntimeError(
            "Aucun technicien disponible pour "
            f"{spec.job_number}"
        )

    return candidates[
        sequence % len(candidates)
    ]


def _timeline(
    spec: SyntheticJobSpec,
    sequence: int,
) -> dict:
    scheduled = spec.scheduled_at

    created = scheduled - timedelta(
        days=1 + (sequence % 3),
        hours=sequence % 5,
    )

    assigned = scheduled - timedelta(
        minutes=35 + (sequence % 31),
    )

    accepted = assigned + timedelta(
        minutes=4 + (sequence % 7),
    )

    started = scheduled + timedelta(
        minutes=3 + (sequence % 9),
    )

    arrived = started + timedelta(
        minutes=8 + (sequence % 14),
    )

    duration = max(
        20,
        int(
            spec.estimated_duration
            * (
                0.78
                + ((sequence % 9) * 0.045)
            )
        ),
    )

    ended = arrived + timedelta(
        minutes=duration,
    )

    return {
        "created": created,
        "assigned": assigned,
        "accepted": accepted,
        "started": started,
        "arrived": arrived,
        "ended": ended,
        "duration": duration,
    }


def _gps_projection(
    spec: SyntheticJobSpec,
) -> tuple[
    float | None,
    float | None,
]:
    if spec.gps_quality == "absent":
        return None, None

    if spec.gps_quality == "degraded":
        return (
            round(spec.latitude + 0.0018, 6),
            round(spec.longitude - 0.0015, 6),
        )

    if spec.gps_quality == "old":
        return (
            round(spec.latitude + 0.0007, 6),
            round(spec.longitude + 0.0006, 6),
        )

    return spec.latitude, spec.longitude


def _build_job(
    *,
    spec: SyntheticJobSpec,
    sector: Sector,
    orienteur_id: int | None,
    technician: Technician | None,
    sequence: int,
) -> Job:
    timeline = _timeline(
        spec,
        sequence,
    )

    gps_lat, gps_lon = _gps_projection(
        spec,
    )

    has_field_execution = (
        spec.status
        not in {
            JobStatus.PENDING,
            JobStatus.ASSIGNED,
        }
    )

    completed = (
        spec.status == JobStatus.COMPLETED
    )

    terminal = (
        spec.status in TERMINAL_STATUSES
    )

    return Job(
        job_number=spec.job_number,
        job_type=spec.job_type,
        status=spec.status,
        customer_name=spec.customer_name,
        customer_phone=spec.customer_phone,
        customer_email=spec.customer_email,
        service_address=spec.service_address,
        service_city=spec.service_city,
        service_zip=spec.service_zip,
        sector_id=sector.id,
        sector_raw=sector.name,
        latitude=spec.latitude,
        longitude=spec.longitude,
        planned_location_source="synthetic_qa",
        planned_location_precision="neighborhood",
        required_skills=list(
            spec.required_skills
        ),
        route_criteria=spec.route_criteria,
        operator=spec.operator,
        priority=spec.priority,
        scheduled_date=spec.scheduled_at,
        time_slot_start=spec.time_slot_start,
        time_slot_end=spec.time_slot_end,
        estimated_duration=spec.estimated_duration,
        description=spec.description,
        notes=spec.notes,
        optical_power_dbm=(
            spec.optical_power_dbm
            if completed
            else None
        ),
        cable_length_m=(
            spec.cable_length_m
            if completed
            else None
        ),
        ont_serial=(
            spec.ont_serial
            if completed
            else None
        ),
        router_serial=(
            spec.router_serial
            if completed
            else None
        ),
        assigned_technician_name=(
            technician.name
            if technician is not None
            else None
        ),
        orienteur_id=orienteur_id,
        gps_latitude=(
            gps_lat
            if has_field_execution
            else None
        ),
        gps_longitude=(
            gps_lon
            if has_field_execution
            else None
        ),
        start_latitude=(
            gps_lat
            if has_field_execution
            else None
        ),
        start_longitude=(
            gps_lon
            if has_field_execution
            else None
        ),
        end_latitude=(
            spec.latitude
            if terminal
            else None
        ),
        end_longitude=(
            spec.longitude
            if terminal
            else None
        ),
        accepted_at=(
            timeline["accepted"]
            if has_field_execution
            else None
        ),
        started_at=(
            timeline["started"]
            if has_field_execution
            else None
        ),
        arrival_time=(
            timeline["arrived"]
            if has_field_execution
            else None
        ),
        started_by=(
            technician.id
            if (
                technician is not None
                and has_field_execution
            )
            else None
        ),
        completed_at=(
            timeline["ended"]
            if completed
            else None
        ),
        real_duration_minutes=(
            timeline["duration"]
            if terminal
            else None
        ),
        failure_reason=(
            "Échec synthétique QA"
            if spec.status == JobStatus.FAILED
            else None
        ),
        validation_status=(
            "validated"
            if completed
            else None
        ),
        rejected_by_operator=False,
        created_at=timeline["created"],
        updated_at=(
            timeline["ended"]
            if terminal
            else max(
                timeline["created"],
                spec.scheduled_at,
            )
        ),
    )


def _build_visit(
    *,
    job: Job,
    technician: Technician,
    timeline: dict,
    attempt_number: int,
    status: JobStatus,
    outcome: str | None,
    ended_at: datetime | None,
) -> JobVisit:
    active_field = status not in {
        JobStatus.PENDING,
        JobStatus.ASSIGNED,
    }

    return JobVisit(
        job_id=job.id,
        attempt_number=attempt_number,
        primary_technician_id=technician.id,
        status=status.value,
        outcome=outcome,
        scheduled_at=job.scheduled_date,
        assigned_at=timeline["assigned"],
        accepted_at=(
            timeline["accepted"]
            if active_field
            else None
        ),
        started_at=(
            timeline["started"]
            if active_field
            else None
        ),
        arrived_at=(
            timeline["arrived"]
            if active_field
            else None
        ),
        work_started_at=(
            timeline["arrived"]
            if active_field
            else None
        ),
        ended_at=ended_at,
        start_latitude=(
            job.gps_latitude
            if active_field
            else None
        ),
        start_longitude=(
            job.gps_longitude
            if active_field
            else None
        ),
        end_latitude=(
            job.end_latitude
            if ended_at is not None
            else None
        ),
        end_longitude=(
            job.end_longitude
            if ended_at is not None
            else None
        ),
        backfill_confidence="synthetic",
        created_at=timeline["assigned"],
        updated_at=(
            ended_at
            or timeline["assigned"]
        ),
    )


def _build_assignment(
    *,
    job: Job,
    technician: Technician,
    visit: JobVisit,
    timeline: dict,
    sequence: int,
    ended_at: datetime | None,
    end_reason: str | None,
) -> Assignment:
    return Assignment(
        job_id=job.id,
        technician_id=technician.id,
        visit_id=visit.id,
        assigned_at=timeline["assigned"],
        ended_at=ended_at,
        end_reason=end_reason,
        sequence=(sequence % 10) + 1,
        estimated_travel_time=(
            12 + (sequence % 24)
        ),
        estimated_distance=round(
            1.4 + ((sequence % 31) * 0.37),
            2,
        ),
        estimated_arrival=(
            timeline["arrived"]
        ),
        actual_travel_time=(
            10 + (sequence % 21)
        ),
        actual_arrival=(
            timeline["arrived"]
            if job.status
            not in {
                JobStatus.PENDING,
                JobStatus.ASSIGNED,
            }
            else None
        ),
        actual_completion=ended_at,
        actual_duration_minutes=(
            timeline["duration"]
            if ended_at is not None
            else None
        ),
        created_at=timeline["assigned"],
        updated_at=(
            ended_at
            or timeline["assigned"]
        ),
    )



async def _load_specs(
    specs: list[SyntheticJobSpec],
) -> dict:
    async with AsyncSessionLocal() as session:
        sectors = (
            await session.execute(
                select(Sector).order_by(
                    Sector.id.asc()
                )
            )
        ).scalars().all()

        technicians = (
            await session.execute(
                select(Technician).order_by(
                    Technician.id.asc()
                )
            )
        ).scalars().all()

        orienteurs = (
            await session.execute(
                select(Orienteur).order_by(
                    Orienteur.id.asc()
                )
            )
        ).scalars().all()

        sector_by_name = {
            sector.name: sector
            for sector in sectors
        }

        orienteur_by_sector = {}
        for orienteur in orienteurs:
            if (
                orienteur.sector_id is not None
                and orienteur.sector_id
                not in orienteur_by_sector
            ):
                orienteur_by_sector[
                    orienteur.sector_id
                ] = orienteur.id

        if not technicians:
            raise RuntimeError(
                "Aucun technicien seedé."
            )

        for sequence, spec in enumerate(
            specs,
            start=1,
        ):
            sector = sector_by_name.get(
                spec.sector_name
            )

            if sector is None:
                raise RuntimeError(
                    "Secteur synthétique absent: "
                    f"{spec.sector_name}"
                )

            final_technician = None

            if spec.status != JobStatus.PENDING:
                final_technician = (
                    _select_technician(
                        spec,
                        technicians,
                        sequence,
                    )
                )

            job = _build_job(
                spec=spec,
                sector=sector,
                orienteur_id=(
                    orienteur_by_sector.get(
                        sector.id
                    )
                ),
                technician=final_technician,
                sequence=sequence,
            )

            session.add(job)
            await session.flush()

            if final_technician is None:
                continue

            timeline = _timeline(
                spec,
                sequence,
            )

            final_attempt = 1

            if spec.reassignments:
                previous_technician = (
                    _select_technician(
                        spec,
                        technicians,
                        sequence + 1,
                        exclude_id=(
                            final_technician.id
                        ),
                    )
                )

                first_timeline = dict(
                    timeline
                )

                first_timeline["assigned"] = (
                    timeline["assigned"]
                    - timedelta(minutes=55)
                )

                first_timeline["accepted"] = (
                    first_timeline["assigned"]
                    + timedelta(minutes=7)
                )

                first_timeline["started"] = (
                    first_timeline["accepted"]
                    + timedelta(minutes=5)
                )

                first_timeline["arrived"] = (
                    first_timeline["started"]
                    + timedelta(minutes=10)
                )

                first_end = (
                    timeline["assigned"]
                    - timedelta(minutes=6)
                )

                first_visit = _build_visit(
                    job=job,
                    technician=previous_technician,
                    timeline=first_timeline,
                    attempt_number=1,
                    status=JobStatus.ASSIGNED,
                    outcome="reassigned",
                    ended_at=first_end,
                )

                session.add(first_visit)
                await session.flush()

                first_assignment = (
                    _build_assignment(
                        job=job,
                        technician=previous_technician,
                        visit=first_visit,
                        timeline=first_timeline,
                        sequence=sequence,
                        ended_at=first_end,
                        end_reason="reassigned",
                    )
                )

                session.add(
                    first_assignment
                )

                final_attempt = 2

            final_ended_at = (
                timeline["ended"]
                if spec.status in TERMINAL_STATUSES
                else None
            )

            final_outcome = (
                spec.status.value
                if final_ended_at is not None
                else None
            )

            visit = _build_visit(
                job=job,
                technician=final_technician,
                timeline=timeline,
                attempt_number=final_attempt,
                status=spec.status,
                outcome=final_outcome,
                ended_at=final_ended_at,
            )

            session.add(visit)
            await session.flush()

            assignment = _build_assignment(
                job=job,
                technician=final_technician,
                visit=visit,
                timeline=timeline,
                sequence=sequence,
                ended_at=final_ended_at,
                end_reason=final_outcome,
            )

            session.add(assignment)

            if sequence % 100 == 0:
                await session.flush()

        await session.commit()

        job_count = (
            await session.execute(
                select(func.count(Job.id))
            )
        ).scalar_one()

        assignment_count = (
            await session.execute(
                select(
                    func.count(
                        Assignment.id
                    )
                )
            )
        ).scalar_one()

        visit_count = (
            await session.execute(
                select(
                    func.count(JobVisit.id)
                )
            )
        ).scalar_one()

        first_scheduled = (
            await session.execute(
                select(
                    func.min(
                        Job.scheduled_date
                    )
                )
            )
        ).scalar_one()

        last_scheduled = (
            await session.execute(
                select(
                    func.max(
                        Job.scheduled_date
                    )
                )
            )
        ).scalar_one()

        return {
            "jobs": int(job_count),
            "assignments": int(
                assignment_count
            ),
            "visits": int(visit_count),
            "first_scheduled": (
                first_scheduled
            ),
            "last_scheduled": (
                last_scheduled
            ),
        }


async def apply_historical_dataset(
    *,
    specs: list[SyntheticJobSpec],
    environment: str,
    confirm_reset: str,
    seed: int,
) -> dict:
    validate_apply_guard(
        environment=environment,
        confirm_reset=confirm_reset,
    )

    print(
        "⚠️  RESET COMPLET de la base "
        "applicative de développement."
    )

    await reset_db()

    random.seed(seed)

    # Import lazy : le dry-run ne charge ni passlib/bcrypt
    # ni le seed de référence.
    from backend.database.seeds.seed_data import seed_all

    # Charge uniquement les référentiels et comptes QA.
    # Les interventions seront créées exclusivement
    # par le générateur historique ci-dessous.
    await seed_all(include_jobs=False)

    result = await _load_specs(
        specs
    )

    if result["jobs"] != len(specs):
        raise RuntimeError(
            "Nombre de jobs persistés incohérent: "
            f"{result['jobs']} != {len(specs)}"
        )

    return result


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "Date attendue au format YYYY-MM-DD"
        ) from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Prépare ou charge le dataset "
            "historique synthétique BlueVector."
        )
    )

    parser.add_argument(
        "--profile",
        choices=sorted(PROFILES),
        default="demo",
    )

    parser.add_argument(
        "--anchor-date",
        type=_parse_date,
        default=date.today(),
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=20260827,
    )

    parser.add_argument(
        "--apply",
        action="store_true",
        help=(
            "Applique réellement le reset "
            "et le chargement PostgreSQL."
        ),
    )

    parser.add_argument(
        "--confirm-reset",
        default="",
    )

    return parser


def main() -> int:
    args = build_parser().parse_args()

    specs = generate_historical_job_specs(
        args.anchor_date,
        profile=args.profile,
        seed=args.seed,
    )

    summary = summarize_specs(
        specs
    )

    print_summary(
        summary,
        profile=args.profile,
        seed=args.seed,
        anchor_date=args.anchor_date,
        mode=(
            "APPLY"
            if args.apply
            else "DRY-RUN"
        ),
    )

    if not args.apply:
        print(
            "Aucune écriture PostgreSQL "
            "n'a été effectuée."
        )
        print(
            "Ajoutez --apply et la confirmation "
            "explicite uniquement après validation."
        )
        return 0

    settings = get_settings()

    result = asyncio.run(
        apply_historical_dataset(
            specs=specs,
            environment=settings.ENVIRONMENT,
            confirm_reset=args.confirm_reset,
            seed=args.seed,
        )
    )

    print()
    print("✅ Dataset PostgreSQL chargé")
    print(
        f"Jobs        : {result['jobs']}"
    )
    print(
        f"Assignments : {result['assignments']}"
    )
    print(
        f"Visits      : {result['visits']}"
    )
    print(
        "Période DB  : "
        f"{result['first_scheduled']} -> "
        f"{result['last_scheduled']}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
