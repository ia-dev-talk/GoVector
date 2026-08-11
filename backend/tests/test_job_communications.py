from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.database.models import Job, JobCommunication, JobStatus, UserRole
from backend.logic import job_communications
from backend.logic.technician_jobs import TechnicianJobMutationError
from backend.logic.technician_sync import SUPPORTED_SYNC_EVENT_TYPES


class _CommunicationDb:
    def __init__(self, parent=None):
        self.parent = parent
        self.added = []
        self.flush = AsyncMock(side_effect=self._assign_id)

    def add(self, value):
        self.added.append(value)

    async def scalar(self, _query):
        return self.parent

    def _assign_id(self):
        for index, value in enumerate(self.added, start=1):
            if isinstance(value, JobCommunication) and value.id is None:
                value.id = index


def _user(role=UserRole.TECHNICIAN):
    return SimpleNamespace(
        id=7,
        username="karim",
        role=role,
        technician_id=3 if role == UserRole.TECHNICIAN else None,
    )


@pytest.mark.asyncio
async def test_terminal_job_accepts_append_only_reply_without_status_mutation(monkeypatch):
    db = _CommunicationDb()
    log = AsyncMock()
    monkeypatch.setattr(job_communications, "log_job_activity", log)
    job = Job(job_type="INSTALLATION", status=JobStatus.FAILED)

    item = await job_communications.create_job_communication(
        db,
        job_id=8,
        message_type="reply",
        body="Le PBO est inaccessible côté cour.",
        current_user=_user(),
        source="mobile_outbox",
        audience="office",
        event_id="1d1661c5-bf25-4093-8c0f-4dd169f9aa12",
    )

    assert item.author_technician_id == 3
    assert item.audience == "office"
    assert item.body == "Le PBO est inaccessible côté cour."
    assert job.status == JobStatus.FAILED
    log.assert_awaited_once()


@pytest.mark.asyncio
async def test_only_office_can_create_a_correction_request(monkeypatch):
    monkeypatch.setattr(job_communications, "log_job_activity", AsyncMock())
    with pytest.raises(TechnicianJobMutationError) as exc_info:
        await job_communications.create_job_communication(
            _CommunicationDb(),
            job_id=8,
            message_type="correction_request",
            body="Ajouter une photo du cheminement.",
            current_user=_user(),
            source="mobile",
        )
    assert exc_info.value.code == "permission_denied"


@pytest.mark.asyncio
async def test_acknowledgement_updates_request_state_and_keeps_a_child_record(monkeypatch):
    parent = JobCommunication(
        id=11,
        job_id=8,
        message_type="correction_request",
        body="Confirmer le repère.",
        author_user_id=2,
        author_role=UserRole.ORIENTEUR.value,
        source="web",
        audience="field",
        requires_action=True,
        status="open",
        created_at=datetime.now(timezone.utc),
    )
    db = _CommunicationDb(parent=parent)
    monkeypatch.setattr(job_communications, "log_job_activity", AsyncMock())

    child = await job_communications.create_job_communication(
        db,
        job_id=8,
        message_type="acknowledgement",
        body="Message pris en compte",
        parent_id=11,
        current_user=_user(),
        source="mobile_outbox",
    )

    assert child.parent_id == 11
    assert parent.status == "acknowledged"
    assert parent.acknowledged_at is not None


def test_technician_outbox_supports_structured_job_communications():
    assert "job_communication" in SUPPORTED_SYNC_EVENT_TYPES
