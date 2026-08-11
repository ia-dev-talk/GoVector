import hashlib
from io import BytesIO
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import UploadFile
from fastapi import HTTPException
from starlette.datastructures import Headers

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.api.routes import tech_media
from backend.database.models import (
    Job,
    JobSiteObservation,
    JobStatus,
    TechnicianFieldAction,
    UserRole,
)
from backend.logic import technician_field_actions
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.services.media_storage import FileSystemMediaStorage, MediaStorageError


class _FieldActionDb:
    def __init__(self):
        self.added = []
        self.flush = AsyncMock()

    async def scalar(self, _statement):
        # No persisted business catalog in these unit tests: production falls
        # back to the complete supported action set.
        return None

    def add(self, value):
        if isinstance(value, TechnicianFieldAction):
            value.id = len(self.added) + 1
        self.added.append(value)


def _user(technician_id=3):
    return SimpleNamespace(
        id=3,
        role=UserRole.TECHNICIAN,
        technician_id=technician_id,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event_type", "payload"),
    [
        ("intervention_comment", {"value": "Boîtier remplacé"}),
        ("custom_intervention_action", {"value": "Contrôle visuel"}),
        ("equipment_scan", {"code": "ONT-42"}),
        ("field_measurement", {"measurement_type": "optical", "value": -19.4}),
        ("otdr_measurement", {"measurement_type": "otdr", "value": "2456 m"}),
        ("incident_report", {"comment": "Port saturé"}),
        ("installation_work", {"note": "PTO installé"}),
        ("network_reference", {"reference": "PBO_BSK_112"}),
        ("material_used", {"article": "Jarretière", "quantity": 1}),
        ("gps_position", {"latitude": 33.57, "longitude": -7.59}),
        ("client_call", {"outcome": "Client joint"}),
    ],
)
async def test_structured_field_action_is_persisted_and_logged(
    monkeypatch,
    event_type,
    payload,
):
    db = _FieldActionDb()
    log = AsyncMock()
    monkeypatch.setattr(
        technician_field_actions,
        "require_assigned_job",
        AsyncMock(return_value=SimpleNamespace(id=8)),
    )
    monkeypatch.setattr(technician_field_actions, "log_job_activity", log)

    event_id = str(uuid4())
    action = await technician_field_actions.record_technician_field_action(
        db,
        event_id=event_id,
        occurred_at=SimpleNamespace(),
        job_id=8,
        event_type=event_type,
        payload=payload,
        current_user=_user(),
    )

    assert action.event_id == event_id
    assert action.job_id == 8
    assert action.payload == payload
    log.assert_awaited_once()


@pytest.mark.asyncio
async def test_measurement_requires_type_and_value(monkeypatch):
    monkeypatch.setattr(
        technician_field_actions,
        "require_assigned_job",
        AsyncMock(return_value=SimpleNamespace(id=8)),
    )
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await technician_field_actions.record_technician_field_action(
            _FieldActionDb(),
            event_id=str(uuid4()),
            occurred_at=SimpleNamespace(),
            job_id=8,
            event_type="field_measurement",
            payload={"measurement_type": "optical"},
            current_user=_user(),
        )
    assert exc_info.value.code == "invalid_payload"


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["site_location", "cable_entry", "cable_exit"])
async def test_structured_geolocation_is_append_only_site_evidence(
    monkeypatch, event_type
):
    db = _FieldActionDb()
    monkeypatch.setattr(
        technician_field_actions,
        "require_assigned_job",
        AsyncMock(return_value=SimpleNamespace(id=8)),
    )
    monkeypatch.setattr(
        technician_field_actions, "log_job_activity", AsyncMock()
    )

    await technician_field_actions.record_technician_field_action(
        db,
        event_id=str(uuid4()),
        occurred_at=SimpleNamespace(),
        job_id=8,
        event_type=event_type,
        payload={"latitude": 33.5731, "longitude": -7.5898, "accuracy": 4.5},
        current_user=_user(),
    )

    observation = next(
        value for value in db.added if isinstance(value, JobSiteObservation)
    )
    assert observation.observation_type == event_type
    assert observation.job_id == 8
    assert observation.accuracy_m == 4.5


def _upload(data: bytes, content_type: str = "image/jpeg") -> UploadFile:
    return UploadFile(
        BytesIO(data),
        filename="capture.jpg",
        headers=Headers({"content-type": content_type}),
    )


