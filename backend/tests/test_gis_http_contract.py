from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.routes.gis_datasets import router
from backend.auth.dependencies import get_current_user
from backend.database.connection import get_db
from backend.database.models import UserRole
from backend.tests.test_kml_parser import KML, _kmz


def application(role):
    app = FastAPI()
    app.include_router(router)
    db = AsyncMock()
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role=role)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app), db


@pytest.mark.parametrize('role', [role for role in UserRole if role != UserRole.ADMIN])
def test_every_gis_route_rejects_non_admin_without_querying_data(role):
    client, db = application(role)
    assert client.get('/gis-datasets').status_code == 403
    assert client.get('/gis-datasets/1/layers').status_code == 403
    assert client.get('/gis-datasets/1/geojson').status_code == 403
    assert client.get('/gis-datasets/1/preview').status_code == 403
    assert client.post('/gis-datasets/1/publish', json={'expected_revision': 1}).status_code == 403
    assert client.post('/gis-datasets/preview', files={'file': ('test.kml', KML)}).status_code == 403
    assert client.post('/gis-datasets', files={'file': ('test.kml', KML)}, data={
        'name': 'Test', 'client_organization_id': 1, 'expected_sha256': 'a' * 64}).status_code == 403
    db.execute.assert_not_called()
    db.scalar.assert_not_called()
    db.get.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.parametrize('name,payload', [('test.kml', KML), ('test.kmz', _kmz())])
def test_multipart_preview_and_invalid_xml(name, payload):
    client, db = application(UserRole.ADMIN)
    response = client.post('/gis-datasets/preview', files={'file': (name, payload)})
    assert response.status_code == 200, response.text
    assert response.json()['feature_count'] == 3
    assert len(response.json()['sample']) == 3
    assert len(response.json()['sha256']) == 64
    assert client.post('/gis-datasets/preview', files={'file': ('test.kml', b'broken')}).status_code == 422
    db.commit.assert_not_called()


@pytest.mark.parametrize('endpoint', ['/gis-datasets/preview', '/gis-datasets'])
def test_multipart_dtd_is_rejected_before_any_persistence(endpoint):
    client, db = application(UserRole.ADMIN)
    payload = ('<?xml version="1.0" encoding="UTF-16"?>'
               '<!DOCTYPE kml [<!ENTITY label "forbidden">]>'
               '<kml><Placemark><name>&label;</name>'
               '<Point><coordinates>1,2</coordinates></Point></Placemark></kml>').encode('utf-16')
    response = client.post(endpoint, files={'file': ('hostile.kml', payload)}, data={
        'name': 'Rejected', 'client_organization_id': 1, 'expected_sha256': 'a' * 64})
    assert response.status_code == 422
    assert 'déclaration interdite' in response.json()['detail']
    db.execute.assert_not_called()
    db.get.assert_not_called()
    db.commit.assert_not_called()
