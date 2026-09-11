import io
from zipfile import ZipFile

import pytest
from openpyxl import load_workbook

from backend.services.export_service import FieldOptExportService


@pytest.mark.asyncio
async def test_excel_workbook_uses_bluevector_visible_brand(monkeypatch):
    async def no_rows(_db, _filters, _columns):
        return []

    async def empty_summary(_db, _filters):
        return {
            "total": 0,
            "completed": 0,
            "in_progress": 0,
            "postponed": 0,
            "failed": 0,
            "pending": 0,
        }

    monkeypatch.setattr(FieldOptExportService, "get_jobs_data", no_rows)
    monkeypatch.setattr(FieldOptExportService, "get_export_summary", empty_summary)

    payload = await FieldOptExportService.export_excel(object(), ["date"], {})
    workbook = load_workbook(io.BytesIO(payload), read_only=True)

    assert workbook.sheetnames[0] == "Export GoVector"
    assert all(
        "FieldOpt" not in name and "BlueVector" not in name
        for name in workbook.sheetnames
    )


@pytest.mark.asyncio
async def test_photo_zip_uses_bluevector_workbook_name(monkeypatch):
    async def fake_excel(*_args, **_kwargs):
        return b"xlsx"

    async def no_jobs(*_args, **_kwargs):
        return []

    monkeypatch.setattr(FieldOptExportService, "export_excel", fake_excel)
    monkeypatch.setattr(FieldOptExportService, "get_filtered_jobs", no_jobs)

    payload = await FieldOptExportService.export_with_photos(
        object(), ["date"], {}
    )
    with ZipFile(io.BytesIO(payload)) as archive:
        assert archive.namelist() == ["export_bluevector.xlsx"]
