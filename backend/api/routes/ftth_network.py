"""
FTTH Network Management API Routes
Endpoints for managing NRO, SRO, PBO, PTO, Splitter, and Port infrastructure
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database.connection import get_db
from backend.database.models import NRO, SRO, PBO, PTO, Splitter, Port
from backend.auth.dependencies import require_internal_user

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["FTTH Network"],
    dependencies=[Depends(require_internal_user)],
)


# =====================================================
# NRO (Nœud de Raccordement Optique)
# =====================================================

@router.get("/ftth/nros")
async def get_nros(db: AsyncSession = Depends(get_db)):
    """Get all NROs (Central Offices)"""
    result = await db.execute(select(NRO))
    nros = result.scalars().all()
    return [
        {
            "id": n.id,
            "code": n.code,
            "name": n.name,
            "latitude": n.latitude,
            "longitude": n.longitude,
            "address": n.address,
        }
        for n in nros
    ]


@router.get("/ftth/nros/{nro_id}")
async def get_nro(nro_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific NRO with its SROs"""
    nro = await db.get(NRO, nro_id)
    if not nro:
        return {"error": "NRO not found"}

    return {
        "id": nro.id,
        "code": nro.code,
        "name": nro.name,
        "latitude": nro.latitude,
        "longitude": nro.longitude,
        "address": nro.address,
        "sros": [
            {
                "id": s.id,
                "code": s.code,
                "latitude": s.latitude,
                "longitude": s.longitude,
            }
            for s in nro.sros
        ],
    }


# =====================================================
# SRO (Sous-Répartiteur Optique)
# =====================================================

