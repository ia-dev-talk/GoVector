"""Real PostgreSQL: tenant isolation, idempotency, publication and durable exports."""

import asyncio
from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes.settings import update_operational_settings
from backend.api.routes.gis_datasets import list_datasets, layers, saved_preview
from backend.api.schemas.settings import CompletionPolicyValues, OperationalSettingsUpdate, OperationalSettingsValues
from backend.database.models import Base, ClientOrganization, Job, Sector, UserRole
from backend.database.gis_models import GeoDataset, GeoFeature, GeoFeatureRevision, GeoLayer
from backend.logic.completion_policy import CompletionPolicy
from backend.services.gis import datasets
from backend.services.gis.kml_parser import parse_geospatial_upload
from backend.tests.test_kml_parser import KML
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url, _create_database, _database_url, _drop_database, _seed, _sqlalchemy_url,
)


@pytest.mark.parametrize('key', ['0', '-1', '01', 'abc', '1.0', '１２', '2147483648'])
def test_client_rule_keys_are_canonical(key):
    with pytest.raises(ValidationError):
        CompletionPolicyValues(by_client_organization={key: {}})


def test_duplicate_source_ids_rejected_before_persistence():
    parsed = parse_geospatial_upload('network.kml', KML)
    with pytest.raises(HTTPException) as error:
        datasets.preview(replace(parsed, features=(parsed.features[0], parsed.features[0])))
    assert error.value.status_code == 422


