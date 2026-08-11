from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Text,
    text,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import enum
from typing import Type


def _enum_values(enum_type: Type[enum.Enum]) -> list:
    """Retourne les valeurs (lowercase) d'un enum Python.
    Nécessaire car PostgreSQL a déjà les valeurs en minuscules dans l'enum
    (migration v013), pas les noms Python en majuscules."""
    return [e.value for e in enum_type]


class Base(DeclarativeBase):
    pass


class JobStatus(str, enum.Enum):
    # Statuts historiques (rétrocompatibles)
    PENDING = "pending"
    ASSIGNED = "assigned"
    ACCEPTED = "accepted"
    IN_PROGRESS = "in_progress"
    EN_ATTENTE_VALIDATION = "en_attente_validation"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ON_HOLD = "on_hold"

    # Nouveaux statuts Sprint 2 — Workflow terrain
    EN_ROUTE = "en_route"
    ON_SITE = "on_site"
    WORK_IN_PROGRESS = "work_in_progress"
    INSTALLATION_DONE = "installation_done"
    CLIENT_VALIDATION = "client_validation"

    # Statuts spéciaux
    FAILED = "failed"
    CLIENT_ABSENT = "client_absent"
    POSTPONED = "postponed"
    SUSPENDED = "suspended"


class JobType(str, enum.Enum):
    INSTALLATION = "INSTALLATION"
    DEPANNAGE = "DEPANNAGE"
    MAINTENANCE = "MAINTENANCE"
    SAV = "SAV"
    DISCONNECT = "DISCONNECT"
    INSPECTION = "INSPECTION"
    INCIDENT = "INCIDENT"
    URGENCE = "URGENCE"
    MIGRATION = "MIGRATION"
    RACCORDEMENT = "RACCORDEMENT"
    AUDIT = "AUDIT"
    TUBAGE = "TUBAGE"
    NON_JOIGNABLE = "NON_JOIGNABLE"
    ANNULATION = "ANNULATION"
    SPLITTER = "SPLITTER"
    CROQUIS_RESEAU = "CROQUIS_RESEAU"


# Aliases pour compatibilité avec le code existant (seed_data, routes, services)
JobType.INSTALL = JobType.INSTALLATION
JobType.REPAIR = JobType.DEPANNAGE
JobType.SERVICE_CHANGE = JobType.SAV


class EquipmentType(str, enum.Enum):
    ONU_INWI = "ONU_INWI"
    ONT_IAM = "ONT_IAM"
    ONT_ORANGE = "ONT_ORANGE"
    HUAWEI = "HUAWEI"
    ZTE = "ZTE"
    NOKIA = "NOKIA"


class JobPriority(str, enum.Enum):
    URGENT = "URGENT"
    HAUTE = "HAUTE"
    NORMALE = "NORMALE"
    FAIBLE = "FAIBLE"


class TechnicianStatus(str, enum.Enum):
    AVAILABLE = "disponible"
    ON_JOB = "en_tache"
    EN_ROUTE = "en_route"
    ON_BREAK = "pause"
    OFF_DUTY = "hors_service"


class TechnicianLiveStatus(str, enum.Enum):
    """Statuts temps réel du technicien pour le Dashboard"""
    DISPONIBLE = "disponible"
    EN_INTERVENTION = "en_intervention"
    PAUSE = "pause"
    HORS_SERVICE = "hors_service"
    DECONNECTE = "deconnecte"


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    CHEF_ORIENTEUR = "CHEF_ORIENTEUR"
    ORIENTEUR = "ORIENTEUR"
    TECHNICIAN = "TECHNICIAN"
    COORDINATEUR = "COORDINATEUR"
    SUPERVISEUR = "SUPERVISEUR"
    CLIENT = "CLIENT"


# =============================================================================
# NOUVEAUX ÉNUMS — Stock FTTH
# =============================================================================


class StockMovementType(str, enum.Enum):
    """Type de mouvement de stock"""
    RECEPTION = "RECEPTION"
    SORTIE = "SORTIE"
    RETOUR = "RETOUR"
    CONSOMMATION = "CONSOMMATION"
    TRANSFERT = "TRANSFERT"
    INVENTAIRE = "INVENTAIRE"
    MISE_AU_REBUT = "MISE_AU_REBUT"


class StockIssueStatus(str, enum.Enum):
    """Statut d'un bon de sortie"""
    BROUILLON = "BROUILLON"
    VALIDE = "VALIDE"
    ANNULE = "ANNULE"


class StockReturnStatus(str, enum.Enum):
    """Statut d'un bon de retour"""
    BROUILLON = "BROUILLON"
    VALIDE = "VALIDE"
    ANNULE = "ANNULE"


class StockConsumptionStatus(str, enum.Enum):
    """Statut d'une consommation"""
    BROUILLON = "BROUILLON"
    VALIDE = "VALIDE"
    ANNULE = "ANNULE"


