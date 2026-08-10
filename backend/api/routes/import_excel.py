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
        "aliases": BASE_COLUMN_ALIASES,
        "mapping_format": "canonical_field -> [excel_header, ...]",
        "geocoding": "Nominatim; aucune coordonnée n'est inventée si la correspondance est incertaine.",
    }


@router.post("/excel")
async def import_excel(
    file: UploadFile = File(...),
    mapping_overrides: str | None = Form(None),
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
            overrides = {
                str(field): [str(alias) for alias in aliases if str(alias).strip()]
                for field, aliases in decoded.items()
                if isinstance(aliases, list)
            }
        result = run_import_pipeline(filepath, mapping_overrides=overrides)
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
