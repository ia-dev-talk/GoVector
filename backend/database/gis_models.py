"""Versioned, auditable GIS datasets imported from KML/KMZ and other sources."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.models import Base


def _public_id() -> str:
    return uuid4().hex


class GeoImportProfile(Base):
    __tablename__ = "geo_import_profiles"
    __table_args__ = (
        UniqueConstraint(
            "client_organization_id",
            "code",
            name="uq_geo_import_profiles_org_code",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(
        String(32), unique=True, default=_public_id, nullable=False, index=True
    )
    client_organization_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("client_organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    mapping_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    style_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False, index=True
    )
    revision: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
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


class GeoDataset(Base):
    __tablename__ = "geo_datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(
        String(32), unique=True, default=_public_id, nullable=False, index=True
    )
    client_organization_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("client_organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    import_profile_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("geo_import_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_entry: Mapped[Optional[str]] = mapped_column(String(512))
    source_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(
        String(24), default="DRAFT", server_default="DRAFT", nullable=False, index=True
    )
    feature_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    bbox_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    validation_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    metadata_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    valid_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    published_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
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


class GeoLayer(Base):
    __tablename__ = "geo_layers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(
        String(32), unique=True, default=_public_id, nullable=False, index=True
    )
    dataset_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("geo_datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    folder_path: Mapped[str] = mapped_column(
        String(512), default="", server_default="", nullable=False
    )
    feature_type: Mapped[str] = mapped_column(
        String(64), default="UNCLASSIFIED", server_default="UNCLASSIFIED", nullable=False, index=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    style_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    field_schema_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    is_visible: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    is_editable: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    min_zoom: Mapped[Optional[float]] = mapped_column(Float)
    max_zoom: Mapped[Optional[float]] = mapped_column(Float)
    sort_order: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    revision: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
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


class GeoFeature(Base):
    __tablename__ = "geo_features"
    __table_args__ = (
        Index(
            "uq_geo_features_layer_external_id",
            "layer_id",
            "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(
        String(32), unique=True, default=_public_id, nullable=False, index=True
    )
    layer_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("geo_layers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    geometry_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    geometry_geojson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    bbox_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    bbox_min_longitude: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    bbox_min_latitude: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    bbox_max_longitude: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    bbox_max_latitude: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    centroid_latitude: Mapped[Optional[float]] = mapped_column(Float)
    centroid_longitude: Mapped[Optional[float]] = mapped_column(Float)
    asset_type: Mapped[str] = mapped_column(
        String(64), default="UNCLASSIFIED", server_default="UNCLASSIFIED", nullable=False, index=True
    )
    territory_node_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("territory_nodes.id", ondelete="SET NULL"), index=True
    )
    site_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="SET NULL"), index=True
    )
    nro_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("nro.id", ondelete="SET NULL"), index=True
    )
    sro_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sro.id", ondelete="SET NULL"), index=True
    )
    pbo_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pbo.id", ondelete="SET NULL"), index=True
    )
    pto_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("pto.id", ondelete="SET NULL"), index=True
    )
    job_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("jobs.id", ondelete="SET NULL"), index=True
    )
    attributes_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    style_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    provenance_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    confidence: Mapped[Optional[str]] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(
        String(24), default="ACTIVE", server_default="ACTIVE", nullable=False, index=True
    )
    revision: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
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


class GeoFeatureRevision(Base):
    __tablename__ = "geo_feature_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feature_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("geo_features.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    operation: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    revision_before: Mapped[int] = mapped_column(Integer, nullable=False)
    revision_after: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reason: Mapped[Optional[str]] = mapped_column(Text)
    before_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    after_json: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )
