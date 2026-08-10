"""Schémas Pydantic pour les secteurs."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class SectorBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = Field(default="#1F497D", pattern="^#[0-9a-fA-F]{6}$")
    description: Optional[str] = None
    is_active: bool = True


class SectorCreate(SectorBase):
    pass


class SectorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    description: Optional[str] = None
    is_active: Optional[bool] = None


class Sector(SectorBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "Secteur Est",
                "color": "#1F497D",
                "description": "Secteur Est de Casablanca",
                "is_active": True,
            }
        }


class SectorStats(BaseModel):
    sector_id: int
    sector_name: str
    color: str
    tech_count: int = 0
    orienteur_count: int = 0
    jobs_today: int = 0
    jobs_week: int = 0
    completion_rate: float = 0.0
    avg_duration: float = 0.0


class SectorStatsGlobal(BaseModel):
    total_sectors: int
    active_sectors: int
    sectors: List[SectorStats]
    total_orienteurs: int
    total_techs: int
    generated_at: Optional[datetime] = None