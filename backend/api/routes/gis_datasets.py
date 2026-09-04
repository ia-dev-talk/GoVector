"""Admin-owned GIS drafts and controlled file exchange; no external synchronization."""

from functools import partial

from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, UploadFile
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from starlette.concurrency import run_in_threadpool

from backend.auth.dependencies import require_admin
from backend.database.connection import get_db
from backend.database.gis_models import GeoDataset, GeoLayer, GeoFeature
from backend.services.gis import datasets
from backend.services.gis.kml_parser import GisImportError, MAX_UPLOAD_BYTES, parse_geospatial_upload

router = APIRouter(prefix="/gis-datasets", tags=["GIS"], dependencies=[Depends(require_admin)])


async def parse_upload(file):
    try:
        payload = await file.read(MAX_UPLOAD_BYTES + 1)
        return await run_in_threadpool(partial(parse_geospatial_upload,
            file.filename or "", payload, content_type=file.content_type))
    except GisImportError as error:
        raise HTTPException(422, str(error)) from error
    finally:
        await file.close()


@router.post("/preview")
async def preview(file: UploadFile = File(...)):
    return datasets.preview(await parse_upload(file))


@router.post("")
async def create(
    file: UploadFile = File(...), name: str = Form(..., min_length=1, max_length=180),
    client_organization_id: int = Form(..., gt=0),
    expected_sha256: str = Form(..., pattern="^[a-f0-9]{64}$"),
    db=Depends(get_db), user=Depends(require_admin),
):
    if not name.strip():
        raise HTTPException(422, "Le nom est obligatoire.")
    return await datasets.import_dataset(db, parsed=await parse_upload(file),
        client_id=client_organization_id, name=name.strip(), expected_sha256=expected_sha256, user=user)


@router.get("")
async def list_datasets(client_organization_id: int | None = Query(None, gt=0),
                        after_id: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db=Depends(get_db)):
    statement = select(GeoDataset).where(GeoDataset.id > after_id).order_by(GeoDataset.id).limit(limit + 1)
    if client_organization_id is not None:
        statement = statement.where(GeoDataset.client_organization_id == client_organization_id)
    rows = (await db.execute(statement)).scalars().all()
    return {"items": [datasets.dataset_payload(row) for row in rows[:limit]],
            "next_after_id": rows[limit - 1].id if len(rows) > limit else None}


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(..., ge=1)


@router.post("/{dataset_id}/publish")
async def publish(payload: PublishRequest, dataset_id: int = Path(..., gt=0), db=Depends(get_db), user=Depends(require_admin)):
    return await datasets.publish_dataset(db, dataset_id=dataset_id, expected_revision=payload.expected_revision, user=user)


@router.get("/{dataset_id}/layers")
async def layers(dataset_id: int = Path(..., gt=0), db=Depends(get_db)):
    if await db.get(GeoDataset, dataset_id) is None:
        raise HTTPException(404, "Jeu de données introuvable")
    counts = (select(GeoFeature.layer_id, func.count(GeoFeature.id).label('feature_count'))
              .group_by(GeoFeature.layer_id).subquery())
    rows = (await db.execute(select(GeoLayer, func.coalesce(counts.c.feature_count, 0))
        .outerjoin(counts, counts.c.layer_id == GeoLayer.id)
        .where(GeoLayer.dataset_id == dataset_id).order_by(GeoLayer.id))).all()
    return [{"id": layer.id, "name": layer.name, "geometry_type": layer.feature_type,
             "folder_path": layer.folder_path, "feature_count": count} for layer, count in rows]


@router.get("/{dataset_id}/geojson")
async def geojson(dataset_id: int = Path(..., gt=0), layer_id: int | None = Query(None, gt=0), db=Depends(get_db)):
    result = await datasets.export_geojson(db, dataset_id=dataset_id, layer_id=layer_id)
    return JSONResponse(jsonable_encoder(result), media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="bluevector-{dataset_id}.geojson"'})


@router.get("/{dataset_id}/preview")
async def saved_preview(dataset_id: int = Path(..., gt=0), db=Depends(get_db)):
    return {**await datasets.stored_preview(db, dataset_id=dataset_id),
            "layers": await layers(dataset_id, db)}
