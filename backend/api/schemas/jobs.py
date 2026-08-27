"""
Pydantic Schemas for Job API
Request/Response models for validation and serialization
"""

from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, Field, ConfigDict, model_validator

from backend.database.models import (
    JobStatus,
    JobType,
    JobPriority,
    EquipmentType,
)
from backend.logic.job_contract import JOB_CREATE_UNSUPPORTED_FIELDS
from backend.logic.job_planning import (
    canonical_estimated_duration_minutes,
    default_estimated_duration_minutes,
)


# ============================================================
# BASE
# ============================================================

class JobBase(BaseModel):
    """Base job schema"""

    customer_name: Optional[str] = Field(default=None, min_length=1, max_length=100)

    customer_phone: Optional[str] = Field(
        default=None,
        max_length=20
    )

    customer_email: Optional[str] = Field(
        default=None,
        max_length=100
    )

    service_address: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255
    )

    service_city: Optional[str] = Field(
        default=None,
        max_length=100
    )

    service_zip: Optional[str] = Field(
        default=None,
        max_length=10
    )


# ============================================================
# CREATE
# ============================================================

class JobCreate(JobBase):
    """Schema for creating a new job — supports all FTTH types dynamically"""

    model_config = ConfigDict(extra="forbid")

    job_number: Optional[str] = Field(
        default=None,
        max_length=50
    )

    job_type: JobType

    latitude: Optional[float] = Field(
        default=None,
        ge=-90,
        le=90
    )

    longitude: Optional[float] = Field(
        default=None,
        ge=-180,
        le=180
    )

    planned_location_source: Optional[str] = Field(default=None, max_length=32)

    planned_location_precision: Optional[str] = Field(default=None, max_length=32)

    required_skills: List[str] = Field(
        default_factory=list
    )

    route_criteria: Optional[str] = Field(
        default=None,
        max_length=50
    )

    sector_raw: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    sector_id: Optional[int] = Field(
        default=None,
        gt=0,
    )

    priority: JobPriority = JobPriority.NORMALE

    # IMPORTANT :
    # On garde DATE et pas DATETIME
    # pour pouvoir envoyer "2026-06-23"
    scheduled_date: Optional[datetime] = None

    time_slot_start: Optional[str] = Field(
        default=None,
        pattern=r"^\d{2}:\d{2}$"
    )

    time_slot_end: Optional[str] = Field(
        default=None,
        pattern=r"^\d{2}:\d{2}$"
    )

    estimated_duration: int = Field(
        default=60,
        ge=15,
        le=480
    )

    description: Optional[str] = None

    notes: Optional[str] = None

    special_instructions: Optional[str] = None

    equipment_type: Optional[EquipmentType] = None

    serial_number: Optional[str] = Field(
        default=None,
        max_length=100
    )

    client_signature: Optional[str] = None

    real_duration_minutes: Optional[int] = None

    assigned_technician_name: Optional[str] = Field(
        default=None,
        max_length=100
    )

    orienteur_id: Optional[int] = Field(
        default=None,
        description="ID de l'orienteur responsable (optionnel, utilisé par ADMIN/CHEF_ORIENTEUR)"
    )

    client_organization_id: Optional[int] = Field(
        default=None,
        gt=0,
        description="Entreprise cliente propriétaire du dossier (ADMIN/CHEF).",
    )

    # ============================================================
    # CHAMPS FTTH / RÉSEAU
    # ============================================================

    operator: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Opérateur FTTH (ex: IAM, INWI, ORANGE)"
    )

    nro: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Nœud de Raccordement Optique"
    )

    sro: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Sous-Répartiteur Optique"
    )

    pbo: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Point de Branchement Optique"
    )

    pto: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Point de Terminaison Optique"
    )

    splitter: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Splitter / répartiteur"
    )

    splitter_port: Optional[int] = Field(
        default=None,
        description="Numéro de port sur le splitter"
    )

    optical_power_dbm: Optional[float] = Field(
        default=None,
        description="Puissance optique mesurée en dBm"
    )

    cable_length_m: Optional[int] = Field(
        default=None,
        ge=0,
        description="Longueur de câble en mètres"
    )

    ont_serial: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Numéro de série ONT"
    )

    router_serial: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Numéro de série Routeur"
    )

    mac_address: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Adresse MAC"
    )

    # ============================================================
    # CHAMPS SPÉCIFIQUES PAR TYPE D'INTERVENTION
    # ============================================================

    # Dépannage
    ticket_number: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Numéro de ticket (Dépannage)"
    )

    panne_type: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Type de panne: internet, tv, telephone, los, pon"
    )

    manipulations_realisees: Optional[str] = Field(
        default=None,
        description="Manipulations déjà réalisées avant l'intervention"
    )

    # Migration
    ancien_operateur: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Ancien opérateur (Migration)"
    )

    nouvel_operateur: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Nouvel opérateur (Migration)"
    )

    ancien_ont_serial: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Ancien numéro de série ONT (Migration)"
    )

    ancien_router_serial: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Ancien numéro de série Routeur (Migration)"
    )

    port_source: Optional[int] = Field(
        default=None,
        description="Port source (Migration)"
    )

    port_destination: Optional[int] = Field(
        default=None,
        description="Port destination (Migration)"
    )

    # Raccordement
    nombre_fibres: Optional[int] = Field(
        default=None,
        description="Nombre de fibres (Raccordement)"
    )

    boite_raccordement: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Boîte de raccordement"
    )

    reserve_cable: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Réserve de câble"
    )

    type_cable: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Type de câble"
    )

    # Audit
    etat_pbo: Optional[str] = Field(
        default=None,
        max_length=100,
        description="État du PBO (Audit)"
    )

    etat_pto: Optional[str] = Field(
        default=None,
        max_length=100,
        description="État du PTO (Audit)"
    )

    etat_cable: Optional[str] = Field(
        default=None,
        max_length=100,
        description="État du câble (Audit)"
    )

    anomalies: Optional[str] = Field(
        default=None,
        description="Anomalies constatées (Audit)"
    )

    @model_validator(mode="before")
    @classmethod
    def apply_estimated_duration_default(cls, values):
        if not isinstance(values, dict) or "estimated_duration" in values:
            return values

        job_type = values.get("job_type")
        if job_type is None:
            return values

        return {
            **values,
            "estimated_duration": default_estimated_duration_minutes(job_type),
        }

    @model_validator(mode="after")
    def reject_unpersisted_fields(self):
        self.estimated_duration = canonical_estimated_duration_minutes(
            job_type=self.job_type,
            estimated_duration=self.estimated_duration,
            time_slot_start=self.time_slot_start,
            time_slot_end=self.time_slot_end,
        )

        unsupported = sorted(
            field_name
            for field_name in self.model_fields_set & JOB_CREATE_UNSUPPORTED_FIELDS
            if getattr(self, field_name) is not None
        )
        if unsupported:
            raise ValueError(
                "Champs non supportés par le modèle Job actuel : "
                + ", ".join(unsupported)
            )

        coordinates_are_partial = (self.latitude is None) != (self.longitude is None)
        if coordinates_are_partial:
            raise ValueError(
                "La latitude et la longitude doivent être fournies ensemble."
            )

        if (
            self.latitude is None
            and (
                self.planned_location_source is not None
                or self.planned_location_precision is not None
            )
        ):
            raise ValueError(
                "La provenance de localisation nécessite une latitude et une longitude."
            )
        return self


