from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS: dict[str, tuple[tuple[str, str], ...]] = {
    "frontend/src/pages/DashboardHome.jsx": (
        ("Chargement du tableau de bord GoVector…", "Chargement du tableau de bord BlueVector…"),
    ),
    "frontend/src/components/export/ExportCenter.jsx": (
        ("export_govector", "export_bluevector"),
        ("Export GoVector", "Export BlueVector"),
    ),
    "frontend/src/features/intervention-detail/InterventionEvidencePanel.jsx": (
        ("Site GoVector · révision", "Site BlueVector · révision"),
    ),
    "frontend/src/pages/StocksPage.jsx": (
        ("govector-stock-", "bluevector-stock-"),
    ),
    "backend/services/export_service.py": (
        ("Export GoVector", "Export BlueVector"),
        ("Rapport GoVector - Export FTTH", "Rapport BlueVector - Export FTTH"),
        ("par GoVector.", "par BlueVector."),
        ("export_govector.xlsx", "export_bluevector.xlsx"),
    ),
    "backend/tests/test_export_visible_branding.py": (
        ("uses_govector_visible_brand", "uses_bluevector_visible_brand"),
        ("uses_govector_workbook_name", "uses_bluevector_workbook_name"),
        ("Export GoVector", "Export BlueVector"),
        ("export_govector.xlsx", "export_bluevector.xlsx"),
        ('"BlueVector" not in name', '"GoVector" not in name'),
    ),
}

MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "ðŸ")


def replace_checked(path: Path, pairs: tuple[tuple[str, str], ...]) -> bool:
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    before = text

    for old, new in pairs:
        if old in text:
            text = text.replace(old, new)

    if text == before:
        return False

    introduced = [marker for marker in MOJIBAKE_MARKERS if marker in text and marker not in before]
    if introduced:
        raise RuntimeError(f"{path}: nouveaux marqueurs mojibake détectés: {introduced}")

    bom = raw.startswith(b"\xef\xbb\xbf")
    encoded = text.encode("utf-8")
    if bom:
        encoded = b"\xef\xbb\xbf" + encoded
    path.write_bytes(encoded)
    return True


def main() -> None:
    changed: list[str] = []
    for relative, pairs in REPLACEMENTS.items():
        path = ROOT / relative
        if not path.is_file():
            raise FileNotFoundError(relative)
        if replace_checked(path, pairs):
            changed.append(relative)

    guarded = [
        ROOT / "frontend/src/pages/DashboardHome.jsx",
        ROOT / "frontend/src/components/export/ExportCenter.jsx",
        ROOT / "frontend/src/features/intervention-detail/InterventionEvidencePanel.jsx",
        ROOT / "frontend/src/pages/StocksPage.jsx",
    ]
    for path in guarded:
        source = path.read_text(encoding="utf-8-sig")
        for legacy in ("GoVector", "GOVECTOR", "govector-stock-"):
            if legacy in source:
                raise RuntimeError(f"{path}: branding visible historique restant: {legacy}")

    print("CHANGED", *changed, sep="\n- ")


if __name__ == "__main__":
    main()
