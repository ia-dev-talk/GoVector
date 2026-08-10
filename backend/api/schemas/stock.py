"""
Schémas Pydantic pour le Stock FTTH.

Conception :
- DTOs request/response orientés API.
- Pas de logique métier ici.
- Les routes déléguent au service `backend.services.stock_service.StockService`.
"""
from datetime import datetime
from math import isfinite
from typing import Optional, List
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    ValidationInfo,
    field_validator,
    model_validator,
)


# ======================== StockItem ========================
def _normalize_required_stock_item_text(
    value: object,
    field_name: str,
    max_length: int,
) -> str:
    if not isinstance(value, str):
        raise ValueError(
            f"{field_name} must be a non-empty string"
        )

    normalized = value.strip()
    if not normalized:
        raise ValueError(
            f"{field_name} must be a non-empty string"
        )
    if len(normalized) > max_length:
        raise ValueError(
            f"{field_name} must contain at most "
            f"{max_length} characters"
        )

    return normalized


def _normalize_optional_stock_item_text(
    value: object,
    field_name: str,
    max_length: int,
) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(
            f"{field_name} must be a string"
        )

    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise ValueError(
            f"{field_name} must contain at most "
            f"{max_length} characters"
        )

    return normalized


def _normalize_stock_item_price(
    value: object,
) -> Optional[float]:
    if value is None:
        return None
    if (
        isinstance(value, bool)
        or not isinstance(
            value,
            (int, float),
        )
    ):
        raise ValueError(
            "unit_price must be a finite "
            "non-negative number"
        )

    try:
        normalized = float(value)
    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        raise ValueError(
            "unit_price must be a finite "
            "non-negative number"
        )

    if (
        not isfinite(normalized)
        or normalized < 0
    ):
        raise ValueError(
            "unit_price must be a finite "
            "non-negative number"
        )

    return normalized


_STOCK_ITEM_REQUIRED_TEXT_LENGTHS = {
    "reference": 100,
    "label": 200,
    "equipment_type": 50,
    "operator": 20,
    "unit": 20,
}

_STOCK_ITEM_OPTIONAL_TEXT_LENGTHS = {
    "manufacturer": 100,
    "model": 100,
    "category": 50,
}


class StockItemBase(BaseModel):
    reference: str = Field(
        max_length=100
    )
    label: str = Field(
        max_length=200
    )
    equipment_type: str = Field(
        max_length=50
    )
    operator: str = Field(
        max_length=20
    )
    manufacturer: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    model: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    unit: str = Field(
        default="unité",
        max_length=20,
    )
    unit_price: Optional[float] = None
    category: Optional[str] = Field(
        default=None,
        max_length=50,
    )
    is_active: StrictBool = True
    min_stock_threshold: StrictInt = Field(
        default=5,
        ge=0,
    )
    alert_enabled: StrictBool = True

    @field_validator(
        "reference",
        "label",
        "equipment_type",
        "operator",
        "unit",
        mode="before",
    )
    @classmethod
    def validate_required_text(
        cls,
        value: object,
        info: ValidationInfo,
    ) -> str:
        return _normalize_required_stock_item_text(
            value,
            info.field_name,
            _STOCK_ITEM_REQUIRED_TEXT_LENGTHS[
                info.field_name
            ],
        )

    @field_validator(
        "manufacturer",
        "model",
        "category",
        mode="before",
    )
    @classmethod
    def validate_optional_text(
        cls,
        value: object,
        info: ValidationInfo,
    ) -> Optional[str]:
        return _normalize_optional_stock_item_text(
            value,
            info.field_name,
            _STOCK_ITEM_OPTIONAL_TEXT_LENGTHS[
                info.field_name
            ],
        )

    @field_validator(
        "unit_price",
        mode="before",
    )
    @classmethod
    def validate_unit_price(
        cls,
        value: object,
    ) -> Optional[float]:
        return _normalize_stock_item_price(
            value
        )


class StockItemCreate(StockItemBase):
    model_config = ConfigDict(
        extra="forbid"
    )


class StockItemUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid"
    )

    reference: str = Field(
        default=None,
        max_length=100,
    )
    label: str = Field(
        default=None,
        max_length=200,
    )
    equipment_type: str = Field(
        default=None,
        max_length=50,
    )
    operator: str = Field(
        default=None,
        max_length=20,
    )
    manufacturer: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    model: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    unit: str = Field(
        default=None,
        max_length=20,
    )
    unit_price: Optional[float] = None
    category: Optional[str] = Field(
        default=None,
        max_length=50,
    )
    is_active: StrictBool = None
    min_stock_threshold: StrictInt = Field(
        default=None,
        ge=0,
    )
    alert_enabled: StrictBool = None

    @field_validator(
        "reference",
        "label",
        "equipment_type",
        "operator",
        "unit",
        mode="before",
    )
    @classmethod
    def validate_required_text(
        cls,
        value: object,
        info: ValidationInfo,
    ) -> str:
        return _normalize_required_stock_item_text(
            value,
            info.field_name,
            _STOCK_ITEM_REQUIRED_TEXT_LENGTHS[
                info.field_name
            ],
        )

    @field_validator(
        "manufacturer",
        "model",
        "category",
        mode="before",
    )
    @classmethod
    def validate_optional_text(
        cls,
        value: object,
        info: ValidationInfo,
    ) -> Optional[str]:
        return _normalize_optional_stock_item_text(
            value,
            info.field_name,
            _STOCK_ITEM_OPTIONAL_TEXT_LENGTHS[
                info.field_name
            ],
        )

    @field_validator(
        "unit_price",
        mode="before",
    )
    @classmethod
    def validate_unit_price(
        cls,
        value: object,
    ) -> Optional[float]:
        return _normalize_stock_item_price(
            value
        )

    @field_validator(
        "is_active",
        "min_stock_threshold",
        "alert_enabled",
        mode="before",
    )
    @classmethod
    def reject_null_required_values(
        cls,
        value: object,
        info: ValidationInfo,
    ) -> object:
        if value is None:
            raise ValueError(
                f"{info.field_name} cannot be null"
            )
        return value

    @model_validator(
        mode="after"
    )
    def require_at_least_one_field(
        self,
    ) -> "StockItemUpdate":
        if not self.model_fields_set:
            raise ValueError(
                "At least one stock item field "
                "must be provided"
            )
        return self