class InventoryCountStatus(str, enum.Enum):
    """Statut d'un inventaire"""
    PLANIFIE = "PLANIFIE"
    EN_COURS = "EN_COURS"
    TERMINE = "TERMINE"
    VALIDE = "VALIDE"
    ANNULE = "ANNULE"


# =============================================================================
# MODÈLES EXISTANTS (inchangés)
# =============================================================================


class NRO(Base):
    __tablename__ = "nro"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    sros: Mapped[List["SRO"]] = relationship("SRO", back_populates="nro", lazy="selectin")


class SRO(Base):
    __tablename__ = "sro"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    nro_id: Mapped[int] = mapped_column(Integer, ForeignKey("nro.id"), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255))
    nro: Mapped["NRO"] = relationship("NRO", back_populates="sros", lazy="selectin")
    pbos: Mapped[List["PBO"]] = relationship("PBO", back_populates="sro", lazy="selectin")


class PBO(Base):
    __tablename__ = "pbo"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    sro_id: Mapped[int] = mapped_column(Integer, ForeignKey("sro.id"), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    sro: Mapped["SRO"] = relationship("SRO", back_populates="pbos", lazy="selectin")
    ptos: Mapped[List["PTO"]] = relationship("PTO", back_populates="pbo", lazy="selectin")


class PTO(Base):
    __tablename__ = "pto"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    pbo_id: Mapped[int] = mapped_column(Integer, ForeignKey("pbo.id"), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255))
    pbo: Mapped["PBO"] = relationship("PBO", back_populates="ptos", lazy="selectin")
    jobs: Mapped[List["Job"]] = relationship("Job", back_populates="pto", lazy="selectin")


class Splitter(Base):
    __tablename__ = "splitters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    pbo_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pbo.id"))
    ratio: Mapped[str] = mapped_column(String(10), default="1:8")
    pbo: Mapped[Optional["PBO"]] = relationship("PBO")


class Port(Base):
    __tablename__ = "ports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    splitter_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("splitters.id"))
    port_number: Mapped[int] = mapped_column(Integer, nullable=False)
    is_occupied: Mapped[bool] = mapped_column(Boolean, default=False)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"))
    splitter: Mapped[Optional["Splitter"]] = relationship("Splitter")


class Sector(Base):
    """Modèle représentant un secteur géographique d'intervention"""
    __tablename__ = "sectors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), default="#1F497D")  # Hex color
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    # Relations
    orienteurs: Mapped[List["Orienteur"]] = relationship("Orienteur", back_populates="sector", lazy="selectin")
    jobs: Mapped[List["Job"]] = relationship(
        "Job",
        back_populates="sector",
        lazy="selectin",
    )

    def __repr__(self):
        return f"<Sector(id={self.id}, name='{self.name}')>"


class ClientOrganization(Base):
    """Entreprise donneuse d'ordre disposant d'un accès BlueVector en lecture."""

    __tablename__ = "client_organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    operator: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class Site(Base):
    """Stable physical-site identity, separate from mutable work orders."""

    __tablename__ = "sites"
    __table_args__ = (
        Index(
            "uq_sites_canonical_pto",
            "pto_id",
            unique=True,
            postgresql_where=text("pto_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    client_organization_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("client_organizations.id", ondelete="SET NULL"), index=True
    )
    operator: Mapped[Optional[str]] = mapped_column(String(50))
    pto_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pto.id", ondelete="SET NULL"), index=True
    )
    pbo_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pbo.id", ondelete="SET NULL"), index=True
    )
    pto_reference: Mapped[Optional[str]] = mapped_column(String(100))
    pbo_reference: Mapped[Optional[str]] = mapped_column(String(100))
    address_snapshot: Mapped[Optional[str]] = mapped_column(String(255))
    city_snapshot: Mapped[Optional[str]] = mapped_column(String(100))
    zip_snapshot: Mapped[Optional[str]] = mapped_column(String(20))
    canonical_latitude: Mapped[Optional[float]] = mapped_column(Float)
    canonical_longitude: Mapped[Optional[float]] = mapped_column(Float)
    canonical_accuracy_m: Mapped[Optional[float]] = mapped_column(Float)
    location_source: Mapped[Optional[str]] = mapped_column(String(32))
    resolved_observation_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_site_observations.id", ondelete="SET NULL")
    )
    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL")
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    match_basis: Mapped[str] = mapped_column(String(40), nullable=False)
    match_confidence: Mapped[str] = mapped_column(String(16), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )

    jobs: Mapped[List["Job"]] = relationship("Job", back_populates="site", lazy="selectin")