# ============================================================
# UPDATE
# ============================================================

class JobUpdate(BaseModel):
    """Schema for updating job"""

    customer_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100
    )

    customer_phone: Optional[str] = Field(
        default=None,
        max_length=20
    )

    customer_email: Optional[str] = Field(
        default=None,
        max_length=100
    )

    service_address: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255
    )

    service_city: Optional[str] = Field(
        default=None,
        max_length=100
    )

    service_zip: Optional[str] = Field(
        default=None,
        max_length=10
    )

    latitude: Optional[float] = Field(
        default=None,
        ge=-90,
        le=90
    )

    longitude: Optional[float] = Field(
        default=None,
        ge=-180,
        le=180
    )

    planned_location_source: Optional[str] = Field(default=None, max_length=32)

    planned_location_precision: Optional[str] = Field(default=None, max_length=32)

    required_skills: Optional[List[str]] = None

    route_criteria: Optional[str] = Field(
        default=None,
        max_length=50
    )

    sector_raw: Optional[str] = Field(
        default=None,
        max_length=100,
    )

    sector_id: Optional[int] = Field(
        default=None,
        gt=0,
    )

    priority: Optional[JobPriority] = None

    scheduled_date: Optional[datetime] = None

    time_slot_start: Optional[str] = Field(
        default=None,
        pattern=r"^\d{2}:\d{2}$"
    )

    time_slot_end: Optional[str] = Field(
        default=None,
        pattern=r"^\d{2}:\d{2}$"
    )

    estimated_duration: Optional[int] = Field(
        default=None,
        ge=15,
        le=480
    )

    description: Optional[str] = None

    notes: Optional[str] = None

    special_instructions: Optional[str] = None

    equipment_type: Optional[EquipmentType] = None

    serial_number: Optional[str] = None

    client_signature: Optional[str] = None

    real_duration_minutes: Optional[int] = None

    assigned_technician_name: Optional[str] = None

    client_organization_id: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="after")
    def reject_partial_coordinate_updates(self):
        coordinates_in_request = {
            "latitude",
            "longitude",
        } & self.model_fields_set
        if len(coordinates_in_request) == 1:
            raise ValueError(
                "La latitude et la longitude doivent être modifiées ensemble."
            )
        return self

