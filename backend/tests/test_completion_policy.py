from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.api.schemas.settings import OperationalSettingsValues
from backend.database.models import JobStatus, JobType
from backend.logic import technician_jobs
from backend.logic.completion_policy import CompletionPolicy


class _Result:
    def __init__(self, value=None):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _Db:
    def __init__(self, document=None):
        self.document = document
        self.flush = AsyncMock()

    async def execute(self, _statement):
        return _Result(self.document)


def _job():
    return SimpleNamespace(
        id=8,
        status=JobStatus.CLIENT_VALIDATION,
        job_type=JobType.RACCORDEMENT,
        operator="Orange",
        client_signature=None,
        cable_length_m=None,
        optical_power_dbm=None,
        coordinator_comments=None,
        notes=None,
        ont_serial=None,
        router_serial=None,
        mac_address=None,
        nro_id=None,
        nro_raw=None,
        sro_id=None,
        sro_raw=None,
        pbo_id=None,
        pbo_raw=None,
        pto_id=None,
        pto_raw=None,
        gps_latitude=None,
        gps_longitude=None,
        before_photo=None,
        after_photo=None,
        assignment=SimpleNamespace(technician_id=3),
    )


@pytest.mark.asyncio
async def test_pilot_policy_makes_all_field_evidence_optional():
    assessment = await CompletionPolicy(_Db()).evaluate(_job())

    assert assessment.can_complete is True
    assert assessment.blocking_requirements == ()
    assert assessment.required_field_keys == ()
    assert "Signature client" in assessment.optional_missing
    assert "Longueur de câble" in assessment.optional_missing
    assert "Mesure optique" in assessment.optional_missing
    assert "Photo terrain" in assessment.optional_missing


@pytest.mark.asyncio
async def test_configured_requirement_can_become_blocking():
    values = OperationalSettingsValues.model_validate(
        {
            "completion_policy": {
                "default": {"require_client_signature": True}
            }
        }
    )
    document = SimpleNamespace(values=values.model_dump(mode="json"))
    assessment = await CompletionPolicy(_Db(document)).evaluate(_job())

    assert assessment.can_complete is False
    assert assessment.blocking_requirements == (
        "Signature client obligatoire",
    )
    assert assessment.required_field_keys == ("client_signature",)


@pytest.mark.asyncio
async def test_terminate_without_optional_evidence_reaches_validation(
    monkeypatch,
):
    job = _job()
    db = _Db()
    user = SimpleNamespace(id=3, technician_id=3)
    monkeypatch.setattr(
        technician_jobs,
        "require_assigned_job",
        AsyncMock(return_value=job),
    )

    async def transition(current_job, new_status, **_kwargs):
        current_job.status = new_status
        return current_job

    monkeypatch.setattr(
        technician_jobs.WorkflowEngine,
        "transition_job",
        AsyncMock(side_effect=transition),
    )

    result = await technician_jobs.terminate_technician_job(
        db,
        job_id=8,
        payload={},
        current_user=user,
    )

    assert result.status == JobStatus.EN_ATTENTE_VALIDATION
    db.flush.assert_awaited_once()