class StockItemResponse(StockItemBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ======================== Warehouse ========================
class WarehouseBase(BaseModel):
    name: str
    code: str
    type_: str = "ENTREPOT"
    address: Optional[str] = None
    city: Optional[str] = None
    is_active: bool = True
    description: Optional[str] = None


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    type_: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class WarehouseResponse(WarehouseBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ======================== Stock line ========================
class StockResponse(BaseModel):
    id: int
    item_id: int
    warehouse_id: int
    quantity: int = 0
    reserved_quantity: int = 0
    available_quantity: int = 0
    batch_number: Optional[str] = None
    expiration_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ======================== Movements ========================
class StockMovementResponse(BaseModel):
    id: int
    item_id: int
    warehouse_id: int
    movement_type: str
    quantity: int
    quantity_before: int
    quantity_after: int
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    operator: Optional[str] = None
    job_id: Optional[int] = None
    technician_id: Optional[int] = None
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ======================== Issue ========================
class StockIssueItemCreate(BaseModel):
    item_id: int = Field(
        gt=0
    )
    quantity: int = Field(
        gt=0
    )


class StockIssueCreate(BaseModel):
    warehouse_id: int = Field(
        gt=0
    )
    technician_id: Optional[int] = Field(
        default=None,
        gt=0,
    )
    job_id: Optional[int] = Field(
        default=None,
        gt=0,
    )
    operator: Optional[str] = None
    notes: Optional[str] = None
    items: List[StockIssueItemCreate] = Field(
        min_length=1
    )


class StockIssueItemResponse(BaseModel):
    id: int
    issue_id: int
    item_id: int
    quantity: int
    quantity_delivered: int = 0

    class Config:
        from_attributes = True


class StockIssueResponse(BaseModel):
    id: int
    issue_number: str
    warehouse_id: int
    technician_id: Optional[int] = None
    job_id: Optional[int] = None
    operator: Optional[str] = None
    status: str
    issued_by: Optional[int] = None
    validated_by: Optional[int] = None
    notes: Optional[str] = None
    validated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: List[StockIssueItemResponse] = []

    class Config:
        from_attributes = True


# ======================== Return ========================
class StockReturnItemCreate(BaseModel):
    item_id: int
    quantity: int
    condition: Optional[str] = "BON_ETAT"
    serial_number: Optional[str] = None


class StockReturnCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warehouse_id: int
    technician_id: Optional[int] = None
    job_id: Optional[int] = None
    operator: Optional[str] = None
    notes: Optional[str] = None
    items: List[StockReturnItemCreate]


class StockReturnItemResponse(BaseModel):
    id: int
    return_id: int
    item_id: int
    quantity: int
    condition: Optional[str] = None
    serial_number: Optional[str] = None

    class Config:
        from_attributes = True


class StockReturnResponse(BaseModel):
    id: int
    return_number: str
    warehouse_id: int
    technician_id: Optional[int] = None
    job_id: Optional[int] = None
    operator: Optional[str] = None
    status: str
    returned_by: Optional[int] = None
    validated_by: Optional[int] = None
    notes: Optional[str] = None
    validated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: List[StockReturnItemResponse] = []

    class Config:
        from_attributes = True


# ======================== Consumption ========================
class StockConsumptionItemCreate(BaseModel):
    item_id: int
    quantity: int
    serial_number: Optional[str] = None
    mac_address: Optional[str] = None


class StockConsumptionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: Optional[int] = None
    technician_id: Optional[int] = None
    operator: Optional[str] = None
    notes: Optional[str] = None
    warehouse_id: Optional[int] = None
    items: List[StockConsumptionItemCreate]


class StockConsumptionItemResponse(BaseModel):
    id: int
    consumption_id: int
    item_id: int
    quantity: int
    serial_number: Optional[str] = None
    mac_address: Optional[str] = None

    class Config:
        from_attributes = True


class StockConsumptionResponse(BaseModel):
    id: int
    consumption_number: str
    job_id: Optional[int] = None
    technician_id: Optional[int] = None
    operator: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_by: Optional[int] = None
    validated_by: Optional[int] = None
    validated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: List[StockConsumptionItemResponse] = []

    class Config:
        from_attributes = True


# ======================== Inventory ========================
class InventoryCountItemCreate(BaseModel):
    item_id: int
    actual_quantity: int
    notes: Optional[str] = None


class InventoryCountCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    warehouse_id: int
    operator: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[InventoryCountItemCreate]] = None


class InventoryCountItemResponse(BaseModel):
    id: int
    inventory_count_id: int
    item_id: int
    theoretical_quantity: int
    actual_quantity: int
    difference: int
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class InventoryCountResponse(BaseModel):
    id: int
    count_number: str
    warehouse_id: int
    operator: Optional[str] = None
    status: str
    counted_by: Optional[int] = None
    validated_by: Optional[int] = None
    notes: Optional[str] = None
    counted_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: List[InventoryCountItemResponse] = []

    class Config:
        from_attributes = True