# ============================================================
# STATUS UPDATE
# ============================================================

class JobStatusUpdate(BaseModel):
    """Update job status"""

    status: JobStatus

    reason: Optional[str] = Field(
        default=None,
        max_length=500
    )


# ============================================================
# RESPONSE
# ============================================================

def _current_assignment_assigned_at(job):
    assignment = getattr(job, "assignment", None)
    if assignment is None:
        return None
    return getattr(assignment, "assigned_at", None)


class JobResponse(JobBase):
    """Schema returned to frontend"""

    id: int

    job_number: Optional[str]

    job_type: JobType

    status: JobStatus

    latitude: Optional[float]

    longitude: Optional[float]

    planned_location_source: Optional[str] = None

    planned_location_precision: Optional[str] = None

    required_skills: List[str]

    route_criteria: Optional[str] = None

    sector_id: Optional[int] = None

    sector_raw: Optional[str] = None

    sector_name: Optional[str] = None

    priority: JobPriority

    # DATE uniquement
    scheduled_date: Optional[datetime]

    time_slot_start: Optional[str]

    time_slot_end: Optional[str]

    estimated_duration: int

    description: Optional[str]

    notes: Optional[str]

    special_instructions: Optional[str]

    # IMPORTANT :
    # garder DATETIME
    created_at: datetime

    updated_at: datetime

    accepted_at: Optional[datetime] = None

    started_at: Optional[datetime]

    completed_at: Optional[datetime]

    assigned_at: Optional[datetime] = None

    assigned_tech_id: Optional[int] = None

    assigned_tech_name: Optional[str] = None

    estimated_arrival: Optional[datetime] = None

    actual_duration_minutes: Optional[int] = None

    gps_latitude: Optional[float] = None

    gps_longitude: Optional[float] = None

    before_photo: Optional[str] = None

    after_photo: Optional[str] = None

    coordinator_comments: Optional[str] = None

    model_config = ConfigDict(
        from_attributes=True
    )

    equipment_type: Optional[EquipmentType] = None

    serial_number: Optional[str] = None

    client_signature: Optional[str] = None

    real_duration_minutes: Optional[int] = None

    assigned_technician_name: Optional[str] = None
    operator: str | None = None
    client_organization_id: int | None = None
    nro: str | None = None
    sro: str | None = None
    pbo: str | None = None
    splitter: str | None = None
    splitter_port: int | None = None
    pto: str | None = None
    optical_power_dbm: float | None = None
    cable_length_m: int | None = None
    ont_serial: str | None = None
    router_serial: str | None = None

    validation_status: str | None = None
    rejected_by_operator: bool = False
    failure_reason: str | None = None
    @classmethod
    def from_orm_with_assignment(cls, job):

        data = {
            "id": job.id,
            "job_number": job.job_number,
            "job_type": job.job_type,
            "status": job.status,

            "customer_name": job.customer_name,
            "customer_phone": job.customer_phone,
            "customer_email": job.customer_email,

            "service_address": job.service_address,
            "service_city": job.service_city,
            "service_zip": job.service_zip,

            "latitude": job.latitude,
            "longitude": job.longitude,
            "planned_location_source": getattr(
                job, "planned_location_source", None
            ),
            "planned_location_precision": getattr(
                job, "planned_location_precision", None
            ),

            "required_skills": job.required_skills,

            "route_criteria": job.route_criteria,

            "sector_id": getattr(
                job,
                "_canonical_sector_id",
                getattr(job, "sector_id", None),
            ),

            "sector_raw": getattr(
                job,
                "_canonical_sector_raw",
                getattr(job, "sector_raw", None),
            ),

            "sector_name": getattr(
                job,
                "_canonical_sector_name",
                None,
            ) or getattr(
                job.__dict__.get("sector"),
                "name",
                None,
            ),

            "priority": job.priority,

            "scheduled_date": job.scheduled_date,

            "time_slot_start": job.time_slot_start,
            "time_slot_end": job.time_slot_end,

            "estimated_duration": canonical_estimated_duration_minutes(
                job_type=job.job_type,
                estimated_duration=job.estimated_duration,
                time_slot_start=job.time_slot_start,
                time_slot_end=job.time_slot_end,
            ),

            "description": job.description,
            "notes": job.notes,
            "special_instructions": job.special_instructions,

            "created_at": job.created_at,
            "updated_at": job.updated_at,

            "accepted_at": getattr(job, "accepted_at", None),
            "started_at": job.started_at,
            "completed_at": job.completed_at,

            "assigned_at": None,

            "assigned_tech_id": None,
            "assigned_tech_name": None,

            "estimated_arrival": None,
            "actual_duration_minutes": None,

            "gps_latitude": job.gps_latitude,
            "gps_longitude": job.gps_longitude,

            "before_photo": job.before_photo,
            "after_photo": job.after_photo,

            "coordinator_comments": job.coordinator_comments,

            "equipment_type": job.equipment_type,
            "serial_number": job.serial_number,
            "client_signature": job.client_signature,
            "real_duration_minutes": job.real_duration_minutes,
            "assigned_technician_name": job.assigned_technician_name,

            "operator": getattr(job, "operator", None),
            "client_organization_id": getattr(job, "client_organization_id", None),
            "nro": getattr(job, "nro_raw", None),
            "sro": getattr(job, "sro_raw", None),
            "pbo": getattr(job, "pbo_raw", None),
            "splitter": getattr(job, "splitter_raw", None),
            "splitter_port": getattr(job, "splitter_port_raw", None),
            "pto": getattr(job, "pto_raw", None),
            "optical_power_dbm": getattr(job, "optical_power_dbm", None),
            "cable_length_m": getattr(job, "cable_length_m", None),
            "ont_serial": getattr(job, "ont_serial", None),
            "router_serial": getattr(job, "router_serial", None),
            "mac_address": getattr(job, "mac_address", None),
            "wifi_box_serial": getattr(job, "wifi_box_serial", None),
            "validation_status": getattr(job, "validation_status", None),
            "rejected_by_operator": getattr(job, "rejected_by_operator", False),
            "failure_reason": getattr(job, "failure_reason", None),
        }

        if job.assignment:

            data["assigned_at"] = _current_assignment_assigned_at(job)

            data["assigned_tech_id"] = (
                job.assignment.technician_id
            )

            data["estimated_arrival"] = (
                job.assignment.estimated_arrival
            )

            data["actual_duration_minutes"] = (
                job.assignment.actual_duration_minutes
            )

            if job.assignment.technician:

                data["assigned_tech_name"] = (
                    job.assignment.technician.name
                )

        return cls(**data)