class FieldTeam(Base):
    """Équipe opérationnelle : un orienteur, des techniciens et des secteurs."""

    __tablename__ = "field_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True)
    orienteur_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("orienteurs.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class FieldTeamSector(Base):
    __tablename__ = "field_team_sectors"
    __table_args__ = (
        UniqueConstraint("team_id", "sector_id", name="uq_field_team_sector"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("field_teams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sector_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sectors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )


class Orienteur(Base):
    """Modèle représentant un orienteur (gestionnaire d'équipe de techniciens)"""
    __tablename__ = "orienteurs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    sector_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sectors.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    # Relations
    sector: Mapped[Optional["Sector"]] = relationship("Sector", back_populates="orienteurs", lazy="selectin")
    technicians: Mapped[List["Technician"]] = relationship("Technician", back_populates="orienteur", lazy="selectin")
    sectors: Mapped[List["OrienteurSector"]] = relationship("OrienteurSector", back_populates="orienteur", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<Orienteur(id={self.id}, name='{self.name}', sector_id={self.sector_id})>"


class OrienteurSector(Base):
    """Secteurs assignés à un orienteur (relation N:N pour évolutivité future)"""
    __tablename__ = "orienteur_sectors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    orienteur_id: Mapped[int] = mapped_column(Integer, ForeignKey("orienteurs.id"), nullable=False)
    sector_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    orienteur: Mapped["Orienteur"] = relationship("Orienteur", back_populates="sectors", lazy="selectin")

    def __repr__(self):
        return f"<OrienteurSector(id={self.id}, sector='{self.sector_name}')>"


class Technician(Base):
    __tablename__ = "technicians"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="technician", uselist=False, lazy="selectin"
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    employee_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[TechnicianStatus] = mapped_column(Enum(TechnicianStatus), default=TechnicianStatus.AVAILABLE, nullable=False)
    # Nouveau statut temps réel Sprint 7 (plus granulaire pour le Dashboard)
    live_status: Mapped[TechnicianLiveStatus] = mapped_column(
        Enum(TechnicianLiveStatus),
        default=TechnicianLiveStatus.DECONNECTE,
        nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    current_latitude: Mapped[Optional[float]] = mapped_column(Float)
    current_longitude: Mapped[Optional[float]] = mapped_column(Float)
    # Nouveaux champs GPS Sprint 7
    current_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # direction en degrés
    current_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_battery: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # pourcentage batterie
    last_location_update: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    home_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    home_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    home_address: Mapped[Optional[str]] = mapped_column(String(255))
    skills: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    assigned_routes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    speed_factor: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    skill_bonuses: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    shift_start: Mapped[Optional[str]] = mapped_column(String(5))
    shift_end: Mapped[Optional[str]] = mapped_column(String(5))
    max_jobs_per_day: Mapped[int] = mapped_column(Integer, default=8)
    # Login pour les techniciens (mobile)
    username: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    # Association à un orienteur (équipe)
    orienteur_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orienteurs.id"), nullable=True)
    team_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("field_teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    grade: Mapped[str] = mapped_column(
        String(20), default="junior", server_default="junior", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    # Relations
    orienteur: Mapped[Optional["Orienteur"]] = relationship("Orienteur", back_populates="technicians", lazy="selectin")
    assignments: Mapped[List["Assignment"]] = relationship(
        "Assignment", back_populates="technician", cascade="all, delete-orphan", lazy="selectin"
    )
    gps_history: Mapped[List["GPSHistory"]] = relationship(
        "GPSHistory", back_populates="technician", cascade="all, delete-orphan", lazy="selectin"
    )
    current_job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=True)

    def __repr__(self):
        return f"<Technician(id={self.id}, name='{self.name}', status='{self.status}')>"


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_number: Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True)
    job_type: Mapped[JobType] = mapped_column(Enum(JobType), default=JobType.INSTALLATION, nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False, index=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_phone: Mapped[Optional[str]] = mapped_column(String(20))
    customer_email: Mapped[Optional[str]] = mapped_column(String(100))
    service_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    service_city: Mapped[Optional[str]] = mapped_column(String(100))
    service_zip: Mapped[Optional[str]] = mapped_column(String(10))
    sector_raw: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    sector_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey(
            "sectors.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )
    # Planned coordinates are optional. A dossier may be created from an address
    # alone; reliable field coordinates stay in JobSiteObservation instead.
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    planned_location_source: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    planned_location_precision: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True
    )
    required_skills: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    route_criteria: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    operator: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    client_organization_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("client_organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    site_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    nro_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("nro.id"))
    sro_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sro.id"))
    pbo_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pbo.id"))
    pto_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pto.id"))
    port_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("ports.id"))
    nro_raw: Mapped[Optional[str]] = mapped_column(String(100))
    sro_raw: Mapped[Optional[str]] = mapped_column(String(100))
    pbo_raw: Mapped[Optional[str]] = mapped_column(String(100))
    pto_raw: Mapped[Optional[str]] = mapped_column(String(100))
    splitter_raw: Mapped[Optional[str]] = mapped_column(String(100))
    splitter_port_raw: Mapped[Optional[int]] = mapped_column(Integer)
    optical_power_dbm: Mapped[Optional[float]] = mapped_column(Float)
    cable_length_m: Mapped[Optional[int]] = mapped_column(Integer)
    ont_serial: Mapped[Optional[str]] = mapped_column(String(100))
    router_serial: Mapped[Optional[str]] = mapped_column(String(100))
    mac_address: Mapped[Optional[str]] = mapped_column(String(100))
    # SN Boîtier WiFi (scan QR code / code-barres)
    wifi_box_serial: Mapped[Optional[str]] = mapped_column(String(100))
    validation_status: Mapped[Optional[str]] = mapped_column(String(50))
    rejected_by_operator: Mapped[bool] = mapped_column(Boolean, default=False)
    failure_reason: Mapped[Optional[str]] = mapped_column(Text)
    priority: Mapped[JobPriority] = mapped_column(Enum(JobPriority), default=JobPriority.NORMALE, nullable=False)
    assigned_technician_name: Mapped[Optional[str]] = mapped_column(String(100))
    scheduled_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    time_slot_start: Mapped[Optional[str]] = mapped_column(String(5))
    time_slot_end: Mapped[Optional[str]] = mapped_column(String(5))
    estimated_duration: Mapped[int] = mapped_column(Integer, default=60)
    description: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    special_instructions: Mapped[Optional[str]] = mapped_column(Text)
    equipment_type: Mapped[Optional[EquipmentType]] = mapped_column(Enum(EquipmentType), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))
    gps_latitude: Mapped[Optional[float]] = mapped_column(Float)
    gps_longitude: Mapped[Optional[float]] = mapped_column(Float)
    before_photo: Mapped[Optional[str]] = mapped_column(String(255))
    after_photo: Mapped[Optional[str]] = mapped_column(String(255))
    client_signature: Mapped[Optional[str]] = mapped_column(String(255))
    real_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    coordinator_comments: Mapped[Optional[str]] = mapped_column(Text)
    # GPS départ et arrivée précis pour l'historique
    start_latitude: Mapped[Optional[float]] = mapped_column(Float)
    start_longitude: Mapped[Optional[float]] = mapped_column(Float)
    # Workflow terrain : arrivée sur site et qui a démarré
    arrival_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    started_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    end_latitude: Mapped[Optional[float]] = mapped_column(Float)
    end_longitude: Mapped[Optional[float]] = mapped_column(Float)
    # Association à un orienteur responsable
    orienteur_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orienteurs.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Soft delete (archivage)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sector: Mapped[Optional["Sector"]] = relationship(
        "Sector",
        back_populates="jobs",
        lazy="selectin",
    )
    site: Mapped[Optional["Site"]] = relationship("Site", back_populates="jobs", lazy="selectin")
    pto: Mapped[Optional["PTO"]] = relationship("PTO", back_populates="jobs", lazy="selectin")
    orienteur: Mapped[Optional["Orienteur"]] = relationship("Orienteur", lazy="selectin")
    assignment: Mapped[Optional["Assignment"]] = relationship(
        "Assignment",
        primaryjoin="and_(Job.id == foreign(Assignment.job_id), Assignment.ended_at.is_(None))",
        uselist=False,
        viewonly=True,
        lazy="selectin",
        overlaps="assignment_history,job",
    )
    assignment_history: Mapped[List["Assignment"]] = relationship(
        "Assignment",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="Assignment.assigned_at",
        lazy="selectin",
        overlaps="assignment",
    )
    visits: Mapped[List["JobVisit"]] = relationship(
        "JobVisit",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobVisit.attempt_number",
        lazy="selectin",
    )
    incidents: Mapped[List["Incident"]] = relationship("Incident", back_populates="job", lazy="selectin")

    def __repr__(self):
        return f"<Job(id={self.id}, type='{self.job_type}', status='{self.status}')>"


class JobVisit(Base):
    """One physical field passage for a work order.

    ``Job`` remains the stable order consumed by existing clients.  A visit is
    append-only operational history: retries after a failure, postponement or
    absence receive a new attempt instead of overwriting the previous passage.
    """

    __tablename__ = "job_visits"
    __table_args__ = (
        UniqueConstraint("job_id", "attempt_number", name="uq_job_visits_attempt"),
        Index(
            "uq_job_visits_open_job",
            "job_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    primary_technician_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("technicians.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    outcome: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    arrived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    work_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    start_latitude: Mapped[Optional[float]] = mapped_column(Float)
    start_longitude: Mapped[Optional[float]] = mapped_column(Float)
    end_latitude: Mapped[Optional[float]] = mapped_column(Float)
    end_longitude: Mapped[Optional[float]] = mapped_column(Float)
    backfill_confidence: Mapped[Optional[str]] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"), nullable=False
    )

    job: Mapped["Job"] = relationship("Job", back_populates="visits", lazy="selectin")
    primary_technician: Mapped[Optional["Technician"]] = relationship(
        "Technician", lazy="selectin"
    )
    assignments: Mapped[List["Assignment"]] = relationship(
        "Assignment", back_populates="visit", lazy="selectin"
    )


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        Index(
            "uq_assignments_current_job",
            "job_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=False)
    technician_id: Mapped[int] = mapped_column(Integer, ForeignKey("technicians.id"), nullable=False)
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    end_reason: Mapped[Optional[str]] = mapped_column(String(40))
    assigned_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    ended_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    sequence: Mapped[Optional[int]] = mapped_column(Integer)
    estimated_travel_time: Mapped[Optional[int]] = mapped_column(Integer)
    estimated_distance: Mapped[Optional[float]] = mapped_column(Float)
    estimated_arrival: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    actual_travel_time: Mapped[Optional[int]] = mapped_column(Integer)
    actual_arrival: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    actual_completion: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    actual_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    job: Mapped["Job"] = relationship(
        "Job", back_populates="assignment_history", lazy="selectin", overlaps="assignment"
    )
    technician: Mapped["Technician"] = relationship("Technician", back_populates="assignments", lazy="selectin")
    visit: Mapped[Optional["JobVisit"]] = relationship(
        "JobVisit", back_populates="assignments", lazy="selectin"
    )

    def __repr__(self):
        return f"<Assignment(id={self.id}, job_id={self.job_id}, tech_id={self.technician_id})>"


class EquipmentInventory(Base):
    __tablename__ = "equipment_inventory"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    serial_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    mac_address: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    operator: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    equipment_type: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="STOCK")
    warehouse: Mapped[Optional[str]] = mapped_column(String(100))
    vehicle: Mapped[Optional[str]] = mapped_column(String(100))
    assigned_job_id: Mapped[Optional[int]] = mapped_column(ForeignKey("jobs.id"))
    min_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    alert_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"), nullable=True)
    orienteur_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("orienteurs.id"), nullable=True)
    client_organization_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("client_organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    technician: Mapped[Optional["Technician"]] = relationship("Technician", back_populates="user", lazy="selectin")
    orienteur: Mapped[Optional["Orienteur"]] = relationship("Orienteur", lazy="selectin")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', role='{self.role}')>"


class ImportHistory(Base):
    __tablename__ = "import_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    operator: Mapped[Optional[str]] = mapped_column(String(20))
    file_count: Mapped[int] = mapped_column(Integer, default=1)
    jobs_created: Mapped[int] = mapped_column(Integer, default=0)
    jobs_updated: Mapped[int] = mapped_column(Integer, default=0)
    jobs_ignored: Mapped[int] = mapped_column(Integer, default=0)
    errors_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    logs: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    imported_by: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    def __repr__(self):
        return f"<ImportHistory(id={self.id}, filename='{self.filename}', operator='{self.operator}', created={self.jobs_created})>"


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=True)
    incident_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    description: Mapped[Optional[str]] = mapped_column(Text)
    reported_by: Mapped[Optional[str]] = mapped_column(String(100))
    assigned_to: Mapped[Optional[str]] = mapped_column(String(100))
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolution_time: Mapped[Optional[int]] = mapped_column(Integer)
    root_cause: Mapped[Optional[str]] = mapped_column(Text)
    corrective_action: Mapped[Optional[str]] = mapped_column(Text)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    is_escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    job: Mapped[Optional["Job"]] = relationship("Job", back_populates="incidents", lazy="selectin")

    def __repr__(self):
        return f"<Incident(id={self.id}, type='{self.incident_type}', status='{self.status}')>"


# =============================================================================
# NOUVEAU MODÈLE Sprint 7 — Historique GPS
# =============================================================================


class GPSHistory(Base):
    """
    Historique des positions GPS d'un technicien.
    Enregistré périodiquement pendant le Live GPS.
    Permet de tracer le trajet complet sur le Dashboard.
    """
    __tablename__ = "gps_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    technician_id: Mapped[int] = mapped_column(Integer, ForeignKey("technicians.id"), nullable=False, index=True)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=True, index=True)
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # m/s (device ground speed)
    heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # degrés
    accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # mètres
    battery_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # pourcentage
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    # Relations
    technician: Mapped["Technician"] = relationship("Technician", back_populates="gps_history", lazy="selectin")
    job: Mapped[Optional["Job"]] = relationship("Job", lazy="selectin")

    def __repr__(self):
        return f"<GPSHistory(id={self.id}, tech={self.technician_id}, lat={self.latitude:.4f}, lon={self.longitude:.4f})>"


# =============================================================================
# NOUVEAU MODÈLE Sprint 7 — Alertes en temps réel
# =============================================================================


class Alert(Base):
    """
    Alertes générées automatiquement par le système.
    Visibles sur le Dashboard en temps réel.
    """
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), default="INFO")  # INFO, WARNING, CRITICAL
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"), nullable=True)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=True)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    # Relations
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")
    job: Mapped[Optional["Job"]] = relationship("Job", lazy="selectin")

    def __repr__(self):
        return f"<Alert(id={self.id}, type='{self.alert_type}', severity='{self.severity}')>"


# =============================================================================
# NOUVEAUX MODÈLES — Stock FTTH Professionnel
# =============================================================================


class StockItem(Base):
    """
    Catalogue des articles/références gérés en stock.
    Chaque ligne représente UN type d'équipement (ex: "ONT IAM HG8240").
    """
    __tablename__ = "stock_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reference: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    equipment_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    operator: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(100))
    model: Mapped[Optional[str]] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(20), default="unité")
    unit_price: Mapped[Optional[float]] = mapped_column(Float)
    category: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    min_stock_threshold: Mapped[int] = mapped_column(Integer, default=5)
    alert_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    stock_lines: Mapped[List["Stock"]] = relationship("Stock", back_populates="item", cascade="all, delete-orphan", lazy="selectin")
    movement_lines: Mapped[List["StockMovement"]] = relationship("StockMovement", back_populates="item", lazy="selectin")

    def __repr__(self):
        return f"<StockItem(id={self.id}, ref='{self.reference}', type='{self.equipment_type}')>"


class Warehouse(Base):
    """
    Entrepôt / dépôt / véhicule.
    Un warehouse peut être un entrepôt physique, un magasin, un véhicule de technicien, etc.
    """
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(30), default="ENTREPOT")
    address: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    stock_lines: Mapped[List["Stock"]] = relationship("Stock", back_populates="warehouse", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<Warehouse(id={self.id}, name='{self.name}', type='{self.type}')>"


class Stock(Base):
    """
    Stock physique : quantité d'un article (StockItem) dans un entrepôt (Warehouse).
    Permet de connaître le stock disponible en temps réel.
    """
    __tablename__ = "stock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    available_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    batch_number: Mapped[Optional[str]] = mapped_column(String(100))
    expiration_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    item: Mapped["StockItem"] = relationship("StockItem", back_populates="stock_lines", lazy="selectin")
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", back_populates="stock_lines", lazy="selectin")

    def __repr__(self):
        return f"<Stock(item='{self.item_id}', warehouse='{self.warehouse_id}', qty={self.quantity}, avail={self.available_quantity})>"


class StockMovement(Base):
    """
    Mouvement de stock : trace chaque entrée, sortie, retour, consommation, transfert.
    Cœur de la traçabilité.
    """
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_items.id"), nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)
    movement_type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_before: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_type: Mapped[Optional[str]] = mapped_column(String(50))
    reference_id: Mapped[Optional[int]] = mapped_column(Integer)
    operator: Mapped[Optional[str]] = mapped_column(String(20))
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"))
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relations
    item: Mapped["StockItem"] = relationship("StockItem", back_populates="movement_lines", lazy="selectin")
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", lazy="selectin")
    job: Mapped[Optional["Job"]] = relationship("Job", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")

    def __repr__(self):
        return f"<StockMovement(id={self.id}, type='{self.movement_type}', qty={self.quantity})>"


class StockIssue(Base):
    """
    Bon de sortie (issue note).
    Document qui autorise et trace une sortie de stock.
    """
    __tablename__ = "stock_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    issue_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(Integer, ForeignKey("warehouses.id"), nullable=False)
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"))
    operator: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[StockIssueStatus] = mapped_column(Enum(StockIssueStatus), default=StockIssueStatus.BROUILLON, nullable=False)
    issued_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    validated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")
    job: Mapped[Optional["Job"]] = relationship("Job", lazy="selectin")
    items: Mapped[List["StockIssueItem"]] = relationship("StockIssueItem", back_populates="issue", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<StockIssue(id={self.id}, number='{self.issue_number}', status='{self.status}')>"


class StockIssueItem(Base):
    """
    Ligne de bon de sortie : un article avec sa quantité.
    """
    __tablename__ = "stock_issue_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    issue_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_issues.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_delivered: Mapped[int] = mapped_column(Integer, default=0)

    # Relations
    issue: Mapped["StockIssue"] = relationship("StockIssue", back_populates="items", lazy="selectin")
    item: Mapped["StockItem"] = relationship("StockItem", lazy="selectin")

    def __repr__(self):
        return f"<StockIssueItem(id={self.id}, item={self.item_id}, qty={self.quantity})>"


class StockReturn(Base):
    """
    Bon de retour (return note).
    Document qui trace le retour d'équipements non utilisés.
    """
    __tablename__ = "stock_returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    return_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(Integer, ForeignKey("warehouses.id"), nullable=False)
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"))
    operator: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[StockReturnStatus] = mapped_column(Enum(StockReturnStatus), default=StockReturnStatus.BROUILLON, nullable=False)
    returned_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    validated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")
    job: Mapped[Optional["Job"]] = relationship("Job", lazy="selectin")
    items: Mapped[List["StockReturnItem"]] = relationship("StockReturnItem", back_populates="return_note", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<StockReturn(id={self.id}, number='{self.return_number}', status='{self.status}')>"


class StockReturnItem(Base):
    """
    Ligne de bon de retour : un article avec sa quantité retournée.
    """
    __tablename__ = "stock_return_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    return_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_returns.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    condition: Mapped[Optional[str]] = mapped_column(String(30), default="BON_ETAT")
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))

    # Relations
    return_note: Mapped["StockReturn"] = relationship("StockReturn", back_populates="items", lazy="selectin")
    item: Mapped["StockItem"] = relationship("StockItem", lazy="selectin")

    def __repr__(self):
        return f"<StockReturnItem(id={self.id}, item={self.item_id}, qty={self.quantity})>"


class StockConsumption(Base):
    """
    Consommation : équipement utilisé/posé chez un client (consommé sur une intervention).
    """
    __tablename__ = "stock_consumption"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    consumption_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    job_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("jobs.id"), index=True)
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    operator: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[StockConsumptionStatus] = mapped_column(Enum(StockConsumptionStatus), default=StockConsumptionStatus.BROUILLON, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    validated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    job: Mapped[Optional["Job"]] = relationship("Job", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")
    items: Mapped[List["StockConsumptionItem"]] = relationship("StockConsumptionItem", back_populates="consumption", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<StockConsumption(id={self.id}, number='{self.consumption_number}', status='{self.status}')>"


class StockConsumptionItem(Base):
    """
    Ligne de consommation : un article posé/installé chez le client.
    Inclut le numéro de série de l'équipement posé.
    """
    __tablename__ = "stock_consumption_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    consumption_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_consumption.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))
    mac_address: Mapped[Optional[str]] = mapped_column(String(100))

    # Relations
    consumption: Mapped["StockConsumption"] = relationship("StockConsumption", back_populates="items", lazy="selectin")
    item: Mapped["StockItem"] = relationship("StockItem", lazy="selectin")

    def __repr__(self):
        return f"<StockConsumptionItem(id={self.id}, item={self.item_id}, qty={self.quantity})>"


class InventoryCount(Base):
    """
    Inventaire physique : comptage périodique du stock.
    """
    __tablename__ = "inventory_counts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    count_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    warehouse_id: Mapped[int] = mapped_column(Integer, ForeignKey("warehouses.id"), nullable=False)
    operator: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[InventoryCountStatus] = mapped_column(Enum(InventoryCountStatus), default=InventoryCountStatus.PLANIFIE, nullable=False)
    counted_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    validated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    counted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", lazy="selectin")
    items: Mapped[List["InventoryCountItem"]] = relationship("InventoryCountItem", back_populates="inventory_count", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<InventoryCount(id={self.id}, number='{self.count_number}', status='{self.status}')>"


class InventoryCountItem(Base):
    """
    Ligne d'inventaire : écart entre stock théorique et stock réel pour un article.
    """
    __tablename__ = "inventory_count_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inventory_count_id: Mapped[int] = mapped_column(Integer, ForeignKey("inventory_counts.id"), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("stock_items.id"), nullable=False)
    theoretical_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    difference: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relations
    inventory_count: Mapped["InventoryCount"] = relationship("InventoryCount", back_populates="items", lazy="selectin")
    item: Mapped["StockItem"] = relationship("StockItem", lazy="selectin")

    def __repr__(self):
        return f"<InventoryCountItem(id={self.id}, item={self.item_id}, diff={self.difference})>"


# =============================================================================
# NOUVEAU MODÈLE — Journal d'activité (Sprint 2)
# =============================================================================


class JobActivityLog(Base):
    """
    Journal d'activité d'une intervention.
    Chaque action importante est historisée :
    - début d'intervention
    - changement de statut
    - GPS enregistré
    - clôture
    - échec
    - report
    """
    __tablename__ = "job_activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    old_status: Mapped[Optional[str]] = mapped_column(String(30))
    new_status: Mapped[Optional[str]] = mapped_column(String(30))
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    meta_data: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    # Relations
    job: Mapped["Job"] = relationship("Job", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")

    def __repr__(self):
        return f"<JobActivityLog(id={self.id}, job_id={self.job_id}, action='{self.action}')>"


class JobCommunication(Base):
    """Append-only operational conversation attached to an intervention.

    Communications remain writable after a field visit reaches a terminal
    status. They never mutate the workflow status themselves.
    """

    __tablename__ = "job_communications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("jobs.id"), nullable=False, index=True
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_communications.id"), nullable=True, index=True
    )
    event_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, unique=True, index=True
    )
    message_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    body: Mapped[Optional[str]] = mapped_column(Text)
    author_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    author_technician_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("technicians.id"), nullable=True, index=True
    )
    author_role: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    audience: Mapped[str] = mapped_column(String(16), nullable=False)
    requires_action: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default="open", server_default="open", nullable=False, index=True
    )
    meta_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class TechnicianSyncEvent(Base):
    """Durable receipt for an event received from the technician outbox."""

    __tablename__ = "technician_sync_events"
    __table_args__ = (
        UniqueConstraint(
            "technician_id",
            "event_id",
            name="uq_technician_sync_events_technician_event",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    technician_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("technicians.id"),
        nullable=False,
        index=True,
    )
    job_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(80))
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )


class TechnicianFieldAction(Base):
    """Append-only business record created from a technician outbox event."""

    __tablename__ = "technician_field_actions"
    __table_args__ = (
        UniqueConstraint(
            "technician_id",
            "event_id",
            name="uq_technician_field_actions_technician_event",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    technician_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("technicians.id"), nullable=False, index=True
    )
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("jobs.id"), nullable=False, index=True
    )
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class TechnicianMedia(Base):
    """Metadata for a durable technician upload stored behind MediaStorage."""

    __tablename__ = "technician_media"
    __table_args__ = (
        UniqueConstraint(
            "technician_id",
            "attachment_id",
            name="uq_technician_media_technician_attachment",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    media_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    attachment_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    technician_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("technicians.id"), nullable=False, index=True
    )
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("jobs.id"), nullable=False, index=True
    )
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    meta_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class JobSiteObservation(Base):
    """Connaissance terrain append-only, distincte du dossier préparé."""

    __tablename__ = "job_site_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("jobs.id"), nullable=False, index=True
    )
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    site_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    field_action_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("technician_field_actions.id"),
        nullable=True,
        unique=True,
    )
    observation_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[Optional[float]] = mapped_column(Float)
    label: Mapped[Optional[str]] = mapped_column(String(120))
    note: Mapped[Optional[str]] = mapped_column(Text)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    technician_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("technicians.id"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(
        String(32), default="mobile", server_default="mobile", nullable=False
    )
    resolution_status: Mapped[str] = mapped_column(
        String(16), default="unreviewed", server_default="unreviewed", nullable=False, index=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL")
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class JobAttachment(Base):
    """Document de préparation partagé par le bureau avec le terrain."""

    __tablename__ = "job_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    attachment_id: Mapped[str] = mapped_column(
        String(36), nullable=False, unique=True, index=True
    )
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("jobs.id"), nullable=False, index=True
    )
    uploaded_by_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(180))
    comment: Mapped[Optional[str]] = mapped_column(Text)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    meta_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )


class JobFailure(Base):
    """
    Enregistrement d'un échec d'intervention.
    """
    __tablename__ = "job_failures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relations
    job: Mapped["Job"] = relationship("Job", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")

    def __repr__(self):
        return f"<JobFailure(id={self.id}, job_id={self.job_id}, reason='{self.reason}')>"


class JobPostponement(Base):
    """
    Demande de report d'une intervention.
    """
    __tablename__ = "job_postponements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    visit_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("job_visits.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technician_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("technicians.id"))
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    requested_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="PENDING")
    validated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # Relations
    job: Mapped["Job"] = relationship("Job", lazy="selectin")
    technician: Mapped[Optional["Technician"]] = relationship("Technician", lazy="selectin")

    def __repr__(self):
        return f"<JobPostponement(id={self.id}, job_id={self.job_id}, status='{self.status}')>"


# =============================================================================
# NOUVEAUX MODÈLES — Centre Import/Export Professionnel
# =============================================================================


class ExportTemplate(Base):
    """
    Modèle d'export personnalisé.
    Enregistre les préférences de l'utilisateur :
    - colonnes sélectionnées et leur ordre
    - filtres par défaut
    - format d'export
    """
    __tablename__ = "export_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    export_type: Mapped[str] = mapped_column(String(20), default="excel")  # excel, csv, pdf
    columns: Mapped[dict] = mapped_column(JSONB, default=list)  # Liste ordonnée des colonnes
    filters: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)  # Filtres par défaut
    include_photos: Mapped[bool] = mapped_column(Boolean, default=False)
    include_signatures: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    creator: Mapped[Optional["User"]] = relationship("User", lazy="selectin")

    def __repr__(self):
        return f"<ExportTemplate(id={self.id}, name='{self.name}', type='{self.export_type}')>"