@router.get("/ftth/sros")
async def get_sros(nro_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    """Get all SROs, optionally filtered by NRO"""
    query = select(SRO)
    if nro_id:
        query = query.where(SRO.nro_id == nro_id)

    result = await db.execute(query)
    sros = result.scalars().all()

    return [
        {
            "id": s.id,
            "code": s.code,
            "nro_id": s.nro_id,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "address": s.address,
        }
        for s in sros
    ]


# =====================================================
# PBO (Point de Branchement Optique)
# =====================================================

@router.get("/ftth/pbos")
async def get_pbos(sro_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    """Get all PBOs, optionally filtered by SRO"""
    query = select(PBO)
    if sro_id:
        query = query.where(PBO.sro_id == sro_id)

    result = await db.execute(query)
    pbos = result.scalars().all()

    return [
        {
            "id": p.id,
            "code": p.code,
            "sro_id": p.sro_id,
            "latitude": p.latitude,
            "longitude": p.longitude,
        }
        for p in pbos
    ]


# =====================================================
# PTO (Point de Terminaison Optique)
# =====================================================

@router.get("/ftth/ptos")
async def get_ptos(pbo_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    """Get all PTOs, optionally filtered by PBO"""
    query = select(PTO)
    if pbo_id:
        query = query.where(PTO.pbo_id == pbo_id)

    result = await db.execute(query)
    ptos = result.scalars().all()

    return [
        {
            "id": p.id,
            "code": p.code,
            "pbo_id": p.pbo_id,
            "address": p.address,
        }
        for p in ptos
    ]


@router.get("/ftth/ptos/{pto_id}")
async def get_pto(pto_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific PTO with details"""
    pto = await db.get(PTO, pto_id)
    if not pto:
        return {"error": "PTO not found"}

    return {
        "id": pto.id,
        "code": pto.code,
        "pbo_id": pto.pbo_id,
        "address": pto.address,
        "pbo": {
            "id": pto.pbo.id,
            "code": pto.pbo.code,
            "sro": {
                "id": pto.pbo.sro.id,
                "code": pto.pbo.sro.code,
                "nro": {
                    "id": pto.pbo.sro.nro.id,
                    "code": pto.pbo.sro.nro.code,
                    "name": pto.pbo.sro.nro.name,
                },
            },
        },
    }


# =====================================================
# Splitter
# =====================================================

@router.get("/ftth/splitters")
async def get_splitters(pbo_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    """Get all splitters, optionally filtered by PBO"""
    query = select(Splitter)
    if pbo_id:
        query = query.where(Splitter.pbo_id == pbo_id)

    result = await db.execute(query)
    splitters = result.scalars().all()

    return [
        {
            "id": s.id,
            "code": s.code,
            "pbo_id": s.pbo_id,
            "ratio": s.ratio,
        }
        for s in splitters
    ]


# =====================================================
# Port
# =====================================================

@router.get("/ftth/ports")
async def get_ports(splitter_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    """Get all ports, optionally filtered by splitter"""
    query = select(Port)
    if splitter_id:
        query = query.where(Port.splitter_id == splitter_id)

    result = await db.execute(query)
    ports = result.scalars().all()

    return [
        {
            "id": p.id,
            "splitter_id": p.splitter_id,
            "port_number": p.port_number,
            "is_occupied": p.is_occupied,
            "job_id": p.job_id,
        }
        for p in ports
    ]


@router.get("/ftth/ports/{port_id}")
async def get_port(port_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific port with details"""
    port = await db.get(Port, port_id)
    if not port:
        return {"error": "Port not found"}

    return {
        "id": port.id,
        "splitter_id": port.splitter_id,
        "port_number": port.port_number,
        "is_occupied": port.is_occupied,
        "job_id": port.job_id,
        "splitter": {
            "id": port.splitter.id,
            "code": port.splitter.code,
            "ratio": port.splitter.ratio,
        } if port.splitter else None,
    }


# =====================================================
# Network Tree
# =====================================================

@router.get("/ftth/tree")
async def get_network_tree(db: AsyncSession = Depends(get_db)):
    """Get full network hierarchy"""
    from backend.services.excel.ftth_network_linker import FTTHNetworkLinker
    linker = FTTHNetworkLinker()
    return await linker.get_network_tree(db)


# =====================================================
# Search
# =====================================================

@router.get("/ftth/search")
async def search_ftth(q: str = Query(..., description="Search query"), db: AsyncSession = Depends(get_db)):
    """
    Search across FTTH network elements.
    Searches NRO, SRO, PBO, PTO, Splitter codes and addresses.
    """
    results = {
        "nros": [],
        "sros": [],
        "pbos": [],
        "ptos": [],
        "splitters": [],
    }

    # Search NROs
    nro_result = await db.execute(
        select(NRO).where(NRO.code.ilike(f"%{q}%") | NRO.name.ilike(f"%{q}%"))
    )
    results["nros"] = [
        {"id": n.id, "code": n.code, "name": n.name, "type": "NRO"}
        for n in nro_result.scalars().all()
    ]

    # Search SROs
    sro_result = await db.execute(
        select(SRO).where(SRO.code.ilike(f"%{q}%"))
    )
    results["sros"] = [
        {"id": s.id, "code": s.code, "type": "SRO"}
        for s in sro_result.scalars().all()
    ]

    # Search PBOs
    pbo_result = await db.execute(
        select(PBO).where(PBO.code.ilike(f"%{q}%"))
    )
    results["pbos"] = [
        {"id": p.id, "code": p.code, "type": "PBO"}
        for p in pbo_result.scalars().all()
    ]

    # Search PTOs
    pto_result = await db.execute(
        select(PTO).where(PTO.code.ilike(f"%{q}%"))
    )
    results["ptos"] = [
        {"id": p.id, "code": p.code, "type": "PTO"}
        for p in pto_result.scalars().all()
    ]

    # Search Splitters
    splitter_result = await db.execute(
        select(Splitter).where(Splitter.code.ilike(f"%{q}%"))
    )
    results["splitters"] = [
        {"id": s.id, "code": s.code, "type": "Splitter"}
        for s in splitter_result.scalars().all()
    ]

    return results
