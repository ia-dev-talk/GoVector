import pytest
from pydantic import ValidationError

from backend.config import Settings


def production_settings(**overrides):
    values = {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "s" * 48,
        "DEBUG": False,
        "API_RELOAD": False,
        "DATABASE_URL": "postgresql://bluevector_prod:strong-password@db.internal/bluevector",
        "CORS_ORIGINS": ["https://ops.example.com"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_settings_accept_explicit_https_origin() -> None:
    settings = production_settings()

    assert settings.ENVIRONMENT == "production"
    assert settings.CORS_ORIGINS == ["https://ops.example.com"]


def test_production_settings_reject_http_origin() -> None:
    with pytest.raises(ValidationError, match="HTTPS valide"):
        production_settings(CORS_ORIGINS=["http://ops.example.com"])


def test_production_settings_reject_localhost_origin() -> None:
    with pytest.raises(ValidationError, match="adresse locale"):
        production_settings(CORS_ORIGINS=["https://localhost:5173"])


def test_production_settings_reject_empty_origins() -> None:
    with pytest.raises(ValidationError, match="au moins une origine explicite"):
        production_settings(CORS_ORIGINS=[])


def test_staging_keeps_local_http_available_for_preproduction_validation() -> None:
    settings = Settings(
        _env_file=None,
        ENVIRONMENT="staging",
        SECRET_KEY="s" * 48,
        DEBUG=False,
        API_RELOAD=False,
        DATABASE_URL="postgresql://bluevector_stage:strong-password@db.internal/bluevector",
        CORS_ORIGINS=["http://localhost:5173"],
    )

    assert settings.CORS_ORIGINS == ["http://localhost:5173"]
