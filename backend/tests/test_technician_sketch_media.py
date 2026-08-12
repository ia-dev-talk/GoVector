from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import tech_media


def test_sketch_accepts_image_media_and_uses_photo_limit(monkeypatch):
    settings = SimpleNamespace(
        TECHNICIAN_PHOTO_MAX_BYTES=12_345,
        TECHNICIAN_DOCUMENT_MAX_BYTES=98_765,
        TECHNICIAN_VIDEO_MAX_BYTES=123_456,
    )
    monkeypatch.setattr(tech_media, "get_settings", lambda: settings)

    tech_media._validate_mime("sketch", "image/png")
    assert tech_media._maximum_bytes("sketch") == 12_345
    assert "sketch" in tech_media._KINDS


def test_sketch_rejects_non_image_media():
    with pytest.raises(HTTPException) as exc_info:
        tech_media._validate_mime("sketch", "application/pdf")

    assert exc_info.value.status_code == 415
