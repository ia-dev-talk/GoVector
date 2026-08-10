"""
Schémas Pydantic pour les Orienteurs (gestionnaires d'équipes de techniciens)
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime


class OrienteurBase(BaseModel):
    """Schéma de base pour un orienteur"""
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)


class OrienteurCreate(OrienteurBase):
    """Schéma pour créer un orienteur"""
    pass


class OrienteurUpdate(BaseModel):
    """Schéma pour mettre à jour un orienteur"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class OrienteurSectorCreate(BaseModel):
    """Schéma pour ajouter un secteur à un orienteur"""
    sector_name: str = Field(..., min_length=1, max_length=100)


class OrienteurSectorResponse(BaseModel):
    """Réponse pour un secteur d'orienteur"""
    id: int
    orienteur_id: int
    sector_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TechnicianBrief(BaseModel):
    """Informations succinctes d'un technicien pour la réponse orienteur"""
    id: int
    name: str
    status: str
    is_active: bool
    assigned_jobs: int = 0
    completed_jobs: int = 0

    model_config = ConfigDict(from_attributes=True)


class OrienteurResponse(OrienteurBase):
    """Réponse complète pour un orienteur avec ses techniciens et secteurs"""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    technicians: List[TechnicianBrief] = []
    sectors: List[OrienteurSectorResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OrienteurListResponse(OrienteurBase):
    """Réponse succincte pour la liste des orienteurs"""
    id: int
    is_active: bool
    technician_count: int = 0
    sector_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    """Réponse générique"""
    success: bool
    message: str