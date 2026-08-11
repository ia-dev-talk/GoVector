import logging
import json
from datetime import datetime, timezone
from pathlib import Path
import shutil
import tempfile
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import get_current_user, require_admin
from backend.database.connection import get_db
from backend.database.models import ApplicationSetting, User, UserRole
from backend.logic.operational_audit import record_operational_audit
from backend.services.excel.pipeline import run_import_pipeline
from backend.services.excel.mapper import BASE_COLUMN_ALIASES


logger = logging.getLogger(__name__)
router = APIRouter()

_ALLOWED_EXTENSIONS = {".xlsx", ".xlsm", ".csv"}
_REQUIRED_OOXML_FILES = {
    "[Content_Types].xml",
    "xl/workbook.xml",
}
_IMPORT_PROFILE_NAMESPACE = "import_profiles"
_IMPORT_PROFILE_SCHEMA_VERSION = 1


class ImportProfileValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    operator: str | None = Field(default=None, max_length=40)
    column_overrides: dict[str, str | None] = Field(default_factory=dict)
    header_row_overrides: dict[str, int] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def _trim_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Le nom du profil est obligatoire")
        return normalized

    @field_validator("operator")
    @classmethod
    def _trim_operator(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("column_overrides")
    @classmethod
    def _validate_columns(cls, values: dict[str, str | None]) -> dict[str, str | None]:
        invalid = sorted({value for value in values.values() if value is not None and value not in BASE_COLUMN_ALIASES})
        if invalid:
            raise ValueError(f"Champs canoniques inconnus : {', '.join(invalid)}")
        return {
            str(header).strip(): field
            for header, field in values.items()
            if str(header).strip()
        }

    @field_validator("header_row_overrides")
    @classmethod
    def _validate_rows(cls, values: dict[str, int]) -> dict[str, int]:
        if any(not isinstance(row, int) or isinstance(row, bool) or row < 1 for row in values.values()):
            raise ValueError("Chaque ligne d'en-tête doit être un entier positif")
        return {str(sheet).strip(): row for sheet, row in values.items() if str(sheet).strip()}


class ImportProfileWrite(ImportProfileValues):
    expected_revision: int = Field(ge=0)


async def _profile_document(db: AsyncSession) -> ApplicationSetting | None:
    return await db.scalar(
        select(ApplicationSetting).where(ApplicationSetting.namespace == _IMPORT_PROFILE_NAMESPACE)
    )


def _profile_response(document: ApplicationSetting | None) -> dict:
    return {
        "revision": int(document.revision or 0) if document else 0,
        "profiles": list((document.values or {}).get("profiles", [])) if document else [],
    }


async def _write_profiles(
    db: AsyncSession,
    *,
    current_user: User,
    expected_revision: int,
    profiles: list[dict],
    action: str,
    profile_id: str,
) -> ApplicationSetting:
    document = await _profile_document(db)
    current_revision = int(document.revision or 0) if document else 0
    if document is not None and document.schema_version > _IMPORT_PROFILE_SCHEMA_VERSION:
        raise HTTPException(
            status_code=409,
            detail="Les profils utilisent une version plus récente que cette API.",
        )
    if expected_revision != current_revision:
        raise HTTPException(status_code=409, detail="Les profils ont été modifiés. Rechargez avant de réessayer.")
    previous = list((document.values or {}).get("profiles", [])) if document else []
    if document is None:
        document = ApplicationSetting(
            namespace=_IMPORT_PROFILE_NAMESPACE,
            schema_version=_IMPORT_PROFILE_SCHEMA_VERSION,
            revision=1,
            values={"profiles": profiles},
            updated_by=current_user.id,
        )
        db.add(document)
    else:
        document.schema_version = _IMPORT_PROFILE_SCHEMA_VERSION
        document.revision = current_revision + 1
        document.values = {"profiles": profiles}
        document.updated_by = current_user.id
    record_operational_audit(
        db,
        current_user=current_user,
        action=action,
        entity_type="import_profile",
        entity_id=profile_id,
        before={"revision": current_revision, "profiles": previous},
        after={"revision": document.revision, "profiles": profiles},
    )
    try:
        await db.commit()
        await db.refresh(document)
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Les profils ont été modifiés simultanément.") from error
    return document


@router.get("/excel/profiles")
async def list_import_profiles(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_admin),
):
    return _profile_response(await _profile_document(db))


@router.post("/excel/profiles")
async def create_import_profile(
    payload: ImportProfileWrite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    document = await _profile_document(db)
    profiles = list((document.values or {}).get("profiles", [])) if document else []
    if any(str(item.get("name", "")).casefold() == payload.name.casefold() for item in profiles):
        raise HTTPException(status_code=409, detail="Un profil porte déjà ce nom.")
    now = datetime.now(timezone.utc).isoformat()
    profile_id = str(uuid4())
    profiles.append({
        "id": profile_id,
        **payload.model_dump(exclude={"expected_revision"}, mode="json"),
        "created_at": now,
        "updated_at": now,
        "updated_by": current_user.id,
    })
    saved = await _write_profiles(
        db,
        current_user=current_user,
        expected_revision=payload.expected_revision,
        profiles=profiles,
        action="import.profile_created",
        profile_id=profile_id,
    )
    return _profile_response(saved)


@router.put("/excel/profiles/{profile_id}")
async def update_import_profile(
    profile_id: str,
    payload: ImportProfileWrite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    document = await _profile_document(db)
    profiles = list((document.values or {}).get("profiles", [])) if document else []
    existing = next((item for item in profiles if item.get("id") == profile_id), None)
    if existing is None:
        raise HTTPException(status_code=404, detail="Profil d'import introuvable.")
    if any(
        item.get("id") != profile_id
        and str(item.get("name", "")).casefold() == payload.name.casefold()
        for item in profiles
    ):
        raise HTTPException(status_code=409, detail="Un profil porte déjà ce nom.")
    now = datetime.now(timezone.utc).isoformat()
    replacement = {
        "id": profile_id,
        **payload.model_dump(exclude={"expected_revision"}, mode="json"),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
        "updated_by": current_user.id,
    }
    profiles = [replacement if item.get("id") == profile_id else item for item in profiles]
    saved = await _write_profiles(
        db,
        current_user=current_user,
        expected_revision=payload.expected_revision,
        profiles=profiles,
        action="import.profile_updated",
        profile_id=profile_id,
    )
    return _profile_response(saved)


@router.delete("/excel/profiles/{profile_id}")
async def delete_import_profile(
    profile_id: str,
    expected_revision: int = Query(..., ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    document = await _profile_document(db)
    profiles = list((document.values or {}).get("profiles", [])) if document else []
    if not any(item.get("id") == profile_id for item in profiles):
        raise HTTPException(status_code=404, detail="Profil d'import introuvable.")
    saved = await _write_profiles(
        db,
        current_user=current_user,
        expected_revision=expected_revision,
        profiles=[item for item in profiles if item.get("id") != profile_id],
        action="import.profile_deleted",
        profile_id=profile_id,
    )
    return _profile_response(saved)


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
