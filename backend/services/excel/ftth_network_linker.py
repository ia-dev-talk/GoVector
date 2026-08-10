"""
FTTH Network Linker Service for FieldOpt
Links imported Excel jobs to FTTH network models (NRO/SRO/PBO/PTO/Splitter/Port)
"""
import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database.models import NRO, SRO, PBO, PTO, Splitter, Port

logger = logging.getLogger(__name__)


class FTTHNetworkLinker:
    """
    Links job records to FTTH network elements.
    Handles creation and lookup of network infrastructure.
    """

    async def link_job_to_network(
        self,
        db: AsyncSession,
        job_id: int,
        network_data: Dict[str, Any],
    ) -> bool:
        """
        Link a job to FTTH network elements.

        Args:
            db: Database session
            job_id: Job ID to link
            network_data: Dict containing:
                - nro_code, sro_code, pbo_code, pto_code
                - splitter_code, splitter_port
                - operator
        Returns:
            Success status
        """
        try:
            job = await db.get(None, job_id)  # Placeholder for Job fetch

            # Find or create PTO
            pto = await self._find_or_create_pto(db, network_data)
            if not pto:
                logger.warning(f"Could not find/create PTO for job {job_id}")
                return False

            # Find or create Splitter port if specified
            port = None
            if network_data.get("splitter_code") or network_data.get("splitter_port"):
                port = await self._find_or_create_port(db, network_data, pto.id)

            # TODO: Update job with network IDs
            # job.pto_id = pto.id
            # if port:
            #     job.port_id = port.id

            await db.commit()
            return True

        except Exception as e:
            logger.exception(f"Error linking job {job_id} to network: {e}")
            await db.rollback()
            return False

    async def _find_or_create_pto(
        self,
        db: AsyncSession,
        network_data: Dict[str, Any],
    ) -> Optional[PTO]:
        """Find or create PTO by code."""
        pto_code = network_data.get("pto_code")
        if not pto_code:
            return None

        # Try to find existing PTO
        result = await db.execute(
            select(PTO).where(PTO.code == pto_code)
        )
        pto = result.scalar_one_or_none()

        if not pto:
            # Create new PTO
            pto = PTO(
                code=pto_code,
                pbo_id=network_data.get("pbo_id", 0),
                address=network_data.get("address"),
            )
            db.add(pto)
            await db.flush()

        return pto

    async def _find_or_create_port(
        self,
        db: AsyncSession,
        network_data: Dict[str, Any],
        pto_id: int,
    ) -> Optional[Port]:
        """Find or create a port on a splitter."""
        splitter_code = network_data.get("splitter_code")
        port_number = network_data.get("splitter_port")

        if not splitter_code or not port_number:
            return None

        # Find or create splitter
        result = await db.execute(
            select(Splitter).where(Splitter.code == splitter_code)
        )
        splitter = result.scalar_one_or_none()

        if not splitter:
            splitter = Splitter(
                code=splitter_code,
                ratio=network_data.get("splitter_ratio", "1:8"),
            )
            db.add(splitter)
            await db.flush()

        # Find or create port
        result = await db.execute(
            select(Port).where(
                Port.splitter_id == splitter.id,
                Port.port_number == port_number,
            )
        )
        port = result.scalar_one_or_none()

        if not port:
            port = Port(
                splitter_id=splitter.id,
                port_number=port_number,
                is_occupied=False,
            )
            db.add(port)
            await db.flush()

        return port

    async def get_network_tree(self, db: AsyncSession) -> Dict[str, Any]:
        """Get full network hierarchy for display."""
        result = {
            "nros": [],
            "sros": [],
            "pbos": [],
            "ptos": [],
            "splitters": [],
            "ports": [],
        }

        # Fetch all network elements
        nros = await db.execute(select(NRO))
        result["nros"] = [
            {"id": n.id, "code": n.code, "name": n.name}
            for n in nros.scalars().all()
        ]

        sros = await db.execute(select(SRO))
        result["sros"] = [
            {"id": s.id, "code": s.code, "nro_id": s.nro_id}
            for s in sros.scalars().all()
        ]

        pbos = await db.execute(select(PBO))
        result["pbos"] = [
            {"id": p.id, "code": p.code, "sro_id": p.sro_id}
            for p in pbos.scalars().all()
        ]

        ptos = await db.execute(select(PTO))
        result["ptos"] = [
            {"id": p.id, "code": p.code, "pbo_id": p.pbo_id}
            for p in ptos.scalars().all()
        ]

        return result