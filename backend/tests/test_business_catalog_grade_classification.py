from backend.api.schemas.settings import BusinessCatalogValues, CatalogItem


def _catalog_values(grades):
    return BusinessCatalogValues(
        technician_grades=grades,
        job_types=[],
        priorities=[],
        status_presentations=[],
        field_actions=[],
    )


def test_custom_grade_is_classified_by_server_when_metadata_is_missing():
    values = _catalog_values(
        [
            CatalogItem(
                code="expert_ftth",
                label="Expert FTTH",
                metadata={},
            )
        ]
    )

    assert values.technician_grades[0].metadata["custom"] is True


def test_system_grade_cannot_be_forged_as_custom_by_client_metadata():
    values = _catalog_values(
        [
            CatalogItem(
                code="junior",
                label="Technicien débutant",
                metadata={"custom": True, "source": "client"},
            ),
            CatalogItem(
                code="senior",
                label="Technicien senior",
                metadata={"custom": True},
            ),
        ]
    )

    assert values.technician_grades[0].metadata == {
        "custom": False,
        "source": "client",
    }
    assert values.technician_grades[1].metadata["custom"] is False


def test_custom_grade_cannot_be_forged_as_protected_by_client_metadata():
    values = _catalog_values(
        [
            CatalogItem(
                code="chef_equipe",
                label="Chef d'équipe",
                metadata={"custom": False, "scope": "field"},
            )
        ]
    )

    assert values.technician_grades[0].metadata == {
        "custom": True,
        "scope": "field",
    }
