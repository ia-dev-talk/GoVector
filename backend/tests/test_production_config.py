import pytest
from pydantic import ValidationError

from backend.config import Settings


def test_development_configuration_keeps_local_setup_available():
    settings = Settings(ENVIRONMENT="development")
    assert settings.APP_NAME == "GoVector"


def test_production_refuses_known_development_defaults():
    with pytest.raises(ValidationError) as error:
        Settings(ENVIRONMENT="production")

    message = str(error.value)
    assert "SECRET_KEY" in message
    assert "DATABASE_URL" in message


def test_production_accepts_explicit_safe_runtime_configuration():
    settings = Settings(
        ENVIRONMENT="production",
        DEBUG=False,
        API_RELOAD=False,
        SECRET_KEY="x" * 48,
        DATABASE_URL="postgresql+asyncpg://bluevector:strong@postgres:5432/bluevector",
        CORS_ORIGINS=["https://operations.example.com"],
    )

    assert settings.ENVIRONMENT == "production"
    assert settings.CORS_ORIGINS == ["https://operations.example.com"]
