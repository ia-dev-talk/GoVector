from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.api.routes import export_center


async def _summary(_db, _filters):
    return {"total": 1}


@pytest.mark.asyncio
async def test_pdf_route_rejects_non_pdf_renderer_output(monkeypatch):
    async def fake_pdf(*_args, **_kwargs):
        return b"<html><body>not a pdf</body></html>"

    async def unexpected_log(**_kwargs):
        raise AssertionError("invalid PDF must never be logged as a successful export")

    monkeypatch.setattr(
        export_center.FieldOptExportService,
        "get_export_summary",
        _summary,
    )
    monkeypatch.setattr(export_center, "export_govector_pdf", fake_pdf)
    monkeypatch.setattr(
        export_center.FieldOptExportService,
        "log_export",
        unexpected_log,
    )

    request = export_center.ExportRequest(
        columns=["date"],
        export_format="pdf",
        export_name="Export BlueVector test",
    )

    with pytest.raises(HTTPException) as exc_info:
        await export_center.generate_export(
            request,
            db=object(),
            current_user=SimpleNamespace(id=7),
        )

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Erreur lors de la génération de l'export."


@pytest.mark.asyncio
async def test_pdf_route_accepts_pdf_magic_and_normalizes_visible_brand(monkeypatch):
    logged = {}

    async def fake_pdf(*_args, **_kwargs):
        return b"%PDF-1.7\nGoVector test"

    async def capture_log(**kwargs):
        logged.update(kwargs)

    monkeypatch.setattr(
        export_center.FieldOptExportService,
        "get_export_summary",
        _summary,
    )
    monkeypatch.setattr(export_center, "export_govector_pdf", fake_pdf)
    monkeypatch.setattr(
        export_center.FieldOptExportService,
        "log_export",
        capture_log,
    )

    response = await export_center.generate_export(
        export_center.ExportRequest(
            columns=["date"],
            export_format="pdf",
            export_name="Export BlueVector pilote",
        ),
        db=object(),
        current_user=SimpleNamespace(id=7),
    )

    assert response.media_type == "application/pdf"
    assert response.body.startswith(b"%PDF-")
    assert "Export GoVector pilote.pdf" in response.headers["content-disposition"]
    assert logged["export_name"] == "Export GoVector pilote"