# ============================================================
# SUMMARY
# ============================================================

class JobSummary(BaseModel):
    """Dashboard statistics"""

    model_config = ConfigDict(
        extra="forbid",
    )

    total: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    pending: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    assigned: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    in_progress: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    completed: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    cancelled: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    on_hold: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    urgent: int = Field(
        ...,
        strict=True,
        ge=0,
    )

    unassigned: int = Field(
        ...,
        strict=True,
        ge=0,
    )


# ============================================================
# TECHNICIAN FIELD DATA (Mobile)
# ============================================================

class TechFieldData(BaseModel):
    """Champs terrain modifiables par le technicien depuis le mobile.
    Interdit toute modification des champs administratifs."""

    # GPS
    gps_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    gps_longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    # Commentaires
    coordinator_comments: Optional[str] = None

    # Photos
    before_photo: Optional[str] = None
    after_photo: Optional[str] = None

    # Signature
    client_signature: Optional[str] = None

    # Puissance optique
    optical_power_dbm: Optional[float] = None

    # Métrage / longueur câble
    cable_length_m: Optional[int] = None

    # Matériel (numéros de série)
    ont_serial: Optional[str] = Field(default=None, max_length=100)
    router_serial: Optional[str] = Field(default=None, max_length=100)
    mac_address: Optional[str] = Field(default=None, max_length=100)
    wifi_box_serial: Optional[str] = Field(default=None, max_length=100)

    # Mesures terrain
    real_duration_minutes: Optional[int] = None

    # Données réseau (champs non-administratifs additionnels)
    nro: Optional[str] = None
    sro: Optional[str] = None
    pbo: Optional[str] = None
    splitter: Optional[str] = None
    splitter_port: Optional[int] = None
    pto: Optional[str] = None


