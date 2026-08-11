"""
Pydantic Schemas for Technician API
Request/Response models for validation and serialization
"""
from pydantic import AwareDatetime, BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from backend.database.models import TechnicianStatus, JobStatus, TechnicianLiveStatus


class TechnicianBase(BaseModel):
    """Base technician schema"""
    name: str = Field(..., min_length=1, max_length=100)
    employee_id: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)


class TechnicianCreate(TechnicianBase):
    """Schema for creating a new technician"""
    home_latitude: float = Field(..., ge=-90, le=90)
    home_longitude: float = Field(..., ge=-180, le=180)
    home_address: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    assigned_routes: List[str] = Field(default_factory=list)
    shift_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    shift_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    max_jobs_per_day: int = Field(default=8, ge=1, le=20)


class TechnicianUpdate(BaseModel):
    """Schema for updating technician information"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    employee_id: Optional[str] = Field(None, max_length=50)
    team: Optional[str] = Field(None, max_length=100)
    route_criteria: Optional[str] = Field(None, max_length=200)
    operator: Optional[str] = Field(None, max_length=100)
    vehicle: Optional[str] = Field(None, max_length=100)
    license_plate: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    notes: Optional[str] = None
    home_latitude: Optional[float] = Field(None, ge=-90, le=90)
    home_longitude: Optional[float] = Field(None, ge=-180, le=180)
    home_address: Optional[str] = None
    skills: Optional[List[str]] = None
    assigned_routes: Optional[List[str]] = None
    shift_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    shift_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    max_jobs_per_day: Optional[int] = Field(None, ge=1, le=20)
    is_active: Optional[bool] = None


class TechnicianLocationUpdate(BaseModel):
    """Schema for updating technician location"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class TechnicianStatusUpdate(BaseModel):
    """Schema for updating technician status (now maps to live_status)"""
    status: TechnicianLiveStatus


# =============================================================================
# NOUVEAUX SCHEMAS Sprint 7 — GPS Live, Statut temps réel, Supervision
# =============================================================================


class GPSLiveUpdate(BaseModel):
    """Point GPS envoyé par le mobile toutes les X secondes"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    # Geolocator/Android exposes ground speed in metres per second. Keep that
    # unit all the way to storage instead of silently treating it as km/h.
    speed: Optional[float] = Field(None, ge=0, description="Ground speed in m/s")
    heading: Optional[float] = Field(None, ge=0, le=360, description="Heading in degrees")
    accuracy: Optional[float] = Field(None, ge=0, description="Horizontal accuracy in metres")
    battery_level: Optional[int] = Field(None, ge=0, le=100)
    job_id: Optional[int] = None
    observed_at: Optional[AwareDatetime] = Field(
        None,
        description="UTC-aware timestamp at which the device obtained the fix",
    )

    model_config = ConfigDict(extra="forbid")


class TechnicianLiveStatusUpdate(BaseModel):
    """Changement de statut temps réel du technicien"""
    status: TechnicianLiveStatus
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    job_id: Optional[int] = None

    model_config = ConfigDict(extra="forbid")


class TechnicianLiveResponse(BaseModel):
    """Réponse avec les infos temps réel du technicien pour le Dashboard"""
    id: int
    name: str
    phone: Optional[str] = None
    live_status: TechnicianLiveStatus
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    current_speed: Optional[float] = None
    current_heading: Optional[float] = None
    current_accuracy: Optional[float] = None
    current_battery: Optional[int] = None
    last_location_update: Optional[datetime] = None
    current_job_id: Optional[int] = None
    current_job_customer: Optional[str] = None
    current_job_address: Optional[str] = None
    current_job_started_at: Optional[datetime] = None
    orienteur_name: Optional[str] = None
    sector_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GPSHistoryResponse(BaseModel):
    """Un point d'historique GPS"""
    id: int
    latitude: float
    longitude: float
    speed: Optional[float] = None
    heading: Optional[float] = None
    accuracy: Optional[float] = None
    battery_level: Optional[int] = None
    recorded_at: datetime
    job_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AlertResponse(BaseModel):
    """Alerte pour le Dashboard"""
    id: int
    alert_type: str
    severity: str
    technician_id: Optional[int] = None
    technician_name: Optional[str] = None
    job_id: Optional[int] = None
    message: str
    details: Optional[dict] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SupervisionMapResponse(BaseModel):
    """Réponse complète pour le Centre de Supervision"""
    technicians: List[TechnicianLiveResponse] = []
    alerts: List[AlertResponse] = []
    kpis: dict = {}


class TechnicianResponse(TechnicianBase):
    """Schema for technician responses — includes job counts and orienteur info"""
    id: int
    status: TechnicianStatus
    live_status: TechnicianLiveStatus
    is_active: bool
    current_latitude: Optional[float]
    current_longitude: Optional[float]
    current_speed: Optional[float] = None
    current_heading: Optional[float] = None
    current_accuracy: Optional[float] = None
    current_battery: Optional[int] = None
    current_job_id: Optional[int] = None
    last_location_update: Optional[datetime]
    home_latitude: float
    home_longitude: float
    home_address: Optional[str]
    skills: List[str]
    assigned_routes: List[str]
    shift_start: Optional[str]
    shift_end: Optional[str]
    max_jobs_per_day: int
    orienteur_id: Optional[int] = None
    orienteur_name: Optional[str] = None
    team_id: Optional[int] = None
    grade: str = "junior"
    created_at: datetime
    updated_at: datetime
    # Computed from assignments relationship
    assigned_jobs: int = 0
    completed_jobs: int = 0

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with_counts(cls, tech):
        """Build current workload and completed-passage counts."""
        assigned = 0
        completed = 0
        if tech.assignments:
            for a in tech.assignments:
                if a.ended_at is None:
                    assigned += 1
                elif a.end_reason in {
                    JobStatus.EN_ATTENTE_VALIDATION.value,
                    JobStatus.COMPLETED.value,
                }:
                    completed += 1

        orienteur_name = None
        if tech.orienteur:
            orienteur_name = tech.orienteur.name

        return cls(
            id=tech.id,
            name=tech.name,
            employee_id=tech.employee_id,
            phone=tech.phone,
            email=tech.email,
            status=tech.status,
            live_status=tech.live_status,
            is_active=tech.is_active,
            current_latitude=tech.current_latitude,
            current_longitude=tech.current_longitude,
            current_speed=tech.current_speed,
            current_heading=tech.current_heading,
            current_accuracy=tech.current_accuracy,
            current_battery=tech.current_battery,
            current_job_id=tech.current_job_id,
            last_location_update=tech.last_location_update,
            home_latitude=tech.home_latitude,
            home_longitude=tech.home_longitude,
            home_address=tech.home_address,
            skills=tech.skills,
            assigned_routes=tech.assigned_routes if tech.assigned_routes else [],
            shift_start=tech.shift_start,
            shift_end=tech.shift_end,
            max_jobs_per_day=tech.max_jobs_per_day,
            orienteur_id=tech.orienteur_id,
            orienteur_name=orienteur_name,
            team_id=getattr(tech, "team_id", None),
            grade=getattr(tech, "grade", "junior") or "junior",
            created_at=tech.created_at,
            updated_at=tech.updated_at,
            assigned_jobs=assigned,
            completed_jobs=completed,
        )


class TechnicianWorkload(BaseModel):
    """Schema for technician workload information"""
    technician_id: int
    technician_name: str
    date: datetime
    assigned_jobs: int
    max_jobs: int
    available_capacity: int
    total_estimated_hours: float
    status: TechnicianStatus


class MessageResponse(BaseModel):
    """Generic message response"""
    success: bool
    message: str
