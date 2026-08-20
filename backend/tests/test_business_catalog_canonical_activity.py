import pytest
from fastapi import HTTPException

from backend.api.routes import settings
from backend.api.schemas.settings import CatalogItem
from backend.database.models import JobStatus, JobType


def _with_alias(items, *, code, canonical, active=True):
    return [
        *items,
        CatalogItem(
            code=code,
            label=code.replace("_", " ").title(),
            color="#4B8DFF",
            sort_order=999,
            active=active,
            metadata={"custom": True, "canonical": canonical},
        ),
    ]


def test_active_alias_is_accepted_when_canonical_system_item_is_active():
    defaults = settings._catalog_defaults()
    submitted = _with_alias(
        defaults.job_types,
        code="installation_vip",
        canonical=JobType.INSTALLATION.value,
    )

    merged = settings._merge_extensible_catalog(
        submitted,
        defaults.job_types,
        section="job_types",
    )

    alias = next(item for item in merged if item.code == "installation_vip")
    assert alias.active is True
    assert alias.metadata["canonical"] == JobType.INSTALLATION.value


def test_active_alias_is_rejected_when_canonical_system_item_is_archived():
    defaults = settings._catalog_defaults()
    submitted = [
        item.model_copy(update={"active": False})
        if item.code == JobType.INSTALLATION.value
        else item
        for item in defaults.job_types
    ]
    submitted = _with_alias(
        submitted,
        code="installation_vip",
        canonical=JobType.INSTALLATION.value,
    )

    with pytest.raises(HTTPException) as raised:
        settings._merge_extensible_catalog(
            submitted,
            defaults.job_types,
            section="job_types",
        )

    assert raised.value.status_code == 422
    assert "installation_vip" in raised.value.detail
    assert JobType.INSTALLATION.value in raised.value.detail
    assert "archivé" in raised.value.detail


def test_archiving_canonical_requires_repairing_or_archiving_existing_alias():
    defaults = settings._catalog_defaults()
    submitted = [
        item.model_copy(update={"active": False})
        if item.code == JobType.INSTALLATION.value
        else item
        for item in defaults.job_types
    ]
    submitted = _with_alias(
        submitted,
        code="installation_vip",
        canonical=JobType.INSTALLATION.value,
        active=False,
    )

    merged = settings._merge_extensible_catalog(
        submitted,
        defaults.job_types,
        section="job_types",
    )

    alias = next(item for item in merged if item.code == "installation_vip")
    canonical = next(
        item for item in merged if item.code == JobType.INSTALLATION.value
    )
    assert canonical.active is False
    assert alias.active is False


def test_force_system_active_keeps_status_alias_contract_valid():
    defaults = settings._catalog_defaults()
    canonical_code = JobStatus.ON_SITE.value
    submitted = [
        item.model_copy(update={"active": False})
        if item.code == canonical_code
        else item
        for item in defaults.status_presentations
    ]
    submitted = _with_alias(
        submitted,
        code="sur_site_vip",
        canonical=canonical_code,
    )

    merged = settings._merge_extensible_catalog(
        submitted,
        defaults.status_presentations,
        section="status_presentations",
        force_system_active=True,
    )

    canonical = next(item for item in merged if item.code == canonical_code)
    alias = next(item for item in merged if item.code == "sur_site_vip")
    assert canonical.active is True
    assert alias.active is True