class TechFieldResponse(BaseModel):
    """Réponse après mise à jour terrain par le technicien"""
    success: bool
    message: str
    job_id: int
    field_count: int


# ============================================================
# CAN DO
# ============================================================

class CanDoResult(BaseModel):
    """Can technician perform this job"""

    job_id: int

    technician_id: int

    can_do: bool

    has_skill: bool

    has_route: bool

    has_time: bool

    missing_skills: List[str]

    route_match: bool

    distance_miles: Optional[float] = None


# ============================================================
# STATUS TRANSITION (Mobile Sprint 2)
# ============================================================

class JobStatusTransition(BaseModel):
    """Changement de statut déclenché depuis le mobile"""
    new_status: str
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)
    comment: Optional[str] = None


class JobFailureCreate(BaseModel):
    """Déclaration d'échec depuis le mobile"""
    reason: str = Field(..., max_length=100)
    comment: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    accuracy: Optional[float] = Field(default=None, ge=0)


class JobPostponementCreate(BaseModel):
    """Demande de report depuis le mobile"""
    reason: str = Field(..., max_length=100)
    comment: Optional[str] = None
    requested_date: Optional[date | datetime] = None


class JobActivityLogResponse(BaseModel):
    """Réponse pour le journal d'activité"""
    id: int
    job_id: int
    technician_id: Optional[int] = None
    action: str
    description: Optional[str] = None
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
