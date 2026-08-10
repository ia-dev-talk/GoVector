"""v010 — Stock FTTH Architecture professionnelle

Création de 10 nouvelles tables pour la gestion complète du stock :
- stock_items : Catalogue des articles/références
- warehouses : Entrepôts, dépôts, véhicules
- stock : Stock physique par article/entrepôt
- stock_movements : Traçabilité de tous les mouvements
- stock_issues + stock_issue_items : Bons de sortie
- stock_returns + stock_return_items : Bons de retour
- stock_consumption + stock_consumption_items : Consommations (équipements posés)
- inventory_counts + inventory_count_items : Inventaires physiques

Ajout de 5 nouveaux énums :
- StockMovementType, StockIssueStatus, StockReturnStatus,
  StockConsumptionStatus, InventoryCountStatus

Aucune table existante n'est modifiée ni supprimée.

Revision ID: fa0a1b2c3d4e
Revises: fd0a1b2c3d4e
Create Date: 2026-07-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

revision: str = "fa0a1b2c3d4e"
down_revision: Union[str, None] = "fd0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Nouveaux types ENUM ---
    stock_movement_type = ENUM(
        "RECEPTION", "SORTIE", "RETOUR", "CONSOMMATION",
        "TRANSFERT", "INVENTAIRE", "MISE_AU_REBUT",
        name="stockmovementtype", create_type=False,
    )
    stock_issue_status = ENUM(
        "BROUILLON", "VALIDE", "ANNULE",
        name="stockissuestatus", create_type=False,
    )
    stock_return_status = ENUM(
        "BROUILLON", "VALIDE", "ANNULE",
        name="stockreturnstatus", create_type=False,
    )
    stock_consumption_status = ENUM(
        "BROUILLON", "VALIDE", "ANNULE",
        name="stockconsumptionstatus", create_type=False,
    )
    inventory_count_status = ENUM(
        "PLANIFIE", "EN_COURS", "TERMINE", "VALIDE", "ANNULE",
        name="inventorycountstatus", create_type=False,
    )

    # Créer les types ENUM dans PostgreSQL
    stock_movement_type.create(op.get_bind())
    stock_issue_status.create(op.get_bind())
    stock_return_status.create(op.get_bind())
    stock_consumption_status.create(op.get_bind())
    inventory_count_status.create(op.get_bind())

    # --- stock_items : Catalogue des articles ---
    op.create_table(
        "stock_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("reference", sa.String(100), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("equipment_type", sa.String(50), nullable=False),
        sa.Column("operator", sa.String(20), nullable=False),
        sa.Column("manufacturer", sa.String(100), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("unit", sa.String(20), server_default="unité", nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("min_stock_threshold", sa.Integer(), server_default="5", nullable=True),
        sa.Column("alert_enabled", sa.Boolean(), server_default="true", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_items_id", "stock_items", ["id"])
    op.create_index("ix_stock_items_reference", "stock_items", ["reference"], unique=True)
    op.create_index("ix_stock_items_equipment_type", "stock_items", ["equipment_type"])
    op.create_index("ix_stock_items_operator", "stock_items", ["operator"])

    # --- warehouses : Entrepôts / dépôts / véhicules ---
    op.create_table(
        "warehouses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("type", sa.String(30), server_default="ENTREPOT", nullable=True),
        sa.Column("address", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_warehouses_id", "warehouses", ["id"])
    op.create_index("ix_warehouses_name", "warehouses", ["name"], unique=True)
    op.create_index("ix_warehouses_code", "warehouses", ["code"], unique=True)

    # --- stock : Stock physique (article × entrepôt) ---
    op.create_table(
        "stock",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reserved_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("available_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("batch_number", sa.String(100), nullable=True),
        sa.Column("expiration_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_id", "stock", ["id"])
    op.create_index("ix_stock_item_id", "stock", ["item_id"])
    op.create_index("ix_stock_warehouse_id", "stock", ["warehouse_id"])

    # --- stock_movements : Traçabilité des mouvements ---
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("movement_type", stock_movement_type, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("quantity_before", sa.Integer(), nullable=False),
        sa.Column("quantity_after", sa.Integer(), nullable=False),
        sa.Column("reference_type", sa.String(50), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("operator", sa.String(20), nullable=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_movements_id", "stock_movements", ["id"])
    op.create_index("ix_stock_movements_item_id", "stock_movements", ["item_id"])
    op.create_index("ix_stock_movements_warehouse_id", "stock_movements", ["warehouse_id"])
    op.create_index("ix_stock_movements_movement_type", "stock_movements", ["movement_type"])

    # --- stock_issues : Bons de sortie ---
    op.create_table(
        "stock_issues",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("issue_number", sa.String(50), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id"), nullable=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("operator", sa.String(20), nullable=True),
        sa.Column("status", stock_issue_status, nullable=False),
        sa.Column("issued_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_issues_id", "stock_issues", ["id"])
    op.create_index("ix_stock_issues_issue_number", "stock_issues", ["issue_number"], unique=True)

    # --- stock_issue_items : Lignes de bon de sortie ---
    op.create_table(
        "stock_issue_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("stock_issues.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("quantity_delivered", sa.Integer(), server_default="0", nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_issue_items_id", "stock_issue_items", ["id"])
    op.create_index("ix_stock_issue_items_issue_id", "stock_issue_items", ["issue_id"])

    # --- stock_returns : Bons de retour ---
    op.create_table(
        "stock_returns",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("return_number", sa.String(50), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id"), nullable=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("operator", sa.String(20), nullable=True),
        sa.Column("status", stock_return_status, nullable=False),
        sa.Column("returned_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_returns_id", "stock_returns", ["id"])
    op.create_index("ix_stock_returns_return_number", "stock_returns", ["return_number"], unique=True)

    # --- stock_return_items : Lignes de bon de retour ---
    op.create_table(
        "stock_return_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("return_id", sa.Integer(), sa.ForeignKey("stock_returns.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("condition", sa.String(30), server_default="BON_ETAT", nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_return_items_id", "stock_return_items", ["id"])
    op.create_index("ix_stock_return_items_return_id", "stock_return_items", ["return_id"])

    # --- stock_consumption : Consommations (équipements posés) ---
    op.create_table(
        "stock_consumption",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("consumption_number", sa.String(50), nullable=False),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=True),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("technicians.id"), nullable=True),
        sa.Column("operator", sa.String(20), nullable=True),
        sa.Column("status", stock_consumption_status, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_consumption_id", "stock_consumption", ["id"])
    op.create_index("ix_stock_consumption_consumption_number", "stock_consumption", ["consumption_number"], unique=True)
    op.create_index("ix_stock_consumption_job_id", "stock_consumption", ["job_id"])

    # --- stock_consumption_items : Lignes de consommation ---
    op.create_table(
        "stock_consumption_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("consumption_id", sa.Integer(), sa.ForeignKey("stock_consumption.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("mac_address", sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_consumption_items_id", "stock_consumption_items", ["id"])
    op.create_index("ix_stock_consumption_items_consumption_id", "stock_consumption_items", ["consumption_id"])

    # --- inventory_counts : Inventaires physiques ---
    op.create_table(
        "inventory_counts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("count_number", sa.String(50), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("operator", sa.String(20), nullable=True),
        sa.Column("status", inventory_count_status, nullable=False),
        sa.Column("counted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("counted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_counts_id", "inventory_counts", ["id"])
    op.create_index("ix_inventory_counts_count_number", "inventory_counts", ["count_number"], unique=True)

    # --- inventory_count_items : Lignes d'inventaire ---
    op.create_table(
        "inventory_count_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("inventory_count_id", sa.Integer(), sa.ForeignKey("inventory_counts.id"), nullable=False),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("stock_items.id"), nullable=False),
        sa.Column("theoretical_quantity", sa.Integer(), nullable=False),
        sa.Column("actual_quantity", sa.Integer(), nullable=False),
        sa.Column("difference", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_count_items_id", "inventory_count_items", ["id"])
    op.create_index("ix_inventory_count_items_inventory_count_id", "inventory_count_items", ["inventory_count_id"])


def downgrade() -> None:
    """Supprime toutes les tables créées dans cette migration."""
    op.drop_table("inventory_count_items")
    op.drop_table("inventory_counts")
    op.drop_table("stock_consumption_items")
    op.drop_table("stock_consumption")
    op.drop_table("stock_return_items")
    op.drop_table("stock_returns")
    op.drop_table("stock_issue_items")
    op.drop_table("stock_issues")
    op.drop_table("stock_movements")
    op.drop_table("stock")
    op.drop_table("warehouses")
    op.drop_table("stock_items")

    # Supprimer les types ENUM
    op.execute("DROP TYPE IF EXISTS stockmovementtype")
    op.execute("DROP TYPE IF EXISTS stockissuestatus")
    op.execute("DROP TYPE IF EXISTS stockreturnstatus")
    op.execute("DROP TYPE IF EXISTS stockconsumptionstatus")
    op.execute("DROP TYPE IF EXISTS inventorycountstatus")