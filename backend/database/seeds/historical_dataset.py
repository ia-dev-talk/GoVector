from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
import random
from zoneinfo import ZoneInfo

from backend.database.models import JobPriority, JobStatus, JobType


CASABLANCA_TZ = ZoneInfo("Africa/Casablanca")


@dataclass(frozen=True)
class HistoricalDatasetProfile:
    name: str
    days: int
    weekday_min: int
    weekday_max: int
    weekend_min: int
    weekend_max: int


@dataclass(frozen=True)
class SyntheticJobSpec:
    job_number: str
    scheduled_day: date
    scheduled_at: datetime
    time_slot_start: str
    time_slot_end: str
    customer_name: str
    customer_email: str
    customer_phone: str
    service_address: str
    service_city: str
    service_zip: str
    latitude: float
    longitude: float
    sector_name: str
    route_criteria: str
    operator: str
    job_type: JobType
    priority: JobPriority
    status: JobStatus
    required_skills: tuple[str, ...]
    estimated_duration: int
    description: str
    notes: str
    reassignments: int
    gps_quality: str
    evidence_count: int
    optical_power_dbm: float | None
    cable_length_m: int | None
    ont_serial: str | None
    router_serial: str | None
    stock_anomaly: bool


PROFILES = {
    "demo": HistoricalDatasetProfile(
        name="demo",
        days=30,
        weekday_min=24,
        weekday_max=34,
        weekend_min=10,
        weekend_max=16,
    ),
    "stress": HistoricalDatasetProfile(
        name="stress",
        days=30,
        weekday_min=160,
        weekday_max=220,
        weekend_min=80,
        weekend_max=120,
    ),
}


LOCATIONS = (
    ("Maârif", "Secteur Centre", "CAS-MAARIF", 33.5892, -7.6031),
    ("Gauthier", "Secteur Centre", "CAS-GAUTHIER", 33.5980, -7.6120),
    ("Bourgogne", "Secteur Centre", "CAS-BOURGOGNE", 33.5708, -7.5976),
    ("Ain Sebaâ", "Secteur Est", "CAS-AIN-SEBAA", 33.6102, -7.5217),
    ("Hay Hassani", "Secteur Est", "CAS-HAY-HASSANI", 33.5945, -7.6123),
    ("Ain Diab", "Secteur Est", "CAS-AIN-DIAB", 33.5878, -7.5823),
    ("Anfa", "Secteur Nord", "CAS-ANFA", 33.5903, -7.5702),
    ("Polo", "Secteur Nord", "CAS-POLO", 33.6034, -7.5678),
    ("Mers Sultan", "Secteur Nord", "CAS-MERS-SULTAN", 33.6089, -7.5312),
    ("Sidi Maârouf", "Secteur Sud", "CAS-SIDI-MAAROUF", 33.5319, -7.6497),
    ("Oasis", "Secteur Sud", "CAS-OASIS", 33.5812, -7.6234),
    ("Val d'Anfa", "Secteur Sud", "CAS-VAL-ANFA", 33.5745, -7.6012),
)


JOB_TYPES = (
    JobType.INSTALLATION,
    JobType.DEPANNAGE,
    JobType.MAINTENANCE,
    JobType.SAV,
    JobType.RACCORDEMENT,
    JobType.AUDIT,
)


SKILLS_BY_TYPE = {
    JobType.INSTALLATION: ("install",),
    JobType.DEPANNAGE: ("repair",),
    JobType.MAINTENANCE: ("maintenance",),
    JobType.SAV: ("repair", "service_change"),
    JobType.RACCORDEMENT: ("install",),
    JobType.AUDIT: ("inspection",),
}


SLOTS = (
    ("08:00", "09:30"),
    ("09:30", "11:00"),
    ("11:00", "12:30"),
    ("13:00", "14:30"),
    ("14:30", "16:00"),
    ("16:00", "17:30"),
)


def get_profile(name: str) -> HistoricalDatasetProfile:
    try:
        return PROFILES[name]
    except KeyError as exc:
        raise ValueError(
            f"Unknown historical dataset profile: {name}"
        ) from exc


def _scheduled_datetime(day: date, slot_start: str) -> datetime:
    hour, minute = (int(part) for part in slot_start.split(":"))
    return datetime(
        day.year,
        day.month,
        day.day,
        hour,
        minute,
        tzinfo=CASABLANCA_TZ,
    )


def _status_for_job(
    rng: random.Random,
    *,
    day: date,
    anchor: date,
    index_in_day: int,
    first_day: date,
) -> JobStatus:
    if day == anchor and index_in_day < 5:
        return (
            JobStatus.PENDING,
            JobStatus.ASSIGNED,
            JobStatus.IN_PROGRESS,
            JobStatus.COMPLETED,
            JobStatus.CANCELLED,
        )[index_in_day]

    if day == first_day and index_in_day < 7:
        return (
            JobStatus.COMPLETED,
            JobStatus.CANCELLED,
            JobStatus.FAILED,
            JobStatus.POSTPONED,
            JobStatus.PENDING,
            JobStatus.ASSIGNED,
            JobStatus.IN_PROGRESS,
        )[index_in_day]

    if day == anchor:
        return rng.choices(
            population=[
                JobStatus.PENDING,
                JobStatus.ASSIGNED,
                JobStatus.IN_PROGRESS,
                JobStatus.COMPLETED,
                JobStatus.CANCELLED,
            ],
            weights=[28, 27, 15, 25, 5],
            k=1,
        )[0]

    return rng.choices(
        population=[
            JobStatus.COMPLETED,
            JobStatus.CANCELLED,
            JobStatus.FAILED,
            JobStatus.POSTPONED,
            JobStatus.PENDING,
            JobStatus.ASSIGNED,
            JobStatus.IN_PROGRESS,
        ],
        weights=[78, 7, 4, 3, 3, 4, 1],
        k=1,
    )[0]