async def exercise(url):
    engine = create_async_engine(_sqlalchemy_url(url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    folder = 'Dossier/' + 'long-' * 40
    parsed = parse_geospatial_upload('network.kml', KML.replace(b'Infrastructure', folder.encode()))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with factory() as db:
            _, user, job, *_ = await _seed(db)
            admin = SimpleNamespace(id=user.id, username=user.username, role=UserRole.ADMIN)
            clients = [ClientOrganization(code=f'TEST-{i}', name=f'Client {i}', is_active=True) for i in range(2)]
            db.add_all(clients)
            await db.flush()
            client_ids = [c.id for c in clients]
            job.client_organization_id = client_ids[0]
            job_id = job.id
            await db.commit()
            before = [await db.scalar(select(func.count()).select_from(model)) for model in (Job, Sector)]
            values = OperationalSettingsValues(completion_policy=CompletionPolicyValues(
                default={'minimum_photos': 1}, by_operator={'orange': {'minimum_photos': 3}},
                by_job_type={'INSTALLATION': {'minimum_photos': 2}},
                by_client_organization={str(client_ids[0]): {'minimum_photos': 7}}))
            saved = await update_operational_settings(OperationalSettingsUpdate(expected_revision=0, values=values), db, admin)
            assert saved.revision == 1
        async with factory() as db:
            job = await db.get(Job, job_id)
            assert (await CompletionPolicy(db).resolve(job)).minimum_photos == 7
            other = SimpleNamespace(client_organization_id=client_ids[1], operator='ORANGE', job_type='INSTALLATION')
            assert (await CompletionPolicy(db).resolve(other)).minimum_photos == 3
            other.operator = ''
            assert (await CompletionPolicy(db).resolve(other)).minimum_photos == 2
            other.job_type = 'OTHER'
            assert (await CompletionPolicy(db).resolve(other)).minimum_photos == 1
            values.completion_policy.by_client_organization = {'999999': {}}
            with pytest.raises(HTTPException) as error:
                await update_operational_settings(OperationalSettingsUpdate(expected_revision=1, values=values), db, admin)
            assert error.value.status_code == 422
            await db.rollback()
        async def import_for(client_id, checksum=parsed.sha256):
            async with factory() as db:
                return await datasets.import_dataset(db, parsed=parsed, client_id=client_id,
                    name='Réseau Casablanca', expected_sha256=checksum, user=admin)
        with pytest.raises(HTTPException) as error:
            await import_for(client_ids[0], '0' * 64)
        assert error.value.status_code == 409
        with pytest.raises(HTTPException) as error:
            await import_for(999999)
        assert error.value.status_code == 422
        # Two concurrent retries must create exactly one dataset and one revision per feature.
        first, duplicate = await asyncio.gather(import_for(client_ids[0]), import_for(client_ids[0]))
        assert first['id'] == duplicate['id']
        assert sorted([first['reused'], duplicate['reused']]) == [False, True]
        second = await import_for(client_ids[1])
        assert second['id'] != first['id']
        async with factory() as db:
            assert [await db.scalar(select(func.count()).select_from(model)) for model in (Job, Sector)] == before
            assert [await db.scalar(select(func.count()).select_from(model)) for model in (GeoDataset, GeoLayer, GeoFeature, GeoFeatureRevision)] == [2, 6, 6, 6]
            page = await list_datasets(client_organization_id=client_ids[0], after_id=0, limit=1, db=db)
            assert [item['id'] for item in page['items']] == [first['id']]
            assert page['next_after_id'] is None
            assert sum(layer['feature_count'] for layer in await layers(first['id'], db)) == 3
            persisted_preview = await saved_preview(first['id'], db)
            assert {layer['folder_path'] for layer in persisted_preview['layers']} == {folder}
            assert all(len(layer['name']) <= 180 for layer in persisted_preview['layers'])
            preview = await datasets.stored_preview(db, dataset_id=first['id'])
            assert preview['feature_count'] == 3
            assert [f['geometry'] for f in preview['sample']] == [f.geometry_geojson for f in parsed.features]
            with pytest.raises(HTTPException) as error:
                await datasets.export_geojson(db, dataset_id=first['id'])
            assert error.value.status_code == 409
            with pytest.raises(HTTPException) as error:
                await datasets.publish_dataset(db, dataset_id=first['id'], expected_revision=2, user=admin)
            assert error.value.status_code == 409
            await db.rollback()
        async def publish():
            async with factory() as db:
                try:
                    return await datasets.publish_dataset(db, dataset_id=first['id'], expected_revision=1, user=admin)
                except HTTPException as error:
                    return error.status_code
        results = await asyncio.gather(publish(), publish())
        assert sum(isinstance(result, dict) for result in results) == 1
        assert 409 in results
        # Reopen the connection: exported contents must be persisted, exact and tenant-bound.
        async with factory() as db:
            exported = await datasets.export_geojson(db, dataset_id=first['id'])
            assert exported['bluevector']['revision'] == 2
            assert len(exported['features']) == 3
            assert [f['geometry'] for f in exported['features']] == [f.geometry_geojson for f in parsed.features]
            assert exported['features'][0]['properties']['asset_type'] == 'PBO'
            assert exported['features'][0]['properties']['_bluevector']['source_attributes'] == parsed.features[0].properties
            assert exported['features'][0]['properties']['_bluevector']['source_id'] == 'pbo-1'
            layer = await db.scalar(select(GeoLayer).where(GeoLayer.dataset_id == first['id']).order_by(GeoLayer.id))
            assert len((await datasets.export_geojson(db, dataset_id=first['id'], layer_id=layer.id))['features']) == 1
            foreign_layer = await db.scalar(select(GeoLayer.id).where(GeoLayer.dataset_id == second['id']).limit(1))
            with pytest.raises(HTTPException) as error:
                await datasets.export_geojson(db, dataset_id=first['id'], layer_id=foreign_layer)
            assert error.value.status_code == 404
    finally:
        await engine.dispose()


def test_gis_and_client_rules_persist_in_postgres():
    admin_url = _admin_url()
    name = f'bluevector_gis_{uuid4().hex}'
    asyncio.run(_create_database(admin_url, name))
    try:
        asyncio.run(exercise(_database_url(admin_url, name)))
    finally:
        asyncio.run(_drop_database(admin_url, name))
