from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from backend.api.schemas.jobs import JobResponse
from backend.api.routes import job_actions
from backend.database.models import Job, JobPriority, JobStatus, JobType
from backend.logic import jobs as job_logic
from backend.logic.job_sectors import (
    SectorIdentity,
    resolve_sector_from_registry,
)


SECTORS = [
    SimpleNamespace(
        id=1,
        name="Secteur Est",
        description="Secteur Est de Casablanca — Ain Sebaâ, Hay Hassani, Ain Diab",
        is_active=True,
    ),
    SimpleNamespace(
        id=2,
        name="Secteur Centre",
        description="Secteur Centre de Casablanca — Maârif, Gauthier, Bourgogne",
        is_active=True,
    ),
    SimpleNamespace(
        id=3,
        name="Secteur Nord",
        description="Secteur Nord de Casablanca — Anfa, Polo, Mers Sultan",
        is_active=True,
    ),
    SimpleNamespace(
        id=4,
        name="Secteur Sud",
        description="Secteur Sud de Casablanca — Sidi Maârouf, Oasis, Val d'Anfa",
        is_active=True,
    ),
]


def test_sidi_maarouf_resolves_to_the_operational_south_sector():
    identity = resolve_sector_from_registry(
        sectors=SECTORS,
        sector_raw="Sidi Maârouf",
        route_criteria="Sidi Maârouf",
        latitude=33.5319247,
        longitude=-7.6526869,
    )

    assert identity == SectorIdentity(
        id=4,
        name="Secteur Sud",
        raw="Sidi Maârouf",
    )


def test_prefixed_legacy_routing_code_uses_the_same_operational_sector():
    identity = resolve_sector_from_registry(
        sectors=SECTORS,
        route_criteria="CAS-SIDI-MAAROUF",
    )

    assert identity == SectorIdentity(
        id=4,
        name="Secteur Sud",
        raw="CAS-SIDI-MAAROUF",
    )


def test_longest_alias_prevents_val_d_anfa_from_becoming_north_anfa():
    identity = resolve_sector_from_registry(
        sectors=SECTORS,
        route_criteria="CAS - Val d’Anfa",
    )

    assert identity.id == 4
    assert identity.name == "Secteur Sud"


def test_structured_territory_link_wins_without_description_inference():
    sectors = [
        SimpleNamespace(
            id=9,
            name="Secteur Opérationnel",
            description=None,
            is_active=True,
        )
    ]
    territories = [
        SimpleNamespace(
            name="Sidi Maârouf",
            code="CAS-SIDI-MAAROUF",
            external_id=None,
            legacy_sector_id=9,
            geometry_geojson=None,
            is_active=True,
        )
    ]

    identity = resolve_sector_from_registry(
        sectors=sectors,
        territories=territories,
        route_criteria="CAS-SIDI-MAAROUF",
    )

    assert identity == SectorIdentity(9, "Secteur Opérationnel", "CAS-SIDI-MAAROUF")


def test_ambiguous_or_unknown_alias_stays_unresolved():
    duplicated = [
        SimpleNamespace(
            id=10,
            name="Secteur A",
            description="Secteur A — Centre",
            is_active=True,
        ),
        SimpleNamespace(
            id=11,
            name="Secteur B",
            description="Secteur B — Centre",
            is_active=True,
        ),
    ]

    assert resolve_sector_from_registry(
        sectors=duplicated,
        sector_raw="Centre",
    ) is None
    assert resolve_sector_from_registry(
        sectors=SECTORS,
        sector_raw="Quartier inconnu",
    ) is None


def test_explicit_raw_sector_wins_over_a_conflicting_route_hint():
    identity = resolve_sector_from_registry(
        sectors=SECTORS,
        sector_raw="Polo",
        route_criteria="Sidi Maârouf",
    )

    assert identity == SectorIdentity(3, "Secteur Nord", "Polo")


