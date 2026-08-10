import inspect

import pytest
from pydantic import ValidationError

from backend.api.schemas.jobs import JobCreate, JobUpdate
from backend.database.models import Job, JobPriority, JobType
from backend.logic import jobs as job_logic
from backend.logic.job_contract import (
    JOB_CREATE_FIELD_MAPPING,
    JOB_CREATE_UNSUPPORTED_FIELDS,
    TECH_FIELD_MODEL_MAPPING,
    job_create_kwargs,
    technician_field_kwargs,
)


def _minimal_job_create(**overrides):
    values = {
        "customer_name": "Client",
        "service_address": "Adresse",
        "latitude": 33.5,
        "longitude": -7.6,
        "job_type": JobType.INSTALLATION,
    }
    values.update(overrides)
    return JobCreate(**values)


def test_every_declared_job_create_field_is_persisted_or_rejected():
    contract_fields = set(JOB_CREATE_FIELD_MAPPING) | set(
        JOB_CREATE_UNSUPPORTED_FIELDS
    ) | {"orienteur_id"}
    assert set(JobCreate.model_fields) == contract_fields

    create_parameters = set(inspect.signature(job_logic.create_job).parameters)
    assert set(JOB_CREATE_FIELD_MAPPING.values()) <= create_parameters


def test_supported_job_create_fields_are_mapped_without_loss():
    payload = _minimal_job_create(
        nro="NRO-A",
        sro="SRO-A",
        pbo="PBO-A",
        pto="PTO-A",
        splitter="SPL-A",
        splitter_port=7,
        optical_power_dbm=-19.4,
        cable_length_m=245,
        operator="Orange",
        planned_location_source="google_maps_shared_link",
        planned_location_precision="user_confirmed",
    )
    mapped = job_create_kwargs(payload, orienteur_id=4)
    assert mapped["nro_raw"] == "NRO-A"
    assert mapped["sro_raw"] == "SRO-A"
    assert mapped["pbo_raw"] == "PBO-A"
    assert mapped["pto_raw"] == "PTO-A"
    assert mapped["splitter_raw"] == "SPL-A"
    assert mapped["splitter_port_raw"] == 7
    assert mapped["orienteur_id"] == 4
    assert mapped["planned_location_source"] == "google_maps_shared_link"
    assert mapped["planned_location_precision"] == "user_confirmed"


@pytest.mark.parametrize(
    "overrides",
    [
        {"longitude": None},
        {"latitude": None},
        {
            "latitude": None,
            "longitude": None,
            "planned_location_source": "manual_coordinates",
        },
    ],
)
def test_planned_location_never_accepts_partial_or_orphaned_provenance(overrides):
    with pytest.raises(ValidationError) as error:
        _minimal_job_create(**overrides)
    message = str(error.value).lower()
    assert "latitude" in message or "provenance" in message


def test_planned_location_update_requires_both_coordinates():
    with pytest.raises(ValidationError) as error:
        JobUpdate(latitude=33.5)
    assert "ensemble" in str(error.value)


@pytest.mark.parametrize("field", sorted(JOB_CREATE_UNSUPPORTED_FIELDS))
def test_unpersisted_job_create_fields_are_rejected_explicitly(field):
    value = 1 if field in {
        "port_source", "port_destination", "nombre_fibres"
    } else "unsupported"
    with pytest.raises(ValidationError) as error:
        _minimal_job_create(**{field: value})
    assert "non supportés" in str(error.value)


def test_technician_network_fields_map_only_to_raw_columns():
    mapped = technician_field_kwargs(
        {
            "nro": " NRO-T ",
            "sro": "SRO-T",
            "pbo": "PBO-T",
            "pto": "PTO-T",
            "splitter": "SPL-T",
            "splitter_port": 3,
        }
    )
    assert mapped == {
        "nro_raw": "NRO-T",
        "sro_raw": "SRO-T",
        "pbo_raw": "PBO-T",
        "pto_raw": "PTO-T",
        "splitter_raw": "SPL-T",
        "splitter_port_raw": 3,
    }
    assert "pto" not in mapped


def test_absent_or_blank_technician_values_do_not_overwrite_existing_data():
    assert technician_field_kwargs({}) == {}
    assert technician_field_kwargs({"pto": None, "pbo": "   "}) == {}


def test_mapped_technician_values_do_not_corrupt_pto_relationship():
    job = Job(
        customer_name="Client",
        service_address="Adresse",
        latitude=33.5,
        longitude=-7.6,
        job_type=JobType.INSTALLATION,
        priority=JobPriority.NORMALE,
        required_skills=[],
    )
    job.pto_raw = "PTO-OLD"
    mapped = technician_field_kwargs({"pto": "PTO-NEW"})
    for name, value in mapped.items():
        setattr(job, name, value)
    assert job.pto_raw == "PTO-NEW"
    assert job.pto is None


def test_technician_contract_targets_real_job_attributes():
    assert set(TECH_FIELD_MODEL_MAPPING.values()) <= set(Job.__mapper__.attrs.keys())
