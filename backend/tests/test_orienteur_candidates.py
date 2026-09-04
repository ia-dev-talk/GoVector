import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.errors import BusinessAPIError
from backend.database.models import Base, FieldTeam, JobStatus, Orienteur, Technician, UserRole
from backend.services.orienteur_candidates import assess_candidates, review_candidate
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url, _create_database, _database_url, _drop_database, _seed, _sqlalchemy_url,
)

NOW = datetime(2026, 9, 4, 10, tzinfo=timezone.utc)


def job(**changes):
    return SimpleNamespace(**(dict(id=1, deleted_at=None, updated_at=NOW, status=JobStatus.PENDING,
        required_skills=['install'], scheduled_date=NOW, estimated_duration=60,
        sector_id=3, orienteur_id=5) | changes))


def review(**changes):
    values = dict(job=job(), technician=SimpleNamespace(id=2, name='Test', is_active=True, skills=['install']),
                  team=SimpleNamespace(id=4, is_active=True), sector_ids={3}, assigned_jobs=[])
    return review_candidate(**(values | changes))


def test_matching_facts_never_imply_ready_or_ranked():
    result = review()
    assert result['status'] == 'REVIEW'
    assert result['ready_for_assignment'] is False
    assert result['unknowns'] == ['shift', 'client_authorization', 'travel_and_stock']
    assert 'score' not in result
    json.dumps(result)


def test_missing_skills_and_wrong_sector_are_explained():
    result = review(job=job(required_skills=['repair'], sector_id=99))
    assert result['status'] == 'EXCLUDED'
    assert result['exclusions'] == ['skills', 'sector']
    assert result['checks'][1]['missing_skills'] == ['repair']


@pytest.mark.parametrize('offset,expected', [(59, 'FAIL'), (60, 'PASS'), (-60, 'PASS'), (-59, 'FAIL')])
def test_overlap_uses_half_open_intervals(offset, expected):
    result = review(assigned_jobs=[job(id=9, status=JobStatus.ASSIGNED, scheduled_date=NOW + timedelta(minutes=offset))])
    assert next(c for c in result['checks'] if c['code'] == 'planning')['state'] == expected


@pytest.mark.parametrize('date', [None, NOW.replace(tzinfo=None)])
def test_missing_schedule_is_unknown(date):
    result = review(job=job(scheduled_date=date))
    assert 'planning' in result['unknowns']


def test_local_slot_and_malformed_skills_remain_unknown():
    result = review(job=job(time_slot_start='10:00', required_skills=[{'code': 'install'}]))
    assert 'planning' in result['unknowns']
    assert 'skills' in result['unknowns']


def test_historical_closed_or_same_job_does_not_create_conflict():
    result = review(assigned_jobs=[job(id=8, status=JobStatus.COMPLETED), job(status=JobStatus.ASSIGNED)])
    assert 'planning' not in result['exclusions']


@pytest.mark.asyncio
@pytest.mark.parametrize('role', [UserRole.CLIENT, UserRole.TECHNICIAN, UserRole.ORIENTEUR])
async def test_scope_denied_before_candidate_queries(role):
    db = SimpleNamespace(get=AsyncMock(return_value=job()))
    with pytest.raises(BusinessAPIError) as error:
        await assess_candidates(db, 1, SimpleNamespace(role=role, orienteur_id=99))
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_deleted_job_is_not_analyzed():
    db = SimpleNamespace(get=AsyncMock(return_value=job(deleted_at=NOW)))
    with pytest.raises(HTTPException) as error:
        await assess_candidates(db, 1, SimpleNamespace(role=UserRole.ADMIN))
    assert error.value.status_code == 404


async def exercise_read_only(url):
    engine = create_async_engine(_sqlalchemy_url(url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            tech, user, target, *_ = await _seed(db)
            owner = Orienteur(name='Owner')
            other_owner = Orienteur(name='Other')
            db.add_all([owner, other_owner])
            await db.flush()
            team = FieldTeam(name='Foreign team', orienteur_id=other_owner.id)
            db.add(team)
            await db.flush()
            target.orienteur_id = owner.id
            tech.orienteur_id = owner.id
            # Stale legacy projection must not expose a technician in a different team.
            foreign = Technician(name='Foreign', home_latitude=0, home_longitude=0,
                                 orienteur_id=owner.id, team_id=team.id)
            db.add(foreign)
            await db.commit()
            target_id = target.id
            owner_id = owner.id
            tech_id = tech.id
        async with factory() as db:
            await db.execute(text('SET TRANSACTION READ ONLY'))
            scoped = await assess_candidates(db, target_id, SimpleNamespace(role=UserRole.ORIENTEUR, orienteur_id=owner_id))
            assert scoped['total_candidates'] == 1
            assert [c['technician_id'] for c in scoped['candidates']] == [tech_id]
            assert scoped['execution_enabled'] is False
            json.dumps(scoped)
            admin = await assess_candidates(db, target_id, SimpleNamespace(role=UserRole.ADMIN))
            assert admin['total_candidates'] == 2
            with patch('backend.services.orienteur_candidates.MAX_CANDIDATES', 1):
                bounded = await assess_candidates(db, target_id, SimpleNamespace(role=UserRole.ADMIN))
            assert bounded['total_candidates'] == 2
            assert len(bounded['candidates']) == 1
            assert bounded['truncated'] is True
        async with factory() as db:
            target = await db.get(type(target), target_id)
            target.status = JobStatus.COMPLETED
            await db.commit()
        async with factory() as db:
            await db.execute(text('SET TRANSACTION READ ONLY'))
            closed = await assess_candidates(db, target_id, SimpleNamespace(role=UserRole.ADMIN))
            assert closed['assessment_status'] == 'NOT_APPLICABLE'
            assert closed['candidates'] == []
    finally:
        await engine.dispose()


def test_postgres_scope_and_read_only_contract():
    admin_url = _admin_url()
    name = f'bluevector_candidates_{uuid4().hex}'
    asyncio.run(_create_database(admin_url, name))
    try:
        asyncio.run(exercise_read_only(_database_url(admin_url, name)))
    finally:
        asyncio.run(_drop_database(admin_url, name))