class ExportHistory(Base):
    """
    Historique des exports générés.
    Permet de tracer qui a exporté quoi, quand et en quel format.
    """
    __tablename__ = "export_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    template_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("export_templates.id"), nullable=True)
    export_name: Mapped[str] = mapped_column(String(200), nullable=False)
    export_format: Mapped[str] = mapped_column(String(20), nullable=False)  # excel, csv, pdf
    job_count: Mapped[int] = mapped_column(Integer, default=0)
    filters_used: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    columns_used: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    has_photos: Mapped[bool] = mapped_column(Boolean, default=False)
    has_signatures: Mapped[bool] = mapped_column(Boolean, default=False)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    file_path: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed, failed, processing
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

    # Relations
    user: Mapped[Optional["User"]] = relationship("User", lazy="selectin")
    template: Mapped[Optional["ExportTemplate"]] = relationship("ExportTemplate", lazy="selectin")

    def __repr__(self):
        return f"<ExportHistory(id={self.id}, name='{self.export_name}', format='{self.export_format}', jobs={self.job_count})>"

# =============================================================================
# APPLICATION SETTINGS — configuration métier centralisée
# =============================================================================


class ApplicationSetting(Base):
    """
    Document de configuration versionné par domaine fonctionnel.

    Exemples de namespaces futurs :
    - operational
    - interventions
    - assignment
    - stock
    - mobile
    - cartography
    - integrations
    """

    __tablename__ = "application_settings"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )
    namespace: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
    )
    schema_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    revision: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    values: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    updated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    updated_by_user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[updated_by],
        lazy="selectin",
    )

    def __repr__(self):
        return (
            "<ApplicationSetting("
            f"namespace='{self.namespace}', "
            f"schema_version={self.schema_version}, "
            f"revision={self.revision}"
            ")>"
        )
