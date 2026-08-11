"""Administrative contracts introduced for the BlueVector V1 pilot."""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ClientOrganizationWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=50)
    operator: Optional[str] = Field(default=None, max_length=50)
    is_active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ClientOrganizationPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    operator: Optional[str] = Field(default=None, max_length=50)
    is_active: Optional[bool] = None
    metadata_json: Optional[dict[str, Any]] = None


class ClientOrganizationResponse(ClientOrganizationWrite):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClientAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=12, max_length=200)
    organization_id: int = Field(gt=0)


class ClientAccountResponse(BaseModel):
    id: int
    username: str
    email: str
    organization_id: int
    is_active: bool


class AdminAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=12, max_length=200)
    role: Literal["ADMIN", "CHEF_ORIENTEUR", "ORIENTEUR", "TECHNICIAN"]
    technician_id: Optional[int] = Field(default=None, gt=0)
    orienteur_id: Optional[int] = Field(default=None, gt=0)


class AdminAccountPatch(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=100)
    email: Optional[str] = Field(default=None, min_length=3, max_length=255)
    is_active: Optional[bool] = None


class AdminPasswordReset(BaseModel):
    password: str = Field(min_length=12, max_length=200)


class AdminAccountResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    technician_id: Optional[int]
    orienteur_id: Optional[int]
    client_organization_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class FieldTeamWrite(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, max_length=50)
    orienteur_id: int = Field(gt=0)
    sector_ids: list[int] = Field(min_length=1)
    initial_technician_id: int = Field(gt=0)
    initial_grade: str = Field(
        default="junior",
        pattern=r"^[A-Za-z][A-Za-z0-9_-]{1,47}$",
    )
    is_active: bool = True


class FieldTeamPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    code: Optional[str] = Field(default=None, max_length=50)
    orienteur_id: Optional[int] = Field(default=None, gt=0)
    sector_ids: Optional[list[int]] = Field(default=None, min_length=1)
    is_active: Optional[bool] = None


class TeamTechnicianUpdate(BaseModel):
    grade: str = Field(
        default="junior",
        pattern=r"^[A-Za-z][A-Za-z0-9_-]{1,47}$",
    )


class TeamTechnicianResponse(BaseModel):
    id: int
    name: str
    grade: str
    is_active: bool


class FieldTeamResponse(BaseModel):
    id: int
    name: str
    code: Optional[str]
    orienteur_id: int
    orienteur_name: str
    sector_ids: list[int]
    sector_names: list[str]
    technicians: list[TeamTechnicianResponse]
    is_active: bool
    created_at: datetime
    updated_at: datetime
