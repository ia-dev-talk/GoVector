# -*- coding: utf-8 -*-
"""
Routes API du Centre d'Export FieldOpt.
Permet de générer des exports Excel, CSV, PDF personnalisables.
"""
import logging
import time
from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.connection import get_db
from backend.database.models import ExportTemplate, User
from backend.auth.dependencies import get_current_user, require_chef_orienteur
from backend.services.export_service import FieldOptExportService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Export Center"])


# ═══════════════════════════════════════════════════════════════
# SCHÉMAS Pydantic
# ═══════════════════════════════════════════════════════════════


class ExportRequest(BaseModel):
    """Requête de génération d'export."""
    columns: List[str] = Field(
        default_factory=lambda: [
            "date", "commande", "client", "contact", "adresse",
            "operateur", "statut", "technicien",
        ],
        description="Liste des colonnes à exporter (clés techniques)",
    )
    filters: Optional[dict] = Field(
        default=None,
        description="Filtres à appliquer (date_preset, operator, status, etc.)",
    )
    export_format: str = Field(
        default="excel",
        pattern="^(excel|csv|pdf|zip)$",
        description="Format d'export (excel, csv, pdf, zip)",
    )
    include_photos: bool = Field(default=False, description="Inclure les photos")
    include_signatures: bool = Field(default=True, description="Inclure les signatures")
    template_id: Optional[int] = Field(
        default=None, description="ID du modèle à utiliser"
    )
    export_name: Optional[str] = Field(
        default=None, description="Nom personnalisé pour l'export"
    )


class TemplateCreate(BaseModel):
    """Création d'un modèle d'export."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    export_type: str = Field(default="excel", pattern="^(excel|csv|pdf)$")
    columns: List[str] = Field(default_factory=list)
    filters: Optional[dict] = Field(default=None)
    include_photos: bool = Field(default=False)
    include_signatures: bool = Field(default=True)
    is_default: bool = Field(default=False)


class TemplateUpdate(BaseModel):
    """Mise à jour d'un modèle d'export."""
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    export_type: Optional[str] = Field(default=None, pattern="^(excel|csv|pdf)$")
    columns: Optional[List[str]] = Field(default=None)
    filters: Optional[dict] = Field(default=None)
    include_photos: Optional[bool] = Field(default=None)
    include_signatures: Optional[bool] = Field(default=None)
    is_default: Optional[bool] = Field(default=None)


async def _ensure_template_mutation_access(
    db: AsyncSession,
    template_id: int,
    current_user: User,
) -> None:
    """Reject cross-owner template mutations while preserving ADMIN access."""
    if current_user.role == "ADMIN":
        return

    result = await db.execute(
        select(ExportTemplate.id).where(
            ExportTemplate.id == template_id,
            ExportTemplate.created_by == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        # Hide existence from users who do not own the template.
        raise HTTPException(status_code=404, detail="Modèle d'export introuvable.")


# ═══════════════════════════════════════════════════════════════
# ROUTES EXPORT
# ═══════════════════════════════════════════════════════════════


@router.post("/export/generate")
async def generate_export(
    request: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """
    Génère un fichier d'export (Excel, CSV, PDF) selon les paramètres.
    Retourne le fichier directement en téléchargement.
    """
    start_time = time.time()
    columns = request.columns
    filters = request.filters or {}
    export_format = request.export_format

    try:
        # Résumé avant génération
        summary = await FieldOptExportService.get_export_summary(db, filters)
        job_count = summary["total"]

        # Génération selon le format
        if export_format == "excel":
            file_bytes = await FieldOptExportService.export_excel(
                db, columns, filters,
                request.include_photos, request.include_signatures,
            )
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            extension = "xlsx"
        elif export_format == "csv":
            file_bytes = await FieldOptExportService.export_csv(db, columns, filters)
            media_type = "text/csv"
            extension = "csv"
        elif export_format == "pdf":
            file_bytes = await FieldOptExportService.export_pdf(
                db, columns, filters,
                request.include_photos, request.include_signatures,
            )
            media_type = "application/pdf"
            extension = "pdf"
        elif export_format == "zip":
            file_bytes = await FieldOptExportService.export_with_photos(db, columns, filters)
            media_type = "application/zip"
            extension = "zip"
        else:
            raise HTTPException(status_code=400, detail="Format d'export non supporté.")

        duration = time.time() - start_time

        # Journalisation dans l'historique
        export_name = request.export_name or f"Export {datetime.now().strftime('%Y%m%d_%H%M%S')}"
        await FieldOptExportService.log_export(
            db=db,
            user_id=current_user.id,
            template_id=request.template_id,
            export_name=export_name,
            export_format=export_format,
            job_count=job_count,
            filters_used=filters,
            columns_used=columns,
            has_photos=request.include_photos,
            has_signatures=request.include_signatures,
            file_size_bytes=len(file_bytes),
            duration_seconds=duration,
        )

        filename = f"{export_name}.{extension}"
        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(file_bytes)),
            },
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Erreur lors de la génération de l'export : %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Erreur lors de la génération de l'export."
        )


@router.post("/export/preview")
async def preview_export(
    request: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """
    Prévisualise les données avant export.
    Retourne les statistiques et un échantillon des données.
    """
    try:
        summary = await FieldOptExportService.get_export_summary(db, request.filters or {})
        columns = request.columns

        # Récupérer un échantillon (10 premiers)
        filters = request.filters or {}

        query = await FieldOptExportService.build_job_query(db, filters)
        query = query.limit(10)
        result = await db.execute(query)
        sample_jobs = result.scalars().all()

        sample_data = []
        for job in sample_jobs:
            row = await FieldOptExportService.build_job_dict(job, columns, db)
            sample_data.append(row)

        return {
            "success": True,
            "summary": summary,
            "sample": sample_data,
            "columns": columns,
            "filters": request.filters,
        }

    except Exception as exc:
        logger.exception("Erreur preview export : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur de prévisualisation.")


# ═══════════════════════════════════════════════════════════════
# MÉTADONNÉES
# ═══════════════════════════════════════════════════════════════


@router.get("/export/columns")
async def get_export_columns(
    current_user: User = Depends(get_current_user),
):
    """Retourne la liste des colonnes disponibles pour l'export, organisées par catégorie."""
    categories = FieldOptExportService.get_column_categories()
    columns = FieldOptExportService.get_available_columns()
    return {
        "success": True,
        "categories": categories,
        "columns": columns,
    }


