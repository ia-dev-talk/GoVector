import logging
import json
from pathlib import Path
import shutil
import tempfile
from zipfile import BadZipFile, ZipFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from openpyxl.utils.exceptions import InvalidFileException

from backend.auth.dependencies import get_current_user
from backend.database.models import User, UserRole
from backend.services.excel.pipeline import run_import_pipeline
from backend.services.excel.mapper import BASE_COLUMN_ALIASES


logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_EXTENSIONS = {".xlsx", ".xlsm", ".csv"}
_REQUIRED_OOXML_FILES = {
    "[Content_Types].xml",
    "xl/workbook.xml",
}


@router.get("/excel/contract")
async def import_contract(
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active or current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Accès administrateur requis.")
    return {
        "canonical_fields": sorted(BASE_COLUMN_ALIASES),
        "field_labels": {
            field: aliases[0] if aliases else field
            for field, aliases in BASE_COLUMN_ALIASES.items()
        },
        "aliases": BASE_COLUMN_ALIASES,
        "mapping_format": "canonical_field -> [excel_header, ...]",
        "column_override_format": "excel_header -> canonical_field | null",
        "header_row_override_format": "sheet_name -> one_based_row_number",
        "geocoding": "Nominatim; aucune coordonnée n'est inventée si la correspondance est incertaine.",
    }


@router.post("/excel")
async def import_excel(
    file: UploadFile = File(...),
    mapping_overrides: str | None = Form(None),
    column_overrides: str | None = Form(None),
    header_row_overrides: str | None = Form(None),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_active or current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès administrateur requis.",
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nom de fichier invalide.",
        )

    extension = Path(file.filename).suffix.lower()

    if extension not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formats acceptés : xlsx, xlsm, csv.",
        )

    filepath = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension,
        ) as tmp:
            filepath = tmp.name
            shutil.copyfileobj(file.file, tmp)
            file_size = tmp.tell()

        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Le fichier est vide.",
            )

        if extension in {".xlsx", ".xlsm"}:
            try:
                with ZipFile(filepath) as archive:
                    archive_files = set(archive.namelist())
            except BadZipFile:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Fichier Excel invalide.",
                )

            if not _REQUIRED_OOXML_FILES.issubset(archive_files):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Fichier Excel invalide.",
                )

        overrides = None
        if mapping_overrides:
            try:
                decoded = json.loads(mapping_overrides)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=422,
                    detail="Le mapping de colonnes n'est pas un JSON valide.",
                ) from exc
            if not isinstance(decoded, dict):
                raise HTTPException(status_code=422, detail="Le mapping doit être un objet JSON.")
            unknown_fields = sorted(set(decoded) - set(BASE_COLUMN_ALIASES))
            if unknown_fields:
                raise HTTPException(
                    status_code=422,
                    detail=f"Champs canoniques inconnus : {', '.join(unknown_fields)}.",
                )
            overrides = {
                str(field): [str(alias) for alias in aliases if str(alias).strip()]
                for field, aliases in decoded.items()
                if isinstance(aliases, list)
            }
            invalid_alias_lists = [
                str(field) for field, aliases in decoded.items()
                if not isinstance(aliases, list)
            ]
            if invalid_alias_lists:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Les alias doivent être des listes pour : "
                        + ", ".join(invalid_alias_lists)
                    ),
                )

        explicit_columns = None
        if column_overrides:
            try:
                decoded_columns = json.loads(column_overrides)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=422,
                    detail="Les corrections de colonnes ne sont pas un JSON valide.",
                ) from exc
            if not isinstance(decoded_columns, dict):
                raise HTTPException(
                    status_code=422,
                    detail="Les corrections de colonnes doivent être un objet JSON.",
                )
            invalid_fields = sorted({
                str(field)
                for field in decoded_columns.values()
                if field not in (None, "")
                and (
                    not isinstance(field, str)
                    or field not in BASE_COLUMN_ALIASES
                )
            })
            if invalid_fields:
                raise HTTPException(
                    status_code=422,
                    detail=f"Champs canoniques inconnus : {', '.join(invalid_fields)}.",
                )
            explicit_columns = {
                str(header): (str(field) if field not in (None, "") else None)
                for header, field in decoded_columns.items()
                if str(header).strip()
            }

        explicit_header_rows = None
        if header_row_overrides:
            try:
                decoded_rows = json.loads(header_row_overrides)
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=422,
                    detail="Les lignes d'en-tête ne sont pas un JSON valide.",
                ) from exc
            if not isinstance(decoded_rows, dict):
                raise HTTPException(
                    status_code=422,
                    detail="Les lignes d'en-tête doivent être un objet JSON.",
                )
            if any(
                not isinstance(row, int) or isinstance(row, bool) or row < 1
                for row in decoded_rows.values()
            ):
                raise HTTPException(
                    status_code=422,
                    detail="Chaque ligne d'en-tête doit être un entier positif.",
                )
            explicit_header_rows = {
                str(sheet): row for sheet, row in decoded_rows.items()
                if str(sheet).strip()
            }

        result = run_import_pipeline(
            filepath,
            mapping_overrides=overrides,
            column_overrides=explicit_columns,
            header_row_overrides=explicit_header_rows,
        )
        result["filename"] = file.filename
        return result

    except HTTPException:
        raise
    except (InvalidFileException, UnicodeDecodeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contenu du fichier invalide.",
        )
    except Exception:
        logger.exception(
            "Échec inattendu de la prévisualisation d’import Excel"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Impossible d’analyser le fichier.",
        )
    finally:
        if filepath:
            Path(filepath).unlink(missing_ok=True)
