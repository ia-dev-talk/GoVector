"""
ImportHistoryService — logs and retrieves import history records.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import ImportHistory

logger = logging.getLogger(__name__)


class ImportHistoryService:
    """Service for managing import history records."""

    @staticmethod
    async def log_import(
        db: AsyncSession,
        filename: str,
        operator: Optional[str] = None,
        file_count: int = 1,
        jobs_created: int = 0,
        jobs_updated: int = 0,
        jobs_ignored: int = 0,
        errors_count: int = 0,
        duration_seconds: Optional[float] = None,
        logs: Optional[dict] = None,
        imported_by: Optional[str] = None,
    ) -> ImportHistory:
        """Log a completed import operation."""
        record = ImportHistory(
            filename=filename,
            operator=operator,
            file_count=file_count,
            jobs_created=jobs_created,
            jobs_updated=jobs_updated,
            jobs_ignored=jobs_ignored,
            errors_count=errors_count,
            duration_seconds=duration_seconds,
            logs=logs or {},
            imported_by=imported_by,
            created_at=datetime.now(timezone.utc),
        )
        db.add(record)
        await db.flush()
        await db.refresh(record)
        return record

    @staticmethod
    async def get_history(
        db: AsyncSession,
        limit: int = 50,
        offset: int = 0,
        operator: Optional[str] = None,
    ) -> List[ImportHistory]:
        """Get import history records, most recent first."""
        query = select(ImportHistory).order_by(
            desc(ImportHistory.created_at)
        )

        if operator:
            query = query.where(ImportHistory.operator == operator)

        query = query.offset(offset).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_history_stats(
        db: AsyncSession,
    ) -> dict:
        """Get aggregate statistics about all imports."""
        result = await db.execute(
            select(
                func.count(ImportHistory.id).label("total_imports"),
                func.sum(ImportHistory.jobs_created).label("total_created"),
                func.sum(ImportHistory.jobs_updated).label("total_updated"),
                func.sum(ImportHistory.errors_count).label("total_errors"),
                func.avg(ImportHistory.duration_seconds).label("avg_duration"),
            )
        )
        row = result.one()

        # Get operator breakdown
        result = await db.execute(
            select(
                ImportHistory.operator,
                func.count(ImportHistory.id).label("count"),
                func.sum(ImportHistory.jobs_created).label("jobs_created"),
            ).group_by(ImportHistory.operator)
        )
        by_operator = {}
        for row_op in result.all():
            by_operator[row_op.operator or "UNKNOWN"] = {
                "count": row_op.count,
                "jobs_created": row_op.jobs_created or 0,
            }

        return {
            "total_imports": row.total_imports or 0,
            "total_created": row.total_created or 0,
            "total_updated": row.total_updated or 0,
            "total_errors": row.total_errors or 0,
            "avg_duration_seconds": round(float(row.avg_duration), 2) if row.avg_duration else 0,
            "by_operator": by_operator,
        }

    @staticmethod
    def record_to_dict(record: ImportHistory) -> dict:
        """Convert an ImportHistory record to a serializable dict."""
        return {
            "id": record.id,
            "filename": record.filename,
            "operator": record.operator,
            "file_count": record.file_count,
            "jobs_created": record.jobs_created,
            "jobs_updated": record.jobs_updated,
            "jobs_ignored": record.jobs_ignored,
            "errors_count": record.errors_count,
            "duration_seconds": record.duration_seconds,
            "logs": record.logs or {},
            "imported_by": record.imported_by,
            "created_at": record.created_at.isoformat() if record.created_at else None,
        }