@router.get("/export/profiles")
async def get_export_profiles(
    current_user: User = Depends(get_current_user),
):
    """Retourne les profils d'export prédéfinis (Orange, IAM, Inwi, etc.)."""
    profiles = FieldOptExportService.get_available_profiles()
    return {
        "success": True,
        "profiles": profiles,
    }


# ═══════════════════════════════════════════════════════════════
# GESTION DES MODÈLES
# ═══════════════════════════════════════════════════════════════


@router.get("/export/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Liste tous les modèles d'export disponibles."""
    try:
        templates = await FieldOptExportService.get_templates(db, current_user.id)
        return {
            "success": True,
            "templates": templates,
        }
    except Exception as exc:
        logger.exception("Erreur liste modèles : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération des modèles.")


@router.post("/export/templates")
async def create_template(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Crée un nouveau modèle d'export personnalisé."""
    try:
        template = await FieldOptExportService.create_template(
            db=db,
            name=data.name,
            description=data.description,
            export_type=data.export_type,
            columns=data.columns,
            filters=data.filters,
            include_photos=data.include_photos,
            include_signatures=data.include_signatures,
            is_default=data.is_default,
            created_by=current_user.id,
        )
        return {
            "success": True,
            "template": template,
            "message": f"Modèle '{data.name}' créé avec succès.",
        }
    except Exception as exc:
        logger.exception("Erreur création modèle : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la création du modèle.")


@router.put("/export/templates/{template_id}")
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Met à jour un modèle d'export existant."""
    try:
        await _ensure_template_mutation_access(db, template_id, current_user)
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        template = await FieldOptExportService.update_template(
            db=db,
            template_id=template_id,
            data=update_data,
        )
        return {
            "success": True,
            "template": template,
            "message": "Modèle mis à jour avec succès.",
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as exc:
        logger.exception("Erreur mise à jour modèle : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour du modèle.")


@router.delete("/export/templates/{template_id}")
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Supprime un modèle d'export."""
    try:
        await _ensure_template_mutation_access(db, template_id, current_user)
        await FieldOptExportService.delete_template(db=db, template_id=template_id)
        return {
            "success": True,
            "message": "Modèle supprimé avec succès.",
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as exc:
        logger.exception("Erreur suppression modèle : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression du modèle.")


# ═══════════════════════════════════════════════════════════════
# HISTORIQUE
# ═══════════════════════════════════════════════════════════════


@router.get("/export/history")
async def get_export_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_chef_orienteur),
):
    """Récupère l'historique des exports générés."""
    try:
        records = await FieldOptExportService.get_export_history(
            db=db,
            limit=limit,
            offset=offset,
            user_id=None if current_user.role == "ADMIN" else current_user.id,
        )
        return {
            "success": True,
            "records": records,
            "count": len(records),
        }
    except Exception as exc:
        logger.exception("Erreur historique exports : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération de l'historique.")


@router.get("/export/formats")
async def get_export_formats(
    current_user: User = Depends(get_current_user),
):
    """Retourne les formats d'export disponibles."""
    return {
        "success": True,
        "formats": [
            {
                "key": "excel",
                "label": "Excel (.xlsx)",
                "icon": "📊",
                "description": "Fichier Excel professionnel avec mise en forme",
            },
            {
                "key": "csv",
                "label": "CSV (.csv)",
                "icon": "📄",
                "description": "Fichier CSV compatible Excel et outils BI",
            },
            {
                "key": "pdf",
                "label": "PDF (.pdf)",
                "icon": "📕",
                "description": "Rapport PDF professionnel avec résumé",
            },
            {
                "key": "zip",
                "label": "ZIP (Excel + Photos)",
                "icon": "📦",
                "description": "Archive contenant l'Excel et les photos",
            },
        ],
    }