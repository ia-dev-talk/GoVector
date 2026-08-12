"""Hierarchical GIS-ready territory registry for BlueVector V0.1.

Operational ``Sector`` records remain untouched for backward compatibility.
TerritoryNode adds the missing administrative/geographic hierarchy and may link
one node to an existing operational sector. Geometry is stored as GeoJSON so it
can travel cleanly between BlueVector, QGIS, QField and future PostGIS geometry
columns without coupling the product to one GIS client.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.models import Base


class TerritoryNode(Base):
    __tablename__ = "territory_nodes"
    __table_args__ = (
        UniqueConstraint("parent_id", "name", name="uq_territory_nodes_parent_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[Optional[str]] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(140), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), default="SECTOR", server_default="SECTOR", nullable=False, index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("territory_nodes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    legacy_sector_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("sectors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    color: Mapped[Optional[str]] = mapped_column(String(7))
    description: Mapped[Optional[str]] = mapped_column(Text)
    geometry_geojson: Mapped[Optional[dict]] = mapped_column(JSONB)
    centroid_latitude: Mapped[Optional[float]] = mapped_column(Float)
    centroid_longitude: Mapped[Optional[float]] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(32), default="manual", server_default="manual", nullable=False)
    external_id: Mapped[Optional[str]] = mapped_column(String(160), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    metadata_json: Mapped[dict] = mapped_column(
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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    parent: Mapped[Optional["TerritoryNode"]] = relationship(
        "TerritoryNode",
        remote_side="TerritoryNode.id",
        back_populates="children",
        lazy="selectin",
    )
    children: Mapped[list["TerritoryNode"]] = relationship(
        "TerritoryNode",
        back_populates="parent",
        lazy="selectin",
    )
