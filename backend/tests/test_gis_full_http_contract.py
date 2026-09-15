"""Real HTTP/ASGI, JWT and disposable PostgreSQL GIS contract.

Only the database dependency is redirected. Authentication, multipart parsing,
authorization, service logic and response serialization are production code.
This is not browser, network deployment or migration-chain validation.
"""

import asyncio
from uuid import uuid4

import httpx
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes import auth, gis_datasets, v1_admin
from backend.auth.security import get_password_hash
from backend.database.connection import get_db
from backend.database.models import Base, Job, OperationalAuditEvent, Sector, User, UserRole
from backend.database.gis_models import GeoDataset, GeoFeature, GeoFeatureRevision
from backend.database import territory_models  # noqa: F401 - register FK tables
from backend.tests.test_kml_parser import KML
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url, _create_database, _database_url, _drop_database, _sqlalchemy_url,
)


async def _exercise(url):
    engine = create_async_engine(_sqlalchemy_url(url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(auth.router, prefix='/api/v1/auth')
    app.include_router(v1_admin.router, prefix='/api/v1/admin/v1')
    app.include_router(gis_datasets.router, prefix='/api/v1')

    async def test_db():
        async with factory() as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    # Synthetic fixture credentials, never an existing account.
    password = 'Disposable-GIS-contract-only-0904'
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            admin = User(username='gis-admin', email='gis-admin@example.invalid',
                         password_hash=get_password_hash(password), role=UserRole.ADMIN,
                         is_active=True)
            viewer = User(username='gis-viewer', email='gis-viewer@example.invalid',
                          password_hash=get_password_hash(password), role=UserRole.ORIENTEUR,
                          is_active=True)
            db.add_all([admin, viewer])
            await db.commit()
            admin_id = admin.id
        transport = httpx.ASGITransport(app=app)
        root = '/api/v1/gis-datasets'
        async with httpx.AsyncClient(transport=transport, base_url='http://contract.test') as client:
            assert (await client.get(root)).status_code == 401
            assert (await client.get(root, headers={'Authorization': 'Bearer invalid'})).status_code == 401
            bad_login = await client.post('/api/v1/auth/login', data={
                'username': 'gis-admin', 'password': 'wrong'})
            assert bad_login.status_code == 401

            async def login(username):
                response = await client.post('/api/v1/auth/login', data={
                    'username': username, 'password': password})
                assert response.status_code == 200, response.text
                assert response.json()['token_type'] == 'bearer'
                return {'Authorization': 'Bearer ' + response.json()['access_token']}

            admin_headers = await login('gis-admin')
            viewer_headers = await login('gis-viewer')
            files = {'file': ('network.kml', KML, 'application/vnd.google-earth.kml+xml')}
            client_ids = []
            for number in range(2):
                created = await client.post('/api/v1/admin/v1/clients', headers=admin_headers,
                    json={'name': f'HTTP Client {number}', 'code': f'HTTP-{number}'})
                assert created.status_code == 201, created.text
                client_ids.append(created.json()['id'])
            preview = await client.post(root + '/preview', headers=admin_headers, files=files)
            assert preview.status_code == 200, preview.text
            assert preview.json()['feature_count'] == 3
            form = {'name': 'Réseau HTTP', 'client_organization_id': str(client_ids[0]),
                    'expected_sha256': preview.json()['sha256']}
            invalid = await client.post(root, headers=admin_headers, files=files,
                                       data={**form, 'expected_sha256': '0' * 64})
            assert invalid.status_code == 409
            imported = await client.post(root, headers=admin_headers, files=files, data=form)
            assert imported.status_code == 200, imported.text
            dataset = imported.json()
            assert dataset['status'] == 'DRAFT' and dataset['revision'] == 1
            assert dataset['reused'] is False
            dataset_id = dataset['id']
            repeated = await client.post(root, headers=admin_headers, files=files, data=form)
            assert repeated.json()['id'] == dataset_id and repeated.json()['reused'] is True
            endpoint = f'{root}/{dataset_id}'
            # All GIS surfaces enforce the real role dependency, including reads.
            requests = [('GET', root, {}), ('POST', root + '/preview', {'files': files}),
                        ('POST', root, {'files': files, 'data': form}),
                        ('GET', endpoint + '/preview', {}), ('GET', endpoint + '/layers', {}),
                        ('POST', endpoint + '/publish', {'json': {'expected_revision': 1}}),
                        ('GET', endpoint + '/geojson', {})]
            for method, path, kwargs in requests:
                denied = await client.request(method, path, headers=viewer_headers, **kwargs)
                assert denied.status_code == 403, (path, denied.text)
            page = await client.get(root, headers=admin_headers,
                                    params={'client_organization_id': client_ids[0]})
            assert [row['id'] for row in page.json()['items']] == [dataset_id]
            foreign = await client.get(root, headers=admin_headers,
                                       params={'client_organization_id': client_ids[1]})
            assert foreign.json()['items'] == []
            saved = await client.get(endpoint + '/preview', headers=admin_headers)
            assert saved.status_code == 200, saved.text
            assert saved.json()['sample'] == preview.json()['sample']
            layers = await client.get(endpoint + '/layers', headers=admin_headers)
            assert layers.status_code == 200 and len(layers.json()) == 3
            assert (await client.get(endpoint + '/geojson', headers=admin_headers)).status_code == 409
            stale = await client.post(endpoint + '/publish', headers=admin_headers,
                                      json={'expected_revision': 2})
            assert stale.status_code == 409
            published = await client.post(endpoint + '/publish', headers=admin_headers,
                                          json={'expected_revision': 1})
            assert published.status_code == 200, published.text
            assert published.json()['status'] == 'PUBLISHED'
            assert published.json()['revision'] == 2

        # A new HTTP client and database session must see the exact durable export.
        async with httpx.AsyncClient(transport=transport, base_url='http://contract.test') as client:
            exported = await client.get(endpoint + '/geojson', headers=admin_headers)
            assert exported.status_code == 200, exported.text
            assert exported.headers['content-type'] == 'application/geo+json'
            assert exported.headers['content-disposition'] == (
                f'attachment; filename="govector-{dataset_id}.geojson"')
            body = exported.json()
            assert body['type'] == 'FeatureCollection'
            assert body['bluevector']['revision'] == 2
            assert [feature['geometry'] for feature in body['features']] == [
                feature['geometry'] for feature in preview.json()['sample']]
            selected = await client.get(endpoint + '/geojson', headers=admin_headers,
                                        params={'layer_id': layers.json()[0]['id']})
            assert selected.status_code == 200 and len(selected.json()['features']) == 1
            # Revoking the account invalidates an already-issued JWT immediately.
            async with factory() as db:
                admin = await db.get(User, admin_id)
                admin.is_active = False
                await db.commit()
            assert (await client.get(endpoint + '/geojson', headers=admin_headers)).status_code == 401
        async with factory() as db:
            assert [await db.scalar(select(func.count()).select_from(model))
                    for model in (GeoDataset, GeoFeature, GeoFeatureRevision, Job, Sector)] == [1, 3, 3, 0, 0]
            actions = (await db.execute(select(OperationalAuditEvent))).scalars().all()
            assert len(actions) == 4  # two client creations, import and publication
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def test_gis_full_http_authenticated_persistent_contract():
    admin_url = _admin_url()
    name = f'bluevector_gis_http_{uuid4().hex}'
    asyncio.run(_create_database(admin_url, name))
    try:
        asyncio.run(_exercise(_database_url(admin_url, name)))
    finally:
        asyncio.run(_drop_database(admin_url, name))
