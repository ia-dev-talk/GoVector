import pytest

from backend.services import govector_pdf_export


@pytest.mark.asyncio
async def test_govector_pdf_renderer_owns_visible_brand_and_escapes_values(monkeypatch):
    captured = {}

    async def fake_rows(_db, _filters, _columns):
        return [
            {
                "Commande": "GV-42",
                "Client": "Client <FTTH>",
                "Longueur câble": "92 m",
            }
        ]

    async def fake_summary(_db, _filters):
        return {
            "total": 1,
            "completed": 1,
            "in_progress": 0,
            "failed": 0,
        }

    class FakeHTML:
        def __init__(self, *, string):
            captured["html"] = string

        def write_pdf(self):
            return b"%PDF-1.7\nfixture"

    monkeypatch.setattr(
        govector_pdf_export.FieldOptExportService,
        "get_jobs_data",
        fake_rows,
    )
    monkeypatch.setattr(
        govector_pdf_export.FieldOptExportService,
        "get_export_summary",
        fake_summary,
    )
    monkeypatch.setattr(govector_pdf_export, "HTML", FakeHTML)

    pdf = await govector_pdf_export.export_govector_pdf(
        object(),
        ["commande", "client", "longueur_cable"],
        {},
    )

    assert pdf.startswith(b"%PDF-")
    html = captured["html"]
    assert "GoVector" in html
    assert "Interventions &amp; Stocks FTTH" in html
    assert "FieldOpt" not in html
    assert "BlueVector" not in html
    assert "Client &lt;FTTH&gt;" in html
    assert "92 m" in html
