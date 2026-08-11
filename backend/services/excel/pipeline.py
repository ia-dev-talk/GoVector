"""
Run the full Excel import pipeline and return preview data.
"""
from backend.services.excel.importer import ExcelImporter
from backend.services.excel.extractor import ExcelExtractor
from backend.services.excel.normalizer import ExcelNormalizer
from backend.services.excel.mapper import ExcelMapper
from backend.services.excel.jobs_builder import JobsBuilder
from backend.services.excel.validator import ExcelValidator
from backend.services.excel.preview import ExcelPreview
from backend.services.geocoding import enrich_jobs_coordinates


def _remove_estimated_coordinates(
    jobs: list[dict],
) -> list[dict]:
    cleaned_jobs = []

    for job in jobs:
        if job.get("gps_source") != "estimated":
            cleaned_jobs.append(job)
            continue

        copy = dict(job)
        copy["latitude"] = None
        copy["longitude"] = None
        copy["gps_source"] = None

        warnings = [
            warning
            for warning in (
                copy.get("import_warnings") or []
            )
            if warning != (
                "Aucun GPS Excel valide : "
                "coordonnées temporaires estimées."
            )
        ]

        warning = (
            "Géocodage désactivé : "
            "aucune coordonnée GPS fiable."
        )
        if warning not in warnings:
            warnings.append(warning)

        copy["import_warnings"] = warnings

        meta = dict(copy.get("_meta") or {})
        meta["geocoded"] = False
        copy["_meta"] = meta

        cleaned_jobs.append(copy)

    return cleaned_jobs


def run_import_pipeline(
    filepath: str,
    geocode: bool = True,
    mapping_overrides: dict[str, list[str]] | None = None,
    column_overrides: dict[str, str | None] | None = None,
    header_row_overrides: dict[str, int] | None = None,
) -> dict:

    importer = ExcelImporter(filepath)
    operator = importer.operator
    info = importer.info()

    workbook = importer.get_sheets()

    extracted = ExcelExtractor(workbook).extract()
    normalized = ExcelNormalizer(extracted).normalize()
    mapped = ExcelMapper(
        normalized,
        operator=operator,
        mapping_overrides=mapping_overrides,
        column_overrides=column_overrides,
        header_row_overrides=header_row_overrides,
    ).map()
    info["mapping_diagnostics"] = [
        {
            "sheet": sheet["sheet"],
            "mapping": dict(sheet["mapping"]),
            "headers": list(sheet.get("headers") or []),
            "unmapped_headers": list(sheet.get("unmapped_headers") or []),
            "header_row": sheet.get("header_row"),
            "header_detection": sheet.get("header_detection"),
            "header_confidence": sheet.get("header_confidence"),
            "header_candidates": list(sheet.get("header_candidates") or []),
            "column_matches": list(sheet.get("column_matches") or []),
        }
        for sheet in mapped
    ]
    jobs = JobsBuilder(mapped, operator=operator).build()

    if geocode:
        jobs = enrich_jobs_coordinates(jobs)
    else:
        jobs = _remove_estimated_coordinates(jobs)

    validation = ExcelValidator(jobs).validate()
    preview = ExcelPreview(validation, info=info)

    return preview.build()