@pytest.mark.asyncio
async def test_job_creation_persists_the_resolved_sector_identity():
    db = SimpleNamespace(
        add=Mock(),
        flush=AsyncMock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    identity = SectorIdentity(4, "Secteur Sud", "Sidi Maârouf")

    with (
        patch(
            "backend.logic.jobs.resolve_sector_for_write",
            AsyncMock(return_value=identity),
        ) as resolver,
        patch(
            "backend.logic.jobs.find_existing_site_for_job",
            AsyncMock(return_value=None),
        ),
    ):
        job = await job_logic.create_job(
            db=db,
            customer_name="Client QA",
            service_address="Sidi Maârouf",
            latitude=33.5319247,
            longitude=-7.6526869,
            job_type=JobType.RACCORDEMENT,
            required_skills=[],
            route_criteria="Sidi Maârouf",
            sector_raw="Sidi Maârouf",
        )

    resolver.assert_awaited_once()
    assert job.sector_id == 4
    assert job.sector_raw == "Sidi Maârouf"
    assert job._canonical_sector_name == "Secteur Sud"
    db.add.assert_called_once_with(job)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_route_only_update_replaces_stale_raw_sector_context():
    job = SimpleNamespace(
        id=31,
        sector_id=3,
        sector_raw="Polo",
        route_criteria="Polo",
        latitude=None,
        longitude=None,
        updated_at=None,
    )
    db = SimpleNamespace(commit=AsyncMock(), refresh=AsyncMock())
    identity = SectorIdentity(4, "Secteur Sud", "Sidi Maârouf")

    with (
        patch(
            "backend.logic.jobs.get_job",
            AsyncMock(return_value=job),
        ),
        patch(
            "backend.logic.jobs.resolve_sector_for_write",
            AsyncMock(return_value=identity),
        ) as resolver,
    ):
        updated = await job_logic.update_job(
            db,
            31,
            route_criteria="Sidi Maârouf",
        )

    assert updated.sector_id == 4
    assert updated.sector_raw == "Sidi Maârouf"
    resolver.assert_awaited_once_with(
        db,
        sector_id=None,
        sector_raw=None,
        route_criteria="Sidi Maârouf",
        latitude=None,
        longitude=None,
    )


@pytest.mark.asyncio
async def test_unknown_route_hint_preserves_existing_canonical_sector():
    job = SimpleNamespace(
        id=31,
        sector_id=4,
        sector_raw="Sidi Maârouf",
        route_criteria="Sidi Maârouf",
        latitude=None,
        longitude=None,
        updated_at=None,
    )
    db = SimpleNamespace(commit=AsyncMock(), refresh=AsyncMock())

    with (
        patch(
            "backend.logic.jobs.get_job",
            AsyncMock(return_value=job),
        ),
        patch(
            "backend.logic.jobs.resolve_sector_for_write",
            AsyncMock(return_value=None),
        ),
    ):
        updated = await job_logic.update_job(
            db,
            31,
            route_criteria="Quartier inconnu",
        )

    assert updated.route_criteria == "Quartier inconnu"
    assert updated.sector_id == 4
    assert updated.sector_raw == "Sidi Maârouf"


@pytest.mark.asyncio
async def test_duplicate_persists_the_source_canonical_sector(monkeypatch):
    now = datetime.utcnow()
    original = Job(
        id=31,
        job_type=JobType.RACCORDEMENT,
        status=JobStatus.ASSIGNED,
        priority=JobPriority.NORMALE,
        required_skills=[],
        route_criteria="Sidi Maârouf",
        sector_raw="Sidi Maârouf",
        sector_id=4,
        estimated_duration=120,
        rejected_by_operator=False,
        created_at=now,
        updated_at=now,
    )

    class DuplicateDb:
        def __init__(self):
            self.added = None

        def add(self, value):
            self.added = value

        async def flush(self):
            self.added.id = 32

        async def commit(self):
            pass

        async def refresh(self, _value):
            pass

    db = DuplicateDb()
    dashboard = SimpleNamespace(
        broadcast_job_event=AsyncMock(),
        broadcast_dashboard_update=AsyncMock(),
    )
    monkeypatch.setattr(
        job_actions.job_logic,
        "get_job",
        AsyncMock(return_value=original),
    )
    monkeypatch.setattr(
        job_actions,
        "require_job_operations_access",
        Mock(),
    )
    monkeypatch.setattr(
        job_actions,
        "resolve_sector_for_write",
        AsyncMock(return_value=SectorIdentity(4, "Secteur Sud", "Sidi Maârouf")),
    )
    monkeypatch.setattr(job_actions, "log_job_activity", AsyncMock())
    monkeypatch.setattr(job_actions, "DashboardService", lambda _db: dashboard)
    monkeypatch.setattr(
        job_actions,
        "job_response",
        AsyncMock(side_effect=lambda _db, value: value),
    )

    duplicated = await job_actions.duplicate_job(
        31,
        db=db,
        current_user=SimpleNamespace(orienteur_id=7),
    )

    assert duplicated.id == 32
    assert duplicated.sector_id == 4
    assert duplicated.sector_raw == "Sidi Maârouf"


def test_job_response_exposes_one_canonical_sector_identity():
    now = datetime.utcnow()
    job = Job(
        id=31,
        job_type=JobType.RACCORDEMENT,
        status=JobStatus.ASSIGNED,
        priority=JobPriority.NORMALE,
        required_skills=[],
        route_criteria="Sidi Maârouf",
        sector_raw="Sidi Maârouf",
        scheduled_date=now,
        estimated_duration=120,
        rejected_by_operator=False,
        created_at=now,
        updated_at=now,
    )
    job._canonical_sector_id = 4
    job._canonical_sector_name = "Secteur Sud"
    job._canonical_sector_raw = "Sidi Maârouf"

    response = JobResponse.from_orm_with_assignment(job)

    assert response.sector_id == 4
    assert response.sector_name == "Secteur Sud"
    assert response.sector_raw == "Sidi Maârouf"
    assert response.route_criteria == "Sidi Maârouf"
