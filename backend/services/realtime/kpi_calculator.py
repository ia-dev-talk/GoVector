"""
KPI Calculator for FieldOpt
Calculates real-time KPIs from database state
"""
import math
from datetime import datetime, date, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Job, JobStatus, JobPriority, JobType,
    Technician, TechnicianStatus,
    Assignment,
)


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two GPS coordinates."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class KPICalculator:
    """
    Calculates all KPI metrics for the supervisory dashboard.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_dashboard_summary(self, target_date: Optional[date] = None) -> Dict:
        """Get a complete dashboard summary with all KPIs."""
        target = target_date or date.today()

        import asyncio
        results = await asyncio.gather(
            self._job_counts(target),
            self._technician_status_counts(),
            self._average_duration(target),
            self._average_delay(target),
            self._success_rate(target),
            self._jobs_by_operator(target),
            self._jobs_by_type(target),
            self._technician_performance(target),
            self._priority_breakdown(target),
            self._hourly_distribution(target),
        )

        return {
            "date": target.isoformat(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "jobs": results[0],
            "technicians": results[1],
            "avg_duration_minutes": results[2],
            "avg_delay_minutes": results[3],
            "success_rate": results[4],
            "by_operator": results[5],
            "by_type": results[6],
            "tech_performance": results[7],
            "priority_breakdown": results[8],
            "hourly_distribution": results[9],
        }

    async def get_orienteur_summary(self, orienteur_id: int, target_date: Optional[date] = None) -> Dict:
        """Get a dashboard summary filtered for a specific orienteur."""
        target = target_date or date.today()

        import asyncio
        results = await asyncio.gather(
            self._job_counts_by_orienteur(orienteur_id, target),
            self._technician_status_counts_by_orienteur(orienteur_id),
            self._average_duration(target),
            self._success_rate(target, orienteur_id=orienteur_id),
        )

        return {
            "date": target.isoformat(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "jobs": results[0],
            "technicians": results[1],
            "avg_duration_minutes": results[2],
            "success_rate": results[3],
            "scope": "orienteur",
            "orienteur_id": orienteur_id,
        }

    async def _job_counts_by_orienteur(self, orienteur_id: int, target_date: date) -> Dict:
        """Count jobs by status for a specific orienteur's team."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        async def _count(status: Optional[JobStatus] = None) -> int:
            q = select(func.count(Job.id)).where(
                Job.orienteur_id == orienteur_id,
                Job.scheduled_date >= start,
                Job.scheduled_date <= end,
            )
            if status:
                q = q.where(Job.status == status)
            result = await self.db.execute(q)
            return result.scalar_one()

        total = await _count()
        completed = await _count(JobStatus.COMPLETED)
        cancelled = await _count(JobStatus.CANCELLED)
        return {
            "total": total,
            "pending": await _count(JobStatus.PENDING),
            "assigned": await _count(JobStatus.ASSIGNED),
            "en_route": await _count(JobStatus.EN_ROUTE),
            "in_progress": await _count(JobStatus.IN_PROGRESS),
            "completed": completed,
            "cancelled": cancelled,
            "failed": await _count(JobStatus.FAILED),
            "client_absent": await _count(JobStatus.CLIENT_ABSENT),
            "remaining": total - completed - cancelled,
        }

    async def _technician_status_counts_by_orienteur(self, orienteur_id: int) -> Dict:
        """Count technicians by status for a specific orienteur."""
        async def _count(status: TechnicianStatus) -> int:
            q = select(func.count(Technician.id)).where(
                Technician.orienteur_id == orienteur_id,
                Technician.status == status,
                Technician.is_active == True,
            )
            result = await self.db.execute(q)
            return result.scalar_one()

        q_all = select(func.count(Technician.id)).where(
            Technician.orienteur_id == orienteur_id,
            Technician.is_active == True,
        )
        result = await self.db.execute(q_all)
        total_active = result.scalar_one()

        return {
            "total": total_active,
            "available": await _count(TechnicianStatus.AVAILABLE),
            "on_job": await _count(TechnicianStatus.ON_JOB),
            "en_route": await _count(TechnicianStatus.EN_ROUTE),
            "on_break": await _count(TechnicianStatus.ON_BREAK),
            "off_duty": await _count(TechnicianStatus.OFF_DUTY),
        }

    async def _job_counts(self, target_date: date) -> Dict:
        """Count jobs by status for the target date — 8 statuts officiels."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        async def _count(status: Optional[JobStatus] = None) -> int:
            q = select(func.count(Job.id)).where(
                Job.scheduled_date >= start,
                Job.scheduled_date <= end,
            )
            if status:
                q = q.where(Job.status == status)
            result = await self.db.execute(q)
            return result.scalar_one()

        total = await _count()
        completed = await _count(JobStatus.COMPLETED)
        cancelled = await _count(JobStatus.CANCELLED)
        return {
            "total": total,
            "pending": await _count(JobStatus.PENDING),
            "assigned": await _count(JobStatus.ASSIGNED),
            "en_route": await _count(JobStatus.EN_ROUTE),
            "in_progress": await _count(JobStatus.IN_PROGRESS),
            "completed": completed,
            "cancelled": cancelled,
            "failed": await _count(JobStatus.FAILED),
            "client_absent": await _count(JobStatus.CLIENT_ABSENT),
            "remaining": total - completed - cancelled,
        }

    async def _technician_status_counts(self) -> Dict:
        """Count technicians by status."""
        async def _count(status: TechnicianStatus) -> int:
            q = select(func.count(Technician.id)).where(
                Technician.status == status,
                Technician.is_active == True,
            )
            result = await self.db.execute(q)
            return result.scalar_one()

        q_all = select(func.count(Technician.id)).where(Technician.is_active == True)
        result = await self.db.execute(q_all)
        total_active = result.scalar_one()

        return {
            "total": total_active,
            "available": await _count(TechnicianStatus.AVAILABLE),
            "on_job": await _count(TechnicianStatus.ON_JOB),
            "en_route": await _count(TechnicianStatus.EN_ROUTE),
            "on_break": await _count(TechnicianStatus.ON_BREAK),
            "off_duty": await _count(TechnicianStatus.OFF_DUTY),
        }

    async def _average_duration(self, target_date: date) -> Optional[float]:
        """Calculate average intervention duration in minutes for completed jobs."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(func.avg(Assignment.actual_duration_minutes)).join(
            Job, Assignment.job_id == Job.id
        ).where(
            Job.status == JobStatus.COMPLETED,
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
            Assignment.actual_duration_minutes.isnot(None),
        )
        result = await self.db.execute(q)
        avg = result.scalar_one()
        return round(float(avg), 1) if avg else None

    async def _average_delay(self, target_date: date) -> Optional[float]:
        """Calculate average delay (actual vs estimated) in minutes."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(func.avg(
            func.extract('epoch', Assignment.actual_arrival - Assignment.estimated_arrival) / 60
        )).join(
            Job, Assignment.job_id == Job.id
        ).where(
            Job.status == JobStatus.COMPLETED,
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
            Assignment.actual_arrival.isnot(None),
            Assignment.estimated_arrival.isnot(None),
        )
        result = await self.db.execute(q)
        avg = result.scalar_one()
        return round(float(avg), 1) if avg is not None else None

    async def _success_rate(
        self,
        target_date: date,
        *,
        orienteur_id: int | None = None,
    ) -> Optional[float]:
        """Calculate first-time success rate."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q_total = select(func.count(Job.id)).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
            Job.status.in_([JobStatus.COMPLETED, JobStatus.CANCELLED]),
        )
        if orienteur_id is not None:
            q_total = q_total.where(Job.orienteur_id == orienteur_id)
        total = (await self.db.execute(q_total)).scalar_one()

        q_completed = select(func.count(Job.id)).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
            Job.status == JobStatus.COMPLETED,
        )
        if orienteur_id is not None:
            q_completed = q_completed.where(Job.orienteur_id == orienteur_id)
        completed = (await self.db.execute(q_completed)).scalar_one() or 0

        return round((completed / total) * 100, 1) if total > 0 else None

    async def _jobs_by_operator(self, target_date: date) -> List[Dict]:
        """Breakdown of jobs by operator."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(
            Job.operator,
            func.count(Job.id).label('count'),
        ).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
            Job.operator.isnot(None),
        ).group_by(Job.operator)

        result = await self.db.execute(q)
        rows = result.all()
        return [{"operator": row.operator, "count": row.count} for row in rows]

    async def _jobs_by_type(self, target_date: date) -> List[Dict]:
        """Breakdown of jobs by type."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(
            Job.job_type,
            func.count(Job.id).label('count'),
        ).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
        ).group_by(Job.job_type)

        result = await self.db.execute(q)
        rows = result.all()
        return [{"type": str(row.job_type), "count": row.count} for row in rows]

    async def _technician_performance(
        self,
        target_date: date,
        *,
        orienteur_id: int | None = None,
    ) -> List[Dict]:
        """Performance metrics per technician."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(
            Technician.id,
            Technician.name,
            func.count(Job.id).label('total_jobs'),
            func.sum(Assignment.actual_duration_minutes).label('total_duration'),
            func.avg(Assignment.actual_duration_minutes).label('avg_duration'),
            func.sum(
                case(
                    (Job.status == JobStatus.COMPLETED, 1),
                    else_=0
                )
            ).label('completed_jobs'),
        ).join(
            Assignment, Assignment.technician_id == Technician.id,
        ).join(
            Job, Assignment.job_id == Job.id,
        ).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
        )
        if orienteur_id is not None:
            q = q.where(Job.orienteur_id == orienteur_id)
        q = q.group_by(Technician.id, Technician.name)

        result = await self.db.execute(q)
        rows = result.all()
        return [
            {
                "id": row.id,
                "name": row.name,
                "total_jobs": row.total_jobs,
                "completed_jobs": row.completed_jobs or 0,
                "total_duration_minutes": round(float(row.total_duration or 0), 1),
                "avg_duration_minutes": round(float(row.avg_duration or 0), 1),
                "productivity": round(
                    (row.completed_jobs / row.total_jobs * 100) if row.total_jobs > 0 else 0, 1
                ),
            }
            for row in rows
        ]

    async def _priority_breakdown(self, target_date: date) -> List[Dict]:
        """Jobs breakdown by priority."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(
            Job.priority,
            func.count(Job.id).label('count'),
        ).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
        ).group_by(Job.priority)

        result = await self.db.execute(q)
        rows = result.all()
        return [{"priority": str(row.priority), "count": row.count} for row in rows]

    async def _hourly_distribution(self, target_date: date) -> List[Dict]:
        """Distribution of job starts by hour of day."""
        start = datetime.combine(target_date, datetime.min.time())
        end = datetime.combine(target_date, datetime.max.time())

        q = select(
            func.extract('hour', Job.started_at).label('hour'),
            func.count(Job.id).label('count'),
        ).where(
            Job.scheduled_date >= start,
            Job.scheduled_date <= end,
            Job.started_at.isnot(None),
        ).group_by(
            func.extract('hour', Job.started_at)
        ).order_by('hour')

        result = await self.db.execute(q)
        rows = result.all()
        return [
            {"hour": int(row.hour), "count": row.count}
            for row in rows if row.hour is not None
        ]