def generate_historical_job_specs(
    anchor_date: date,
    *,
    profile: str = "demo",
    seed: int = 20260827,
    days: int | None = None,
    jobs_per_day: int | None = None,
) -> list[SyntheticJobSpec]:
    config = get_profile(profile)
    total_days = days if days is not None else config.days

    if total_days <= 0:
        raise ValueError("days must be greater than zero")

    if jobs_per_day is not None and jobs_per_day <= 0:
        raise ValueError("jobs_per_day must be greater than zero")

    rng = random.Random(seed)
    first_day = anchor_date - timedelta(days=total_days - 1)

    specs: list[SyntheticJobSpec] = []
    sequence = 0

    for offset in range(total_days):
        day = first_day + timedelta(days=offset)
        weekend = day.weekday() >= 5

        if jobs_per_day is not None:
            daily_count = jobs_per_day
        elif weekend:
            daily_count = rng.randint(
                config.weekend_min,
                config.weekend_max,
            )
        else:
            daily_count = rng.randint(
                config.weekday_min,
                config.weekday_max,
            )

        for index_in_day in range(daily_count):
            sequence += 1

            (
                locality,
                sector_name,
                route_criteria,
                base_lat,
                base_lon,
            ) = rng.choice(LOCATIONS)

            slot_start, slot_end = rng.choice(SLOTS)
            job_type = rng.choice(JOB_TYPES)

            status = _status_for_job(
                rng,
                day=day,
                anchor=anchor_date,
                index_in_day=index_in_day,
                first_day=first_day,
            )

            priority = rng.choices(
                [
                    JobPriority.NORMALE,
                    JobPriority.HAUTE,
                    JobPriority.FAIBLE,
                    JobPriority.URGENT,
                ],
                weights=[58, 22, 12, 8],
                k=1,
            )[0]

            completed_like = status == JobStatus.COMPLETED

            latitude = round(
                base_lat + rng.uniform(-0.0035, 0.0035),
                6,
            )
            longitude = round(
                base_lon + rng.uniform(-0.0035, 0.0035),
                6,
            )

            gps_quality = (
                "recent",
                "old",
                "absent",
                "degraded",
            )[sequence % 4]

            # A pending intervention has no current assignment.
            # Do not advertise a synthetic reassignment that the
            # PostgreSQL loader cannot coherently materialize.
            reassignments = (
                1
                if (
                    sequence % 17 == 0
                    and status != JobStatus.PENDING
                )
                else 0
            )

            evidence_count = (
                rng.randint(2, 6)
                if completed_like
                else rng.randint(0, 2)
            )

            optical_power = (
                round(rng.uniform(-24.5, -14.0), 1)
                if completed_like
                else None
            )

            cable_length = (
                rng.randint(12, 180)
                if completed_like
                else None
            )

            serial_suffix = f"{sequence:07d}"

            specs.append(
                SyntheticJobSpec(
                    job_number=(
                        f"SYN-{day.strftime('%Y%m%d')}-{index_in_day + 1:04d}"
                    ),
                    scheduled_day=day,
                    scheduled_at=_scheduled_datetime(
                        day,
                        slot_start,
                    ),
                    time_slot_start=slot_start,
                    time_slot_end=slot_end,
                    customer_name=(
                        f"Client Synthétique {sequence:05d}"
                    ),
                    customer_email=(
                        f"client.{serial_suffix}@example.invalid"
                    ),
                    customer_phone="+212000000000",
                    service_address=(
                        f"Adresse synthétique {sequence}, {locality}"
                    ),
                    service_city="Casablanca",
                    service_zip="20000",
                    latitude=latitude,
                    longitude=longitude,
                    sector_name=sector_name,
                    route_criteria=route_criteria,
                    operator=rng.choice(
                        ("IAM", "ORANGE", "INWI")
                    ),
                    job_type=job_type,
                    priority=priority,
                    status=status,
                    required_skills=SKILLS_BY_TYPE[job_type],
                    estimated_duration=rng.choice(
                        (30, 45, 60, 75, 90, 120)
                    ),
                    description=(
                        "Intervention FTTH entièrement synthétique "
                        f"#{sequence}"
                    ),
                    notes=(
                        "Donnée synthétique BlueVector QA — "
                        "ne correspond à aucun client réel."
                    ),
                    reassignments=reassignments,
                    gps_quality=gps_quality,
                    evidence_count=evidence_count,
                    optical_power_dbm=optical_power,
                    cable_length_m=cable_length,
                    ont_serial=(
                        f"SYN-ONT-{serial_suffix}"
                        if completed_like
                        else None
                    ),
                    router_serial=(
                        f"SYN-RTR-{serial_suffix}"
                        if completed_like
                        else None
                    ),
                    stock_anomaly=(sequence % 53 == 0),
                )
            )

    return specs