@pytest.mark.asyncio
async def test_filesystem_media_storage_streams_and_checks_hash(tmp_path):
    content = b"pilot-photo-content"
    digest = hashlib.sha256(content).hexdigest()
    result = await FileSystemMediaStorage(tmp_path).store(
        _upload(content),
        storage_key="3/attachment.jpg",
        expected_sha256=digest,
        maximum_bytes=1024,
    )

    assert result.size_bytes == len(content)
    assert result.sha256 == digest
    assert (tmp_path / result.storage_key).read_bytes() == content


@pytest.mark.asyncio
async def test_filesystem_media_storage_rejects_bad_hash_without_final_file(
    tmp_path,
):
    with pytest.raises(MediaStorageError, match="SHA-256"):
        await FileSystemMediaStorage(tmp_path).store(
            _upload(b"content"),
            storage_key="3/attachment.jpg",
            expected_sha256="0" * 64,
            maximum_bytes=1024,
        )
    assert not (tmp_path / "3/attachment.jpg").exists()


def test_media_route_is_technician_scoped():
    route = next(route for route in tech_media.router.routes if route.path == "/media")
    dependency_names = {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }
    assert "require_technician" in dependency_names
    assert "require_orienteur" not in dependency_names


class _MediaDb:
    def __init__(self, existing=None):
        self.existing = existing
        self.added = []
        self.commit = AsyncMock()

    async def scalar(self, _statement):
        return Job(id=8, job_type="INSTALLATION", status=JobStatus.FAILED)

    async def execute(self, _statement):
        return SimpleNamespace(scalar_one_or_none=lambda: self.existing)

    def add(self, value):
        self.added.append(value)

    async def refresh(self, value):
        from datetime import datetime, timezone

        value.created_at = datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_media_upload_is_streamed_persisted_and_idempotent(
    monkeypatch,
    tmp_path,
):
    content = b"one pilot photo"
    digest = hashlib.sha256(content).hexdigest()
    settings = SimpleNamespace(
        TECHNICIAN_MEDIA_ROOT=str(tmp_path),
        TECHNICIAN_PHOTO_MAX_BYTES=1024,
        TECHNICIAN_DOCUMENT_MAX_BYTES=1024,
        TECHNICIAN_VIDEO_MAX_BYTES=1024,
    )
    monkeypatch.setattr(tech_media, "get_settings", lambda: settings)
    collaboration = AsyncMock()
    monkeypatch.setattr(
        tech_media, "require_job_collaboration_access", collaboration
    )
    db = _MediaDb()
    attachment_id = uuid4()

    created = await tech_media.upload_technician_media(
        attachment_id=attachment_id,
        job_id=8,
        kind="photo",
        sha256=digest,
        metadata='{"label":"before"}',
        file=_upload(content),
        db=db,
        current_user=_user(),
    )

    assert created.attachment_id == attachment_id
    assert created.sha256 == digest
    assert created.size_bytes == len(content)
    assert len(db.added) == 1
    collaboration.assert_awaited()
    assert (tmp_path / db.added[0].storage_key).read_bytes() == content
    db.existing = db.added[0]

    replay = await tech_media.upload_technician_media(
        attachment_id=attachment_id,
        job_id=8,
        kind="photo",
        sha256=digest,
        metadata="{}",
        file=_upload(content),
        db=db,
        current_user=_user(),
    )
    assert replay.media_id == created.media_id
    assert replay.idempotent_replay is True
    assert len(db.added) == 1


@pytest.mark.asyncio
async def test_media_attachment_id_reuse_with_different_hash_conflicts(
    monkeypatch,
):
    from datetime import datetime, timezone

    attachment_id = uuid4()
    existing = SimpleNamespace(
        media_id=str(uuid4()),
        attachment_id=str(attachment_id),
        job_id=8,
        kind="photo",
        mime_type="image/jpeg",
        size_bytes=1,
        sha256="a" * 64,
        created_at=datetime.now(timezone.utc),
    )
    monkeypatch.setattr(
        tech_media,
        "require_job_collaboration_access",
        AsyncMock(),
    )
    with pytest.raises(HTTPException) as exc_info:
        await tech_media.upload_technician_media(
            attachment_id=attachment_id,
            job_id=8,
            kind="photo",
            sha256="b" * 64,
            metadata="{}",
            file=_upload(b"b"),
            db=_MediaDb(existing),
            current_user=_user(),
        )
    assert exc_info.value.status_code == 409
