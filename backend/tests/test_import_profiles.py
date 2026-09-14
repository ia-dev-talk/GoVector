import pytest
from pydantic import ValidationError

from backend.api.routes import import_excel


def _dependency_names(route):
    return {
        dependency.call.__name__
        for dependency in route.dependant.dependencies
        if dependency.call is not None
    }


def test_import_profiles_are_office_orienteur_scoped():
    profile_routes = [
        route
        for route in import_excel.router.routes
        if route.path.startswith("/excel/profiles")
    ]
    assert profile_routes
    assert all(
        "require_office_orienteur" in _dependency_names(route)
        for route in profile_routes
    )


def test_import_preview_and_contract_are_office_orienteur_scoped():
    routes = [
        route
        for route in import_excel.router.routes
        if route.path in {"/excel", "/excel/contract"}
    ]
    assert len(routes) == 2
    assert all(
        "require_office_orienteur" in _dependency_names(route)
        for route in routes
    )


def test_import_profile_preserves_explicit_unknown_and_header_decisions():
    profile = import_excel.ImportProfileValues(
        name="  Plaque commandes IAM  ",
        operator=" IAM ",
        column_overrides={
            "Adresse client": "ADRESSE",
            "Colonne métier inconnue": None,
        },
        header_row_overrides={"Commandes": 3},
    )

    assert profile.name == "Plaque commandes IAM"
    assert profile.operator == "IAM"
    assert profile.column_overrides["Adresse client"] == "ADRESSE"
    assert profile.column_overrides["Colonne métier inconnue"] is None
    assert profile.header_row_overrides == {"Commandes": 3}


def test_import_profile_rejects_unknown_canonical_fields_and_invalid_rows():
    with pytest.raises(ValidationError):
        import_excel.ImportProfileValues(
            name="Invalide",
            column_overrides={"Colonne": "invented_field"},
        )
    with pytest.raises(ValidationError):
        import_excel.ImportProfileValues(
            name="Invalide",
            header_row_overrides={"Feuille": 0},
        )
