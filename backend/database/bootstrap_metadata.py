"""Metadata that must exist on a clean BlueVector database.

Some historical tables were introduced by Alembic before they had an ORM model.
The public-V2 clean bootstrap builds from SQLAlchemy metadata, so those tables
must be registered explicitly or a fresh installation is silently incomplete.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Table,
    UniqueConstraint,
    text,
)

from backend.database.models import Base


def register_bootstrap_metadata() -> None:
    if "technician_sectors" in Base.metadata.tables:
        return

    table = Table(
        "technician_sectors",
        Base.metadata,
        Column("id", Integer, primary_key=True, nullable=False),
        Column(
            "technician_id",
            Integer,
            ForeignKey("technicians.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column(
            "sector_id",
            Integer,
            ForeignKey("sectors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column(
            "is_primary",
            Boolean,
            nullable=False,
            server_default=text("false"),
        ),
        Column(
            "created_at",
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        ),
        UniqueConstraint(
            "technician_id",
            "sector_id",
            name="uq_technician_sectors_technician_sector",
        ),
    )
    Index("ix_technician_sectors_technician_id", table.c.technician_id)
    Index("ix_technician_sectors_sector_id", table.c.sector_id)
    Index(
        "uq_technician_sectors_primary_per_technician",
        table.c.technician_id,
        unique=True,
        postgresql_where=table.c.is_primary.is_(True),
    )
