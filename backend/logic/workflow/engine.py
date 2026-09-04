"""
Workflow Engine — Moteur métier central des interventions FTTH

Ce moteur orchestre toutes les automatisations métier :
- Cycle de vie des interventions (Installation, Dépannage, Migration, Raccordement, Audit)
- Création automatique d'activités dans la timeline
- Broadcast WebSocket temps réel
- Validation métier par type
- Gestion des équipements / stock via StockService
- Calcul des KPI et durées
- Notifications
- Mise à jour du statut technicien
- Enregistrement GPS

Chaque méthode suit le pattern :
1. Valider l'état actuel
2. Appliquer la transition
3. Logger l'activité
4. Broadcaster l'événement
5. Mettre à jour les KPI
6. Gérer les dépendances (stock, technicien, GPS)
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    Job, JobStatus, JobType, Technician,
    Assignment, JobActivityLog, TechnicianLiveStatus,
)
from backend.logic.activity_log import log_job_activity
from backend.logic.completion_policy import CompletionPolicy
from backend.logic.job_visits import (
    get_current_assignment,
    sync_job_visit_transition,
)
from backend.services.realtime.dashboard_service import DashboardService
from backend.services.stock_service import StockService

logger = logging.getLogger("uvicorn.error")

# ============================================================
# CONSTANTES — Actions de la timeline par type
# ============================================================

INSTALLATION_STEPS = [
    "assigned", "accepted", "en_route", "arrived",
    "environment_check", "pto_check", "installation",
    "ont_config", "router_config", "tests",
    "client_validation", "photos", "completed"
]

DEPANNAGE_STEPS = [
    "assigned", "accepted", "en_route", "arrived",
    "diagnostic", "optical_measure", "pto_check",
    "pbo_check", "replacement", "tests", "validation", "completed"
]

MIGRATION_STEPS = [
    "assigned", "accepted", "en_route", "arrived",
    "old_disconnect", "old_ont_removal", "new_installation",
    "new_activation", "tests", "validation", "completed"
]

RACCORDEMENT_STEPS = [
    "assigned", "accepted", "en_route", "arrived",
    "cable_pull", "splicing", "pbo_connection",
    "pto_installation", "splitter_config", "tests", "completed"
]

AUDIT_STEPS = [
    "assigned", "accepted", "en_route", "arrived",
    "inspection", "photos_pbo", "photos_pto",
    "optical_measure", "report", "completed"
]

STEP_MAP = {
    JobType.INSTALLATION: INSTALLATION_STEPS,
    JobType.DEPANNAGE: DEPANNAGE_STEPS,
    JobType.MIGRATION: MIGRATION_STEPS,
    JobType.RACCORDEMENT: RACCORDEMENT_STEPS,
    JobType.AUDIT: AUDIT_STEPS,
}

# ============================================================
# REQUIRED PHOTOS PAR TYPE
# ============================================================

REQUIRED_PHOTOS = {
    JobType.INSTALLATION: ["before", "after", "pto", "ont", "router", "label"],
    JobType.DEPANNAGE: ["panne", "reparation", "resultat"],
    JobType.AUDIT: ["pbo", "pto", "cable", "anomalies", "general"],
    JobType.RACCORDEMENT: ["pbo", "pto", "cable", "splicing"],
    JobType.MIGRATION: ["ancien_ont", "nouvel_ont", "resultat"],
}


ACTIVITY_STATUS_LABELS = {
    JobStatus.PENDING: "Créée",
    JobStatus.ASSIGNED: "Affectée",
    JobStatus.ACCEPTED: "Acceptée",
    JobStatus.EN_ROUTE: "En route",
    JobStatus.ON_SITE: "Arrivé sur site",
    JobStatus.WORK_IN_PROGRESS: "Travail en cours",
    JobStatus.IN_PROGRESS: "Démarrée",
    JobStatus.INSTALLATION_DONE: "Installation terminée",
    JobStatus.CLIENT_VALIDATION: "Validation client",
    JobStatus.EN_ATTENTE_VALIDATION: "En attente de validation",
    JobStatus.COMPLETED: "Terminée",
    JobStatus.CANCELLED: "Annulée",
    JobStatus.FAILED: "En échec",
    JobStatus.CLIENT_ABSENT: "Client absent",
    JobStatus.POSTPONED: "Reportée",
    JobStatus.SUSPENDED: "Suspendue",
    JobStatus.ON_HOLD: "En attente",
}


def _activity_transition_source(metadata):
    extra = (metadata or {}).get("extra") or {}
    return extra.get("source")


def _activity_action_for_transition(new_status, metadata=None):
    source = _activity_transition_source(metadata)

    if (
        new_status == JobStatus.PENDING
        and source in {
            "unassignment",
            "reassignment",
            "batch_reassignment",
        }
    ):
        return "unassigned"

    if (
        new_status == JobStatus.ASSIGNED
        and source in {
            "reassignment",
            "batch_reassignment",
        }
    ):
        return "reassigned"

    return new_status.value


def _activity_label_for_transition(new_status, metadata=None):
    source = _activity_transition_source(metadata)

    if new_status == JobStatus.PENDING:
        if source == "unassignment":
            return "Désaffectée"

        if source in {
            "reassignment",
            "batch_reassignment",
        }:
            return "Désaffectée pour réaffectation"

    if (
        new_status == JobStatus.ASSIGNED
        and source in {
            "reassignment",
            "batch_reassignment",
        }
    ):
        return "Réaffectée"

    return ACTIVITY_STATUS_LABELS.get(
        new_status,
        new_status.value,
    )


class WorkflowEngine:
    """Moteur métier central — orchestre les interventions FTTH"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._dashboard = DashboardService(db)
        self._stock = StockService(db)
        self.last_visit_id: int | None = None

    # ============================================================
    # CŒUR DU WORKFLOW
    # ============================================================

    async def transition_job(
        self,
        job: Job,
        new_status: JobStatus,
        technician_id: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        broadcast: bool = True,
    ) -> Job:
        """
        Transition complète d'une intervention avec toutes les conséquences.
        Point d'entrée unique pour tout changement de statut métier.
        """
        old_status = job.status
        metadata = metadata or {}

        # 1. VALIDER la transition
        await self._validate_transition(job, new_status)

        # 2. APPLIQUER
        if new_status == JobStatus.ACCEPTED and not job.accepted_at:
            job.accepted_at = datetime.now(timezone.utc)
        if new_status == JobStatus.EN_ROUTE and not job.started_at:
            job.started_at = datetime.now(timezone.utc)
            job.started_by = technician_id
            job.start_latitude = metadata.get("latitude")
            job.start_longitude = metadata.get("longitude")
            job.gps_latitude = metadata.get("latitude")
            job.gps_longitude = metadata.get("longitude")
        if new_status == JobStatus.ON_SITE and not job.arrival_time:
            job.arrival_time = datetime.now(timezone.utc)
            job.end_latitude = metadata.get("latitude")
            job.end_longitude = metadata.get("longitude")
            current_assignment = getattr(job, "assignment", None)
            if (
                current_assignment is not None
                and current_assignment.actual_arrival is None
            ):
                current_assignment.actual_arrival = job.arrival_time
        if new_status == JobStatus.COMPLETED and not job.completed_at:
            job.completed_at = datetime.now(timezone.utc)
            self._calculate_duration(job)

        job.status = new_status
        job.updated_at = datetime.now(timezone.utc)

        visit = await sync_job_visit_transition(
            self.db,
            job=job,
            old_status=old_status,
            new_status=new_status,
            technician_id=technician_id,
            metadata=metadata,
        )
        self.last_visit_id = visit.id if visit is not None else None

        # 3. LOGUER l'activité
        await self._log(
            job,
            old_status,
            new_status,
            technician_id,
            metadata,
            visit_id=self.last_visit_id,
        )

        # 4. BROADCASTER
        if broadcast:
            await self._broadcast(job, old_status, new_status)

        # 5. GÉRER LES CONSÉQUENCES MÉTIER
        await self._handle_business_rules(
            job,
            new_status,
            metadata,
            technician_id=technician_id,
            visit_id=self.last_visit_id,
        )

        await self.db.flush()
        return job

    async def _validate_transition(self, job: Job, new_status: JobStatus):
        """Valide la transition selon le type et l'état."""
        valid = get_valid_transitions(job.status)
        if new_status not in valid:
            raise ValueError(
                f"Transition invalide: {job.status.value} → {new_status.value}"
                f" pour job #{job.id} (type={job.job_type.value})"
            )

    async def _log(
        self, job: Job, old_status: JobStatus,
        new_status: JobStatus, technician_id: Optional[int],
        metadata: Dict,
        visit_id: int | None = None,
    ):
        """Crée et persist une entrée de timeline."""
        await log_job_activity(
            db=self.db,
            job_id=job.id,
            visit_id=visit_id,
            action=_activity_action_for_transition(new_status, metadata),
            technician_id=technician_id,
            description=self._build_description(job, old_status, new_status, metadata),
            old_status=old_status.value if old_status else None,
            new_status=new_status.value if new_status else None,
            latitude=metadata.get("latitude"),
            longitude=metadata.get("longitude"),
            metadata={
                "job_type": job.job_type.value,
                "customer": job.customer_name,
                **metadata.get("extra", {}),
            },
        )

    def _build_description(
        self,
        job: Job,
        old_status: JobStatus,
        new_status: JobStatus,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Génère une description lisible et sémantique de la transition."""
        new_label = _activity_label_for_transition(
            new_status,
            metadata,
        )
        return (
            f"{new_label} "
            f"({job.job_type.value} — {job.customer_name})"
        )

    async def _broadcast(self, job: Job, old_status: JobStatus, new_status: JobStatus):
        """Diffuse les événements temps réel."""
        event_type = f"job_{new_status.value}"
        event_data = {
            "job_id": job.id,
            "job_number": job.job_number,
            "status": new_status.value,
            "old_status": old_status.value if old_status else None,
            "job_type": job.job_type.value,
            "customer_name": job.customer_name,
            "assigned_technician_name": job.assigned_technician_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._dashboard.broadcast_job_event(event_type, event_data)
        await self._dashboard.broadcast_dashboard_update()

    async def _handle_business_rules(
        self,
        job: Job,
        new_status: JobStatus,
        metadata: Dict,
        *,
        technician_id: int | None = None,
        visit_id: int | None,
    ):
        """Applique les règles métier après transition."""

        # 1. Mettre à jour le statut live du technicien
        await self._update_technician_status(
            job, new_status, metadata, technician_id=technician_id
        )

        # 2. Enregistrer la position GPS si fournie
        if (
            metadata.get("latitude") is not None
            and metadata.get("longitude") is not None
        ):
            await self._record_gps_position(
                job,
                metadata,
                technician_id=technician_id,
                visit_id=visit_id,
            )

        # 3. Si terminée → libérer le stock réservé
        if new_status == JobStatus.COMPLETED:
            await self._release_stock(job, visit_id=visit_id)

        # 4. Si équipement scanné → enregistrer consommation via StockService
        if metadata.get("equipment_serial") or metadata.get("consumption_items"):
            await self._register_consumption(
                job,
                metadata,
                technician_id=technician_id,
                visit_id=visit_id,
            )

    # ============================================================
    # TECHNICIEN — Mise à jour du statut live
    # ============================================================

    async def _update_technician_status(
        self,
        job: Job,
        new_status: JobStatus,
        metadata: Dict,
        *,
        technician_id: int | None = None,
    ):
        """Met à jour le live_status du technicien selon le statut du job."""
        from sqlalchemy import select
        from backend.database.models import Technician, TechnicianLiveStatus

        effective_technician_id = technician_id
        job_assignment = getattr(job, "assignment", None)
        if effective_technician_id is None and job_assignment is not None:
            effective_technician_id = job_assignment.technician_id
        if effective_technician_id is None:
            assignment = await get_current_assignment(self.db, job.id)
            effective_technician_id = (
                assignment.technician_id if assignment is not None else None
            )
        if effective_technician_id is None:
            return

        result = await self.db.execute(
            select(Technician).where(Technician.id == effective_technician_id)
        )
        tech = result.scalar_one_or_none()
        if not tech:
            return

        status_map = {
            JobStatus.EN_ROUTE: TechnicianLiveStatus.EN_INTERVENTION,
            JobStatus.ON_SITE: TechnicianLiveStatus.EN_INTERVENTION,
            JobStatus.IN_PROGRESS: TechnicianLiveStatus.EN_INTERVENTION,
            JobStatus.WORK_IN_PROGRESS: TechnicianLiveStatus.EN_INTERVENTION,
            JobStatus.INSTALLATION_DONE: TechnicianLiveStatus.EN_INTERVENTION,
            JobStatus.CLIENT_VALIDATION: TechnicianLiveStatus.EN_INTERVENTION,
            JobStatus.EN_ATTENTE_VALIDATION: TechnicianLiveStatus.DISPONIBLE,
            JobStatus.COMPLETED: TechnicianLiveStatus.DISPONIBLE,
            JobStatus.CANCELLED: TechnicianLiveStatus.DISPONIBLE,
            JobStatus.FAILED: TechnicianLiveStatus.DISPONIBLE,
            JobStatus.CLIENT_ABSENT: TechnicianLiveStatus.DISPONIBLE,
            JobStatus.POSTPONED: TechnicianLiveStatus.DISPONIBLE,
            JobStatus.PENDING: TechnicianLiveStatus.DISPONIBLE,
        }
        new_live = status_map.get(new_status)
        if new_live:
            if tech.live_status != new_live:
                tech.live_status = new_live
                logger.info(f"[WORKFLOW] Technicien #{tech.id} → {new_live.value}")
            release_statuses = {
                JobStatus.EN_ATTENTE_VALIDATION,
                JobStatus.COMPLETED,
                JobStatus.CANCELLED,
                JobStatus.FAILED,
                JobStatus.CLIENT_ABSENT,
                JobStatus.POSTPONED,
                JobStatus.PENDING,
            }
            tech.current_job_id = (
                None if new_status in release_statuses else job.id
            )
        if (
            metadata.get("latitude") is not None
            and metadata.get("longitude") is not None
        ):
            tech.current_latitude = metadata.get("latitude")
            tech.current_longitude = metadata.get("longitude")
            tech.current_accuracy = metadata.get("accuracy")
            tech.last_location_update = datetime.now(timezone.utc)

    # ============================================================
    # GPS — Enregistrement de position
    # ============================================================

    async def _record_gps_position(
        self,
        job: Job,
        metadata: Dict,
        *,
        technician_id: int | None = None,
        visit_id: int | None = None,
    ):
        """Enregistre une position GPS dans l'historique."""
        from backend.database.models import GPSHistory

        lat = metadata.get("latitude")
        lon = metadata.get("longitude")
        tech_id = technician_id
        job_assignment = getattr(job, "assignment", None)
        if tech_id is None and job_assignment is not None:
            tech_id = job_assignment.technician_id
        if tech_id is None:
            assignment = await get_current_assignment(self.db, job.id)
            tech_id = assignment.technician_id if assignment is not None else None

        if lat is not None and lon is not None and tech_id:
            gps = GPSHistory(
                technician_id=tech_id,
                job_id=job.id,
                visit_id=visit_id,
                latitude=lat,
                longitude=lon,
                speed=metadata.get("speed"),
                heading=metadata.get("heading"),
                accuracy=metadata.get("accuracy"),
                battery_level=metadata.get("battery_level"),
                recorded_at=datetime.now(timezone.utc),
            )
            self.db.add(gps)
            logger.info(f"[WORKFLOW] GPS enregistré pour tech #{tech_id} sur job #{job.id}")

    # ============================================================
    # STOCK — Gestion via StockService
    # ============================================================

    async def _release_stock(self, job: Job, *, visit_id: int | None):
        """Consomme le stock réservé via StockService quand un job est terminé."""
        from sqlalchemy import select
        from backend.database.models import StockMovement, StockMovementType

        result = await self.db.execute(
            select(StockMovement).where(
                StockMovement.job_id == job.id,
                StockMovement.movement_type == StockMovementType.SORTIE,
            )
        )
        movements = result.scalars().all()
        if not movements:
            return

        for mvt in movements:
            try:
                await self._stock.consume_reserved_stock(
                    item_id=mvt.item_id,
                    warehouse_id=mvt.warehouse_id,
                    quantity=abs(mvt.quantity),
                    job_id=job.id,
                    visit_id=visit_id,
                    technician_id=mvt.technician_id,
                    notes=f"Consommation auto job #{job.id}",
                    reference_type="workflow_completion",
                    reference_id=job.id,
                )
            except Exception as e:
                logger.warning(f"[WORKFLOW] Échec consommation stock job #{job.id}: {e}")

        logger.info(f"[WORKFLOW] Stock consommé pour job #{job.id} ({len(movements)} lignes)")

    async def _register_consumption(
        self,
        job: Job,
        metadata: Dict,
        *,
        technician_id: int | None,
        visit_id: int | None,
    ):
        """Enregistre la consommation d'équipement via StockService."""
        serial = metadata.get("equipment_serial")
        items = metadata.get("consumption_items")
        if not serial and not items:
            return

        tech_id = technician_id
        if tech_id is None:
            assignment = await get_current_assignment(self.db, job.id)
            tech_id = assignment.technician_id if assignment is not None else None
        consumption_items = []

        if serial:
            from sqlalchemy import select
            from backend.database.models import StockItem
            result = await self.db.execute(
                select(StockItem).where(StockItem.reference == serial)
            )
            item = result.scalar_one_or_none()
            if item:
                consumption_items.append({"item_id": item.id, "quantity": 1, "serial_number": serial})

        if items:
            consumption_items.extend(items)

        if consumption_items:
            try:
                consumption = await self._stock.create_consumption(
                    job_id=job.id,
                    visit_id=visit_id,
                    technician_id=tech_id,
                    notes=f"Consommation job #{job.id}",
                    items=consumption_items,
                )
                await self._stock.validate_consumption(consumption.id)
                logger.info(f"[WORKFLOW] Consommation #{consumption.consumption_number} créée pour job #{job.id}")
            except Exception as e:
                logger.warning(f"[WORKFLOW] Échec création consommation job #{job.id}: {e}")

    # ============================================================
    # DURÉE — Calcul automatique
    # ============================================================

    def _calculate_duration(self, job: Job):
        """Calcule real_duration_minutes à partir de started_at et completed_at."""
        if job.started_at and job.completed_at:
            delta = job.completed_at - job.started_at
            job.real_duration_minutes = max(1, int(delta.total_seconds() / 60))
            logger.info(f"[WORKFLOW] Durée calculée: {job.real_duration_minutes} min pour job #{job.id}")

    # ============================================================
    # VALIDATION MÉTIER — Vérifications avant complétion
    # ============================================================

    async def can_complete(self, job: Job) -> Dict[str, Any]:
        """
        Vérifie si une intervention peut être terminée.
        Retourne un dict avec les champs manquants.
        """
        return (await CompletionPolicy(self.db).evaluate(job)).as_dict()

    # ============================================================
    # RÉSUMÉ DE L'ACTIVITÉ
    # ============================================================

    async def get_job_timeline(self, job_id: int) -> list:
        """Retourne la timeline complète d'une intervention."""
        from sqlalchemy import select
        result = await self.db.execute(
            select(JobActivityLog)
            .where(JobActivityLog.job_id == job_id)
            .order_by(JobActivityLog.created_at.asc())
        )
        return result.scalars().all()


# ============================================================
# HELPERS — Intégration avec jobs.py existant
# ============================================================

def get_valid_transitions(current: JobStatus) -> list[JobStatus]:
    """Retourne les transitions valides depuis un statut donné."""
    transitions = {
        JobStatus.PENDING: [
            JobStatus.ASSIGNED, JobStatus.CANCELLED, JobStatus.ON_HOLD,
            JobStatus.FAILED, JobStatus.CLIENT_ABSENT,
        ],
        JobStatus.ASSIGNED: [
            JobStatus.ACCEPTED,
            JobStatus.PENDING, JobStatus.CANCELLED, JobStatus.ON_HOLD,
            JobStatus.FAILED, JobStatus.CLIENT_ABSENT, JobStatus.POSTPONED,
        ],
        JobStatus.ACCEPTED: [
            JobStatus.EN_ROUTE,
            JobStatus.PENDING, JobStatus.CANCELLED, JobStatus.ON_HOLD,
            JobStatus.FAILED, JobStatus.CLIENT_ABSENT, JobStatus.POSTPONED,
        ],
        JobStatus.EN_ROUTE: [
            JobStatus.ON_SITE, JobStatus.CANCELLED,
            JobStatus.FAILED, JobStatus.POSTPONED,
        ],
        JobStatus.ON_SITE: [
            JobStatus.WORK_IN_PROGRESS, JobStatus.IN_PROGRESS,
            JobStatus.CANCELLED, JobStatus.FAILED, JobStatus.CLIENT_ABSENT,
            JobStatus.POSTPONED,
        ],
        JobStatus.IN_PROGRESS: [
            JobStatus.WORK_IN_PROGRESS, JobStatus.INSTALLATION_DONE,
            JobStatus.COMPLETED, JobStatus.EN_ATTENTE_VALIDATION,
            JobStatus.ON_HOLD, JobStatus.FAILED, JobStatus.SUSPENDED,
            JobStatus.POSTPONED,
        ],
        JobStatus.WORK_IN_PROGRESS: [
            JobStatus.INSTALLATION_DONE, JobStatus.IN_PROGRESS,
            JobStatus.ON_HOLD, JobStatus.FAILED, JobStatus.POSTPONED,
        ],
        JobStatus.INSTALLATION_DONE: [
            JobStatus.CLIENT_VALIDATION, JobStatus.COMPLETED,
            JobStatus.EN_ATTENTE_VALIDATION, JobStatus.FAILED,
            JobStatus.POSTPONED,
        ],
        JobStatus.CLIENT_VALIDATION: [
            JobStatus.COMPLETED, JobStatus.EN_ATTENTE_VALIDATION,
            JobStatus.FAILED, JobStatus.POSTPONED,
        ],
        JobStatus.EN_ATTENTE_VALIDATION: [
            JobStatus.COMPLETED, JobStatus.CLIENT_VALIDATION,
            JobStatus.FAILED, JobStatus.SUSPENDED,
        ],
        JobStatus.ON_HOLD: [
            JobStatus.PENDING, JobStatus.ASSIGNED, JobStatus.IN_PROGRESS,
            JobStatus.CANCELLED, JobStatus.FAILED,
        ],
        JobStatus.SUSPENDED: [
            JobStatus.PENDING, JobStatus.ASSIGNED, JobStatus.CANCELLED,
        ],
        JobStatus.FAILED: [
            JobStatus.PENDING, JobStatus.ASSIGNED, JobStatus.POSTPONED,
        ],
        JobStatus.CLIENT_ABSENT: [
            JobStatus.PENDING, JobStatus.POSTPONED,
        ],
        JobStatus.POSTPONED: [
            JobStatus.PENDING, JobStatus.ASSIGNED, JobStatus.CANCELLED,
        ],
        JobStatus.COMPLETED: [],
        JobStatus.CANCELLED: [],
    }
    return transitions.get(current, [])


# Temporary private alias for callers from older releases.
_get_valid_transitions = get_valid_transitions
