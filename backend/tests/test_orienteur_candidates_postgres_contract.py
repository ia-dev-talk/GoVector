"""Real candidate HTTP/JWT contract against PostgreSQL under READ ONLY."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
from fastapi import FastAPI
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.database.models import (
    Assignment, Base, FieldTeam, FieldTeamSector, Job, JobStatus, Orienteur,
    Sector, Technician, User, UserRole,
)
from backend.database import territory_models, gis_models  # noqa: F401 - FK registration
from backend.database.connection import get_db
from backend.auth.security import create_access_token
from backend.api.errors import install_business_error_handler
from backend.api.routes.orienteur_agent import router
from backend.services.orienteur_candidates import MAX_CANDIDATES
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url, _create_database, _database_url, _drop_database, _sqlalchemy_url,
)


async def _exercise(url):
    engine = create_async_engine(_sqlalchemy_url(url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router, prefix='/api/v1')
    install_business_error_handler(app)

    async def readonly_db():
        async with factory() as db:
            await db.execute(text('SET TRANSACTION READ ONLY'))
            assert await db.scalar(text('SHOW transaction_read_only')) == 'on'
            yield db
            assert not db.new and not db.dirty and not db.deleted

    app.dependency_overrides[get_db] = readonly_db
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            sector = Sector(name='Candidate contract sector')
            owners = [Orienteur(name=f'Owner {number}') for number in range(2)]
            db.add_all([sector, *owners])
            await db.flush()
            teams = [FieldTeam(name=f'Candidate team {number}', orienteur_id=owner.id)
                     for number, owner in enumerate(owners)]
            db.add_all(teams)
            await db.flush()
            db.add(FieldTeamSector(team_id=teams[0].id, sector_id=sector.id))
            own = []
            for number in range(4):
                own.append(Technician(name=f'Own {number}', home_latitude=33.5,
                    home_longitude=-7.5, team_id=teams[0].id, orienteur_id=owners[0].id,
                    skills=[] if number == 1 else ['FIBER']))
            # Deliberately stale legacy owner: canonical team must deny visibility.
            foreign = [Technician(name=f'Foreign {number}', home_latitude=33.5,
                home_longitude=-7.5, team_id=teams[1].id, orienteur_id=owners[0].id,
                skills=['FIBER']) for number in range(MAX_CANDIDATES)]
            legacy = Technician(name='Legacy own', home_latitude=33.5, home_longitude=-7.5,
                                orienteur_id=owners[0].id, skills=['FIBER'])
            db.add_all([*own, *foreign, legacy])
            await db.flush()
            start = datetime(2030, 1, 15, 9, tzinfo=timezone.utc)
            target = Job(job_number='CANDIDATE-TARGET', status=JobStatus.PENDING,
                scheduled_date=start, estimated_duration=60, required_skills=['FIBER'],
                sector_id=sector.id, orienteur_id=owners[0].id)
            overlapping = Job(job_number='CANDIDATE-CONFLICT', status=JobStatus.EN_ROUTE,
                scheduled_date=start + timedelta(minutes=15), estimated_duration=60)
            ended = Job(job_number='CANDIDATE-HISTORY', status=JobStatus.EN_ROUTE,
                scheduled_date=start, estimated_duration=60)
            adjacent = Job(job_number='CANDIDATE-ADJACENT', status=JobStatus.EN_ROUTE,
                scheduled_date=start + timedelta(minutes=60), estimated_duration=60)
            db.add_all([target, overlapping, ended, adjacent])
            await db.flush()
            db.add_all([
                Assignment(job_id=overlapping.id, technician_id=own[0].id),
                Assignment(job_id=ended.id, technician_id=own[2].id, ended_at=start),
                Assignment(job_id=adjacent.id, technician_id=own[3].id),
            ])
            users = [User(username=label, email=f'{label}@example.invalid',
                          password_hash='fixture-unused', role=role,
                          orienteur_id=owner_id, is_active=True)
                     for label, role, owner_id in [
                         ('owner', UserRole.ORIENTEUR, owners[0].id),
                         ('outsider', UserRole.ORIENTEUR, owners[1].id),
                         ('admin', UserRole.ADMIN, None),
                         ('technician', UserRole.TECHNICIAN, None)]]
            db.add_all(users)
            await db.commit()
            job_id, own_ids = target.id, [tech.id for tech in own]
            legacy_id, foreign_id = legacy.id, foreign[0].id
            headers = {user.username: {'Authorization': 'Bearer ' + create_access_token(
                {'sub': str(user.id), 'role': user.role.value})} for user in users}
            counts = [await db.scalar(select(func.count()).select_from(model))
                      for model in (Job, Assignment, Technician)]

        endpoint = f'/api/v1/orienteur-agent/jobs/{job_id}/candidates'
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                     base_url='http://contract.test') as client:
            assert (await client.get(endpoint)).status_code == 401
            response = await client.get(endpoint, headers=headers['owner'])
            assert response.status_code == 200, response.text
            result = response.json()
            assert result['mode'] == 'SIMULATION_ONLY'
            assert result['execution_enabled'] is False and result['approval_required'] is True
            assert result['total_candidates'] == 5 and result['truncated'] is False
            assert result['candidate_limit'] == MAX_CANDIDATES
            candidates = {item['technician_id']: item for item in result['candidates']}
            assert set(candidates) == set(own_ids + [legacy_id])
            assert foreign_id not in candidates
            checks = {key: {check['code']: check for check in row['checks']}
                      for key, row in candidates.items()}
            assert checks[own_ids[0]]['planning']['state'] == 'FAIL'
            assert checks[own_ids[0]]['planning']['overlapping_assignment_count'] == 1
            assert candidates[own_ids[0]]['status'] == 'EXCLUDED'
            assert checks[own_ids[1]]['skills']['missing_skills'] == ['FIBER']
            assert checks[own_ids[1]]['skills']['state'] == 'FAIL'
            assert checks[own_ids[2]]['planning']['state'] == 'PASS'  # historical assignment ignored
            assert checks[own_ids[3]]['planning']['state'] == 'PASS'  # touching endpoints allowed
            assert checks[own_ids[3]]['sector']['state'] == 'PASS'
            assert checks[legacy_id]['sector']['state'] == 'UNKNOWN'
            assert all(row['ready_for_assignment'] is False for row in candidates.values())
            denied = await client.get(endpoint, headers=headers['outsider'])
            assert denied.status_code == 403
            assert denied.json()['code'] == 'permission_denied'
            assert (await client.get(endpoint, headers=headers['technician'])).status_code == 403
            admin_response = await client.get(endpoint, headers=headers['admin'])
            assert admin_response.status_code == 200, admin_response.text
            all_candidates = admin_response.json()
            assert all_candidates['total_candidates'] == MAX_CANDIDATES + 5
            assert all_candidates['truncated'] is True
            assert len(all_candidates['candidates']) == MAX_CANDIDATES
            ids = [row['technician_id'] for row in all_candidates['candidates']]
            assert ids == sorted(ids)
            foreign_result = next(row for row in all_candidates['candidates']
                                  if row['technician_id'] == foreign_id)
            assert 'sector' in foreign_result['exclusions']
        async with factory() as db:
            assert [await db.scalar(select(func.count()).select_from(model))
                    for model in (Job, Assignment, Technician)] == counts
            assert not db.new and not db.dirty and not db.deleted
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def test_candidates_scope_conflicts_and_bounds_are_postgres_read_only():
    admin_url = _admin_url()
    name = f'bluevector_candidates_{uuid4().hex}'
    asyncio.run(_create_database(admin_url, name))
    try:
        asyncio.run(_exercise(_database_url(admin_url, name)))
    finally:
        asyncio.run(_drop_database(admin_url, name))
