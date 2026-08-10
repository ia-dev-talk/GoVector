"""
Service métier Stock FTTH.

Responsabilités :
- Mouvements de stock (entrée, sortie, retour, consommation, perte, casse, transfert, inventaire)
- Historique des mouvements
- Bons de sortie / retour / consommation / inventaire
- Mise à jour des quantités et réservations
- Traçabilité opérateur/technicien/job

Conception :
- Pas d'appel HTTP ici : couche service pure.
- Les routes font only validation + appels service.
"""
import random
import string
from datetime import datetime
from math import isfinite
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import (
    StockItem,
    Warehouse,
    Stock,
    StockMovement,
    StockIssue,
    StockIssueItem,
    StockReturn,
    StockReturnItem,
    StockConsumption,
    StockConsumptionItem,
    InventoryCount,
    InventoryCountItem,
    User,
    Technician,
    Job,
    StockMovementType,
    StockIssueStatus,
    StockReturnStatus,
    StockConsumptionStatus,
    InventoryCountStatus,
)


class StockService:
    """Regroupe la logique métier du stock FTTH."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ #
    # Helpers publiques
    # ------------------------------------------------------------------ #

    @staticmethod
    def next_issue_number() -> str:
        return f"ISS-{datetime.utcnow().strftime('%Y%m%d')}-{''.join(random.choices(string.digits, k=6))}"

    @staticmethod
    def next_return_number() -> str:
        return f"RET-{datetime.utcnow().strftime('%Y%m%d')}-{''.join(random.choices(string.digits, k=6))}"

    @staticmethod
    def next_consumption_number() -> str:
        return f"CON-{datetime.utcnow().strftime('%Y%m%d')}-{''.join(random.choices(string.digits, k=6))}"

    @staticmethod
    def next_inventory_number() -> str:
        return f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{''.join(random.choices(string.digits, k=6))}"

    # ------------------------------------------------------------------ #
    # Catalogue / Entrepôts
    # ------------------------------------------------------------------ #

    async def get_or_create_item(
        self,
        *,
        reference: str,
        label: str,
        equipment_type: str,
        operator: str,
        manufacturer: Optional[str] = None,
        model: Optional[str] = None,
        unit: str = "unité",
        unit_price: Optional[float] = None,
        category: Optional[str] = None,
        is_active: bool = True,
        min_stock_threshold: int = 5,
        alert_enabled: bool = True,
    ) -> StockItem:
        def normalize_required_text(
            value: str,
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

        def normalize_optional_text(
            value: Optional[str],
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

        normalized_reference = normalize_required_text(
            reference,
            "reference",
            100,
        )
        normalized_label = normalize_required_text(
            label,
            "label",
            200,
        )
        normalized_equipment_type = normalize_required_text(
            equipment_type,
            "equipment_type",
            50,
        )
        normalized_operator = normalize_required_text(
            operator,
            "operator",
            20,
        )
        normalized_unit = normalize_required_text(
            unit,
            "unit",
            20,
        )
        normalized_manufacturer = normalize_optional_text(
            manufacturer,
            "manufacturer",
            100,
        )
        normalized_model = normalize_optional_text(
            model,
            "model",
            100,
        )
        normalized_category = normalize_optional_text(
            category,
            "category",
            50,
        )

        normalized_unit_price = None
        if unit_price is not None:
            if (
                isinstance(unit_price, bool)
                or not isinstance(
                    unit_price,
                    (int, float),
                )
            ):
                raise ValueError(
                    "unit_price must be a finite "
                    "non-negative number"
                )

            try:
                normalized_unit_price = float(
                    unit_price
                )
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
                not isfinite(normalized_unit_price)
                or normalized_unit_price < 0
            ):
                raise ValueError(
                    "unit_price must be a finite "
                    "non-negative number"
                )

        if (
            type(min_stock_threshold) is not int
            or min_stock_threshold < 0
        ):
            raise ValueError(
                "min_stock_threshold must be a "
                "non-negative integer"
            )

        if type(is_active) is not bool:
            raise ValueError(
                "is_active must be a boolean"
            )

        if type(alert_enabled) is not bool:
            raise ValueError(
                "alert_enabled must be a boolean"
            )

        reference_query = select(
            StockItem
        ).where(
            func.trim(
                StockItem.reference
            ) == normalized_reference
        )
        result = await self.db.execute(
            reference_query
        )
        existing_items = result.scalars().all()
        if len(existing_items) == 1:
            raise ValueError(
                "Stock item reference already exists: "
                f"{normalized_reference}"
            )
        if len(existing_items) > 1:
            raise ValueError(
                "Multiple stock items found for reference: "
                f"{normalized_reference}"
            )

        item = StockItem(
            reference=normalized_reference,
            label=normalized_label,
            equipment_type=normalized_equipment_type,
            operator=normalized_operator,
            manufacturer=normalized_manufacturer,
            model=normalized_model,
            unit=normalized_unit,
            unit_price=normalized_unit_price,
            category=normalized_category,
            is_active=is_active,
            min_stock_threshold=min_stock_threshold,
            alert_enabled=alert_enabled,
        )
        self.db.add(item)
        try:
            await self.db.flush()
        except IntegrityError as integrity_error:
            await self.db.rollback()
            retry_result = await self.db.execute(
                reference_query
            )
            if retry_result.scalars().all():
                raise ValueError(
                    "Stock item reference already exists: "
                    f"{normalized_reference}"
                ) from integrity_error
            raise

        return item

    async def get_or_create_warehouse(
        self,
        *,
        name: str,
        code: str,
        type_: str = "ENTREPOT",
        address: Optional[str] = None,
        city: Optional[str] = None,
        is_active: bool = True,
        description: Optional[str] = None,
    ) -> Warehouse:
        result = await self.db.execute(select(Warehouse).where(Warehouse.name == name))
        wh = result.scalar_one_or_none()
        if wh:
            return wh
        wh = Warehouse(
            name=name,
            code=code,
            type=type_,
            address=address,
            city=city,
            is_active=is_active,
            description=description,
        )
        self.db.add(wh)
        await self.db.flush()
        return wh

    async def get_stock_line(self, item_id: int, warehouse_id: int) -> Optional[Stock]:
        result = await self.db.execute(
            select(Stock).where(Stock.item_id == item_id, Stock.warehouse_id == warehouse_id)
        )
        return result.scalar_one_or_none()

    async def ensure_stock_line(self, item_id: int, warehouse_id: int) -> Stock:
        line = await self.get_stock_line(item_id, warehouse_id)
        if line:
            return line
        line = Stock(
            item_id=item_id,
            warehouse_id=warehouse_id,
            quantity=0,
            reserved_quantity=0,
            available_quantity=0,
        )
        self.db.add(line)
        await self.db.flush()
        return line

    async def add_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int = 1,
        batch_number: Optional[str] = None,
        expiration_date: Optional[datetime] = None,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        notes: Optional[str] = None,
        reference_type: str = "reception",
        reference_id: Optional[int] = None,
    ) -> Stock:
        """Applique une entrée de stock et crée le mouvement."""
        try:
            if (
                type(item_id) is not int
                or item_id <= 0
            ):
                raise ValueError(
                    "item_id must be a positive integer"
                )

            if (
                type(warehouse_id) is not int
                or warehouse_id <= 0
            ):
                raise ValueError(
                    "warehouse_id must be a positive integer"
                )

            if (
                type(quantity) is not int
                or quantity <= 0
            ):
                raise ValueError(
                    "quantity must be a positive integer for stock addition"
                )

            optional_identifiers = (
                ("job_id", job_id),
                (
                    "technician_id",
                    technician_id,
                ),
                ("created_by", created_by),
                ("reference_id", reference_id),
            )
            for field_name, value in optional_identifiers:
                if (
                    value is not None
                    and (
                        type(value) is not int
                        or value <= 0
                    )
                ):
                    raise ValueError(
                        f"{field_name} must be a positive integer"
                    )

            if batch_number is not None:
                if (
                    not isinstance(
                        batch_number,
                        str,
                    )
                    or batch_number.strip()
                ):
                    raise ValueError(
                        "batch_number is not supported for stock reception"
                    )
                batch_number = None

            if expiration_date is not None:
                raise ValueError(
                    "expiration_date is not supported for stock reception"
                )

            if (
                not isinstance(
                    reference_type,
                    str,
                )
                or not reference_type.strip()
            ):
                raise ValueError(
                    "reference_type must be a non-empty string"
                )
            normalized_reference_type = (
                reference_type.strip()
            )

            item_result = await self.db.execute(
                select(StockItem).where(
                    StockItem.id == item_id
                )
            )
            stock_item = (
                item_result.scalar_one_or_none()
            )
            if stock_item is None:
                raise ValueError(
                    f"Stock item not found: {item_id}"
                )

            warehouse_result = await self.db.execute(
                select(Warehouse)
                .where(
                    Warehouse.id ==
                    warehouse_id
                )
                .with_for_update()
            )
            warehouse = (
                warehouse_result.scalar_one_or_none()
            )
            if warehouse is None:
                raise ValueError(
                    f"Warehouse not found: {warehouse_id}"
                )

            if job_id is not None:
                job_result = await self.db.execute(
                    select(Job).where(
                        Job.id == job_id
                    )
                )
                if (
                    job_result.scalar_one_or_none()
                    is None
                ):
                    raise ValueError(
                        f"Job not found: {job_id}"
                    )

            if technician_id is not None:
                technician_result = (
                    await self.db.execute(
                        select(Technician).where(
                            Technician.id ==
                            technician_id
                        )
                    )
                )
                if (
                    technician_result.scalar_one_or_none()
                    is None
                ):
                    raise ValueError(
                        "Technician not found: "
                        f"{technician_id}"
                    )

            if created_by is not None:
                user_result = await self.db.execute(
                    select(User).where(
                        User.id == created_by
                    )
                )
                if (
                    user_result.scalar_one_or_none()
                    is None
                ):
                    raise ValueError(
                        f"User not found: {created_by}"
                    )

            stock_result = await self.db.execute(
                select(Stock)
                .where(
                    Stock.item_id == item_id,
                    Stock.warehouse_id ==
                    warehouse_id,
                    Stock.batch_number.is_(None),
                )
                .with_for_update()
            )
            stock_lines = (
                stock_result.scalars().all()
            )

            if len(stock_lines) > 1:
                raise ValueError(
                    "Multiple stock lines found for "
                    f"item {item_id} in warehouse "
                    f"{warehouse_id}"
                )

            if stock_lines:
                line = stock_lines[0]
            else:
                line = Stock(
                    item_id=item_id,
                    warehouse_id=warehouse_id,
                    quantity=0,
                    reserved_quantity=0,
                    available_quantity=0,
                    batch_number=None,
                )
                self.db.add(line)

            quantity_fields = (
                ("quantity", line.quantity),
                (
                    "reserved_quantity",
                    line.reserved_quantity,
                ),
                (
                    "available_quantity",
                    line.available_quantity,
                ),
            )
            for field_name, value in quantity_fields:
                if (
                    type(value) is not int
                    or value < 0
                ):
                    raise ValueError(
                        "Invalid stock "
                        f"{field_name} for item "
                        f"{item_id} in warehouse "
                        f"{warehouse_id}"
                    )

            if (
                line.available_quantity +
                line.reserved_quantity !=
                line.quantity
            ):
                raise ValueError(
                    "Inconsistent stock quantities for "
                    f"item {item_id} in warehouse "
                    f"{warehouse_id}"
                )

            before = line.quantity
            line.quantity = (
                line.quantity + quantity
            )
            line.available_quantity = (
                line.available_quantity +
                quantity
            )

            movement = StockMovement(
                item_id=item_id,
                warehouse_id=warehouse_id,
                movement_type=
                    StockMovementType.RECEPTION,
                quantity=quantity,
                quantity_before=before,
                quantity_after=line.quantity,
                reference_type=
                    normalized_reference_type,
                reference_id=reference_id,
                operator=operator,
                job_id=job_id,
                technician_id=technician_id,
                notes=notes,
                created_by=created_by,
            )
            self.db.add(movement)
            await self.db.flush()
            return line
        except Exception:
            await self.db.rollback()
            raise

    async def reserve_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int = 1,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        notes: Optional[str] = None,
        reference_type: str = "reservation",
        reference_id: Optional[int] = None,
    ) -> Stock:
        if quantity <= 0:
            raise ValueError("quantity must be positive for reservation")

        line = await self.ensure_stock_line(item_id, warehouse_id)
        before = line.quantity
        if line.available_quantity < quantity:
            raise ValueError("Insufficient available stock")

        line.reserved_quantity = line.reserved_quantity + quantity
        line.available_quantity = line.available_quantity - quantity
        await self.db.flush()

        movement = StockMovement(
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type=StockMovementType.SORTIE,
            quantity=-quantity,
            quantity_before=before,
            quantity_after=line.quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            operator=operator,
            job_id=job_id,
            technician_id=technician_id,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(movement)
        await self.db.flush()
        return line

    async def consume_reserved_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int = 1,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        notes: Optional[str] = None,
        reference_type: str = "consumption",
        reference_id: Optional[int] = None,
    ) -> Stock:
        if quantity <= 0:
            raise ValueError("quantity must be positive for consumption")

        line = await self.ensure_stock_line(item_id, warehouse_id)
        before = line.quantity
        if line.reserved_quantity < quantity:
            raise ValueError("Insufficient reserved stock")

        line.reserved_quantity = line.reserved_quantity - quantity
        line.quantity = line.quantity - quantity
        await self.db.flush()

        movement = StockMovement(
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type=StockMovementType.CONSOMMATION,
            quantity=-quantity,
            quantity_before=before,
            quantity_after=line.quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            operator=operator,
            job_id=job_id,
            technician_id=technician_id,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(movement)
        await self.db.flush()
        return line

    async def return_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int = 1,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        notes: Optional[str] = None,
        reference_type: str = "return",
        reference_id: Optional[int] = None,
    ) -> Stock:
        if quantity <= 0:
            raise ValueError("quantity must be positive for return")

        line = await self.ensure_stock_line(item_id, warehouse_id)
        before = line.quantity
        line.quantity = before + quantity
        line.available_quantity = line.available_quantity + quantity
        await self.db.flush()

        movement = StockMovement(
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type=StockMovementType.RETOUR,
            quantity=quantity,
            quantity_before=before,
            quantity_after=line.quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            operator=operator,
            job_id=job_id,
            technician_id=technician_id,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(movement)
        await self.db.flush()
        return line

    async def write_off_stock(
        self,
        *,
        item_id: int,
        warehouse_id: int,
        quantity: int = 1,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        notes: Optional[str] = None,
        reference_type: str = "writeoff",
        reference_id: Optional[int] = None,
    ) -> Stock:
        if quantity <= 0:
            raise ValueError("quantity must be positive for write-off")

        line = await self.ensure_stock_line(item_id, warehouse_id)
        before = line.quantity
        if line.quantity < quantity:
            raise ValueError("Insufficient stock for write-off")

        line.quantity = line.quantity - quantity
        await self.db.flush()

        movement = StockMovement(
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type=StockMovementType.MISE_AU_REBUT,
            quantity=-quantity,
            quantity_before=before,
            quantity_after=line.quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            operator=operator,
            job_id=job_id,
            technician_id=technician_id,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(movement)
        await self.db.flush()
        return line

    async def transfer_stock(
        self,
        *,
        item_id: int,
        from_warehouse_id: int,
        to_warehouse_id: int,
        quantity: int = 1,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        notes: Optional[str] = None,
    ) -> Stock:
        if quantity <= 0:
            raise ValueError("quantity must be positive for transfer")
        if from_warehouse_id == to_warehouse_id:
            raise ValueError("Warehouses must differ for transfer")

        source = await self.ensure_stock_line(item_id, from_warehouse_id)
        before_source = source.quantity
        if source.available_quantity < quantity:
            raise ValueError("Insufficient available stock in source warehouse")

        source.quantity = before_source - quantity
        source.available_quantity = source.available_quantity - quantity
        await self.db.flush()

        dest = await self.ensure_stock_line(item_id, to_warehouse_id)
        before_dest = dest.quantity
        dest.quantity = before_dest + quantity
        dest.available_quantity = dest.available_quantity + quantity
        await self.db.flush()

        movement = StockMovement(
            item_id=item_id,
            warehouse_id=from_warehouse_id,
            movement_type=StockMovementType.TRANSFERT,
            quantity=-quantity,
            quantity_before=before_source,
            quantity_after=source.quantity,
            reference_type="transfer",
            reference_id=None,
            operator=operator,
            job_id=job_id,
            technician_id=technician_id,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(movement)
        await self.db.flush()
        return dest

    # ------------------------------------------------------------------ #
    # Documents de stock
    # ------------------------------------------------------------------ #

    async def create_issue(
        self,
        *,
        warehouse_id: int,
        technician_id: Optional[int] = None,
        job_id: Optional[int] = None,
        operator: Optional[str] = None,
        notes: Optional[str] = None,
        issued_by: Optional[int] = None,
        items: list[dict],
    ) -> StockIssue:
        if not items:
            raise ValueError(
                "Issue must contain at least one item"
            )

        normalized_items = []
        seen_item_ids = set()

        for item in items:
            if not isinstance(item, dict):
                raise ValueError(
                    "issue item must be an object"
                )

            raw_item_id = item.get("item_id")
            if (
                isinstance(
                    raw_item_id,
                    bool,
                )
                or not isinstance(
                    raw_item_id,
                    (
                        int,
                        str,
                    ),
                )
            ):
                raise ValueError(
                    "issue item_id must be a positive integer"
                )

            if (
                isinstance(
                    raw_item_id,
                    str,
                )
                and not raw_item_id.strip()
            ):
                raise ValueError(
                    "issue item_id must be a positive integer"
                )

            try:
                item_id = int(raw_item_id)
            except (
                TypeError,
                ValueError,
                OverflowError,
            ):
                raise ValueError(
                    "issue item_id must be a positive integer"
                )

            if item_id <= 0:
                raise ValueError(
                    "issue item_id must be a positive integer"
                )

            raw_quantity = item.get(
                "quantity",
                0,
            )
            if (
                isinstance(
                    raw_quantity,
                    bool,
                )
                or not isinstance(
                    raw_quantity,
                    (
                        int,
                        str,
                    ),
                )
            ):
                raise ValueError(
                    "issue item quantity must be positive"
                )

            if (
                isinstance(
                    raw_quantity,
                    str,
                )
                and not raw_quantity.strip()
            ):
                raise ValueError(
                    "issue item quantity must be positive"
                )

            try:
                quantity = int(raw_quantity)
            except (
                TypeError,
                ValueError,
                OverflowError,
            ):
                raise ValueError(
                    "issue item quantity must be positive"
                )

            if quantity <= 0:
                raise ValueError(
                    "issue item quantity must be positive"
                )

            if item_id in seen_item_ids:
                raise ValueError(
                    f"Duplicate issue item_id: {item_id}"
                )

            seen_item_ids.add(item_id)
            normalized_items.append(
                (
                    item_id,
                    quantity,
                )
            )

        issue_number = self.next_issue_number()
        issue = StockIssue(
            issue_number=issue_number,
            warehouse_id=warehouse_id,
            technician_id=technician_id,
            job_id=job_id,
            operator=operator,
            status=StockIssueStatus.BROUILLON,
            notes=notes,
            issued_by=issued_by,
        )
        self.db.add(issue)
        await self.db.flush()

        for (
            item_id,
            quantity,
        ) in normalized_items:
            issue_item = StockIssueItem(
                issue_id=issue.id,
                item_id=item_id,
                quantity=quantity,
                quantity_delivered=0,
            )
            self.db.add(issue_item)

        await self.db.flush()
        return issue

    async def validate_issue(
        self,
        issue_id: int,
        *,
        validated_by: Optional[int] = None,
        delivered_by: Optional[dict] = None,
    ) -> StockIssue:
        try:
            result = await self.db.execute(
                select(StockIssue)
                .where(
                    StockIssue.id ==
                    issue_id
                )
                .with_for_update()
            )
            issue = result.scalar_one_or_none()
            if not issue:
                raise ValueError(
                    "Issue not found"
                )
            if (
                issue.status ==
                StockIssueStatus.VALIDE
            ):
                return issue
            if (
                issue.status !=
                StockIssueStatus.BROUILLON
            ):
                raise ValueError(
                    "Only a draft issue can be validated"
                )

            items_result = await self.db.execute(
                select(StockIssueItem)
                .where(
                    StockIssueItem.issue_id ==
                    issue_id
                )
            )
            items = items_result.scalars().all()
            if not items:
                raise ValueError(
                    "Issue must contain at least one item"
                )

            seen_item_ids = set()

            for item in items:
                if (
                    isinstance(
                        item.item_id,
                        bool,
                    )
                    or not isinstance(
                        item.item_id,
                        int,
                    )
                    or item.item_id <= 0
                ):
                    raise ValueError(
                        "issue item_id must be a positive integer"
                    )
                if item.item_id in seen_item_ids:
                    raise ValueError(
                        f"Duplicate issue item_id: "
                        f"{item.item_id}"
                    )
                seen_item_ids.add(
                    item.item_id
                )

                if (
                    isinstance(
                        item.quantity,
                        bool,
                    )
                    or not isinstance(
                        item.quantity,
                        int,
                    )
                    or item.quantity <= 0
                ):
                    raise ValueError(
                        "issue item quantity must be positive"
                    )

            ordered_items = sorted(
                items,
                key=lambda item: (
                    item.item_id,
                    item.id,
                ),
            )

            validated_lines = []

            for item in ordered_items:
                line_result = await self.db.execute(
                    select(Stock)
                    .where(
                        Stock.item_id ==
                        item.item_id,
                        Stock.warehouse_id ==
                        issue.warehouse_id,
                    )
                    .with_for_update()
                )
                line = (
                    line_result
                    .scalar_one_or_none()
                )
                if line is None:
                    raise ValueError(
                        "Stock line not found for "
                        f"item {item.item_id} "
                        "in warehouse "
                        f"{issue.warehouse_id}"
                    )
                if (
                    line.available_quantity
                    is None
                    or line.available_quantity < 0
                ):
                    raise ValueError(
                        "Invalid available stock for "
                        f"item {item.item_id}"
                    )
                if (
                    line.available_quantity <
                    item.quantity
                ):
                    raise ValueError(
                        "Insufficient available stock"
                    )

                validated_lines.append(
                    (
                        item,
                        line,
                    )
                )

            for (
                item,
                line,
            ) in validated_lines:
                before = line.quantity
                line.reserved_quantity = (
                    line.reserved_quantity +
                    item.quantity
                )
                line.available_quantity = (
                    line.available_quantity -
                    item.quantity
                )
                item.quantity_delivered = (
                    item.quantity
                )

                movement = StockMovement(
                    item_id=item.item_id,
                    warehouse_id=
                        issue.warehouse_id,
                    movement_type=
                        StockMovementType.SORTIE,
                    quantity=-item.quantity,
                    quantity_before=before,
                    quantity_after=
                        line.quantity,
                    reference_type="issue",
                    reference_id=issue.id,
                    operator=issue.operator,
                    job_id=issue.job_id,
                    technician_id=
                        issue.technician_id,
                    notes=issue.notes,
                    created_by=issue.issued_by,
                )
                self.db.add(movement)

            issue.status = (
                StockIssueStatus.VALIDE
            )
            issue.validated_by = validated_by
            issue.validated_at = (
                datetime.utcnow()
            )

            await self.db.flush()
            return issue
        except Exception:
            await self.db.rollback()
            raise

    async def create_return(
        self,
        *,
        warehouse_id: int,
        technician_id: Optional[int] = None,
        job_id: Optional[int] = None,
        operator: Optional[str] = None,
        notes: Optional[str] = None,
        returned_by: Optional[int] = None,
        items: list[dict],
    ) -> StockReturn:
        return_number = self.next_return_number()
        ret = StockReturn(
            return_number=return_number,
            warehouse_id=warehouse_id,
            technician_id=technician_id,
            job_id=job_id,
            operator=operator,
            status=StockReturnStatus.BROUILLON,
            notes=notes,
            returned_by=returned_by,
        )
        self.db.add(ret)
        await self.db.flush()

        for it in items:
            item_id = it.get("item_id")
            quantity = int(it.get("quantity", 0))
            condition = it.get("condition", "BON_ETAT")
            serial_number = it.get("serial_number")
            if quantity <= 0:
                raise ValueError("return item quantity must be positive")
            if item_id is None:
                raise ValueError("return item_id is required")
            ret_item = StockReturnItem(
                return_id=ret.id,
                item_id=item_id,
                quantity=quantity,
                condition=condition,
                serial_number=serial_number,
            )
            self.db.add(ret_item)

        await self.db.flush()
        return ret

    async def validate_return(
        self,
        return_id: int,
        *,
        validated_by: Optional[int] = None,
    ) -> StockReturn:
        result = await self.db.execute(select(StockReturn).where(StockReturn.id == return_id))
        ret = result.scalar_one_or_none()
        if not ret:
            raise ValueError("Return not found")
        if ret.status == StockReturnStatus.VALIDE:
            return ret

        ret.status = StockReturnStatus.VALIDE
        ret.validated_by = validated_by
        ret.validated_at = datetime.utcnow()

        items_result = await self.db.execute(
            select(StockReturnItem).where(StockReturnItem.return_id == return_id)
        )
        for it in items_result.scalars().all():
            await self.return_stock(
                item_id=it.item_id,
                warehouse_id=ret.warehouse_id,
                quantity=it.quantity,
                operator=ret.operator,
                job_id=ret.job_id,
                technician_id=ret.technician_id,
                created_by=ret.returned_by,
                notes=ret.notes,
                reference_type="return",
                reference_id=ret.id,
            )

        await self.db.flush()
        return ret

    async def create_consumption(
        self,
        *,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        operator: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: Optional[int] = None,
        warehouse_id: Optional[int] = None,
        items: list[dict],
    ) -> StockConsumption:
        consumption_number = self.next_consumption_number()
        consumption = StockConsumption(
            consumption_number=consumption_number,
            job_id=job_id,
            technician_id=technician_id,
            operator=operator,
            status=StockConsumptionStatus.BROUILLON,
            notes=notes,
            created_by=created_by,
        )
        self.db.add(consumption)
        await self.db.flush()

        if warehouse_id is None and technician_id:
            tech_result = await self.db.execute(
                select(Technician).where(Technician.id == technician_id)
            )
            tech = tech_result.scalar_one_or_none()
            warehouse_id = None

        for it in items:
            item_id = it.get("item_id")
            quantity = int(it.get("quantity", 0))
            serial_number = it.get("serial_number")
            mac_address = it.get("mac_address")
            if quantity <= 0:
                raise ValueError("consumption item quantity must be positive")
            if item_id is None:
                raise ValueError("consumption item_id is required")
            c_item = StockConsumptionItem(
                consumption_id=consumption.id,
                item_id=item_id,
                quantity=quantity,
                serial_number=serial_number,
                mac_address=mac_address,
            )
            self.db.add(c_item)

        await self.db.flush()
        return consumption

    async def validate_consumption(
        self,
        consumption_id: int,
        *,
        validated_by: Optional[int] = None,
        warehouse_id: Optional[int] = None,
    ) -> StockConsumption:
        result = await self.db.execute(
            select(StockConsumption).where(StockConsumption.id == consumption_id)
        )
        consumption = result.scalar_one_or_none()
        if not consumption:
            raise ValueError("Consumption not found")
        if consumption.status == StockConsumptionStatus.VALIDE:
            return consumption

        tech_id = consumption.technician_id
        if warehouse_id is None and tech_id:
            wh_result = await self.db.execute(
                select(Warehouse).where(
                    Warehouse.name.ilike("%technicien%"),
                    Warehouse.is_active == True,
                )
            )
            wh = wh_result.scalars().first()
            warehouse_id = wh.id if wh else None

        consumption.status = StockConsumptionStatus.VALIDE
        consumption.validated_by = validated_by
        consumption.validated_at = datetime.utcnow()

        items_result = await self.db.execute(
            select(StockConsumptionItem).where(StockConsumptionItem.consumption_id == consumption_id)
        )
        for it in items_result.scalars().all():
            target_wh = warehouse_id
            await self.consume_reserved_stock(
                item_id=it.item_id,
                warehouse_id=target_wh,
                quantity=it.quantity,
                operator=consumption.operator,
                job_id=consumption.job_id,
                technician_id=consumption.technician_id,
                created_by=consumption.created_by,
                notes=consumption.notes,
                reference_type="consumption",
                reference_id=consumption.id,
            )

        await self.db.flush()
        return consumption

    async def create_inventory(
        self,
        *,
        warehouse_id: int,
        operator: Optional[str] = None,
        notes: Optional[str] = None,
        counted_by: Optional[int] = None,
        items: Optional[list[dict]] = None,
    ) -> InventoryCount:
        count_number = self.next_inventory_number()
        inv = InventoryCount(
            count_number=count_number,
            warehouse_id=warehouse_id,
            operator=operator,
            status=InventoryCountStatus.PLANIFIE,
            notes=notes,
            counted_by=counted_by,
        )
        self.db.add(inv)
        await self.db.flush()

        if items:
            stock_rows = await self.db.execute(
                select(Stock).where(Stock.warehouse_id == warehouse_id)
            )
            stock_by_item = {s.item_id: s for s in stock_rows.scalars().all()}

            seen = set()
            for it in items:
                item_id = it.get("item_id")
                actual = int(it.get("actual_quantity", 0))
                if item_id is None:
                    continue
                seen.add(item_id)
                theoretical = stock_by_item[item_id].quantity if item_id in stock_by_item else 0
                diff = actual - theoretical
                count_item = InventoryCountItem(
                    inventory_count_id=inv.id,
                    item_id=item_id,
                    theoretical_quantity=theoretical,
                    actual_quantity=actual,
                    difference=diff,
                    notes=it.get("notes"),
                )
                self.db.add(count_item)

            for item_id, stock_row in stock_by_item.items():
                if item_id in seen:
                    continue
                count_item = InventoryCountItem(
                    inventory_count_id=inv.id,
                    item_id=item_id,
                    theoretical_quantity=stock_row.quantity,
                    actual_quantity=0,
                    difference=-stock_row.quantity,
                    notes="non compté",
                )
                self.db.add(count_item)

        await self.db.flush()
        return inv

    async def validate_inventory(
        self,
        inventory_count_id: int,
        *,
        validated_by: Optional[int] = None,
        apply_adjustments: bool = False,
    ) -> InventoryCount:
        result = await self.db.execute(
            select(InventoryCount).where(InventoryCount.id == inventory_count_id)
        )
        inv = result.scalar_one_or_none()
        if not inv:
            raise ValueError("Inventory count not found")
        if inv.status == InventoryCountStatus.VALIDE:
            return inv

        inv.status = InventoryCountStatus.VALIDE
        inv.validated_by = validated_by
        inv.validated_at = datetime.utcnow()

        if apply_adjustments:
            items_result = await self.db.execute(
                select(InventoryCountItem).where(
                    InventoryCountItem.inventory_count_id == inventory_count_id
                )
            )
            for it in items_result.scalars().all():
                line = await self.get_stock_line(it.item_id, inv.warehouse_id)
                if not line:
                    line = await self.ensure_stock_line(it.item_id, inv.warehouse_id)
                old_qty = line.quantity
                new_qty = it.actual_quantity
                if new_qty < 0:
                    new_qty = 0
                delta = new_qty - old_qty
                line.quantity = new_qty
                line.available_quantity = max(0, line.available_quantity + delta)
                await self.db.flush()

                if delta != 0:
                    movement = StockMovement(
                        item_id=it.item_id,
                        warehouse_id=inv.warehouse_id,
                        movement_type=StockMovementType.INVENTAIRE,
                        quantity=delta,
                        quantity_before=old_qty,
                        quantity_after=new_qty,
                        reference_type="inventory",
                        reference_id=inv.id,
                        notes="ajustement inventaire",
                    )
                    self.db.add(movement)
                    await self.db.flush()

        await self.db.flush()
        return inv

    # ------------------------------------------------------------------ #
    # Historique / consulting
    # ------------------------------------------------------------------ #

    async def get_movements(
        self,
        *,
        item_id: Optional[int] = None,
        warehouse_id: Optional[int] = None,
        movement_type: Optional[StockMovementType] = None,
        operator: Optional[str] = None,
        job_id: Optional[int] = None,
        technician_id: Optional[int] = None,
        created_by: Optional[int] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
    ):
        q = select(StockMovement).order_by(StockMovement.created_at.desc())
        if item_id is not None:
            q = q.where(StockMovement.item_id == item_id)
        if warehouse_id is not None:
            q = q.where(StockMovement.warehouse_id == warehouse_id)
        if movement_type is not None:
            q = q.where(StockMovement.movement_type == movement_type)
        if operator is not None:
            q = q.where(StockMovement.operator == operator)
        if job_id is not None:
            q = q.where(StockMovement.job_id == job_id)
        if technician_id is not None:
            q = q.where(StockMovement.technician_id == technician_id)
        if created_by is not None:
            q = q.where(StockMovement.created_by == created_by)
        if from_date is not None:
            q = q.where(StockMovement.created_at >= from_date)
        if to_date is not None:
            q = q.where(StockMovement.created_at <= to_date)

        result = await self.db.execute(q)
        return result.scalars().all()
