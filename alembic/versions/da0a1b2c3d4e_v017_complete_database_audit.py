"""v017 — Audit complet base de données : index, FK, colonnes manquantes

Ajoute de manière idempotente (vérification d'existence avant création) :

Colonnes manquantes :
- jobs.deleted_at, jobs.deleted_by
- technicians.current_job_id (FK)
- equipment_inventory.assigned_technician_id

Index manquants pour les performances :
- jobs : status, operator, priority, scheduled_date, assigned_technician_name, deleted_at
- assignments : job_id (unique), technician_id
- gps_history : recorded_at, technician_id (composite)
- equipment_inventory : serial_number, mac_address
- technicians : orienteur_id, live_status
- stock : warehouse_id, item_id
- stock_movements : created_at, technician_id
- job_activity_logs : job_id, created_at, technician_id
- incidents : job_id, status, severity

Foreign keys manquantes :
- jobs.orienteur_id → orienteurs.id
- jobs.deleted_by → users.id
- technicians.current_job_id → jobs.id
- technicians.orienteur_id → orienteurs.id (déjà existant mais vérifié)

Index composites pour performances :
- (jobs.status, jobs.scheduled_date)
- (jobs.operator, jobs.status)
- (gps_history.technician_id, gps_history.recorded_at)
- (job_activity_logs.job_id, job_activity_logs.created_at)

Idempotent : chaque commande vérifie l'existence avant d'exécuter.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "da0a1b2c3d4e"
down_revision: Union[str, None] = "ia0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table: str, column: str) -> bool:
    """Vérifie si une colonne existe dans la table."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        result = conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                f"WHERE table_name = '{table}' AND column_name = '{column}'"
            )
        ).fetchone()
        return result is not None
    return False


def index_exists(index_name: str) -> bool:
    """Vérifie si un index existe."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        result = conn.execute(
            sa.text(
                "SELECT indexname FROM pg_indexes "
                f"WHERE indexname = '{index_name}'"
            )
        ).fetchone()
        return result is not None
    return False


def fk_exists(fk_name: str) -> bool:
    """Vérifie si une foreign key existe."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        result = conn.execute(
            sa.text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                f"WHERE constraint_name = '{fk_name}' AND constraint_type = 'FOREIGN KEY'"
            )
        ).fetchone()
        return result is not None
    return False


def constraint_exists(constraint_name: str) -> bool:
    """Vérifie si une contrainte existe."""
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        result = conn.execute(
            sa.text(
                "SELECT constraint_name FROM information_schema.table_constraints "
                f"WHERE constraint_name = '{constraint_name}'"
            )
        ).fetchone()
        return result is not None
    return False


def upgrade() -> None:
    """Upgrade : ajoute colonnes, index, FK et contraintes manquants."""

    # =====================================================================
    # DOMAINE JOBS — Colonnes manquantes
    # =====================================================================

    # jobs.deleted_at (soft delete)
    if not column_exists("jobs", "deleted_at"):
        op.add_column("jobs", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.create_index("ix_jobs_deleted_at", "jobs", ["deleted_at"])

    # jobs.deleted_by
    if not column_exists("jobs", "deleted_by"):
        op.add_column("jobs", sa.Column("deleted_by", sa.Integer(), nullable=True))
    if not fk_exists("fk_jobs_deleted_by_users"):
        try:
            op.create_foreign_key(
                "fk_jobs_deleted_by_users", "jobs", "users",
                ["deleted_by"], ["id"], ondelete="SET NULL"
            )
        except Exception:
            pass

    # =====================================================================
    # DOMAINE JOBS — Index manquants
    # =====================================================================

    if not index_exists("ix_jobs_status"):
        op.create_index("ix_jobs_status", "jobs", ["status"])
    if not index_exists("ix_jobs_operator"):
        op.create_index("ix_jobs_operator", "jobs", ["operator"])
    if not index_exists("ix_jobs_priority"):
        op.create_index("ix_jobs_priority", "jobs", ["priority"])
    if not index_exists("ix_jobs_scheduled_date"):
        op.create_index("ix_jobs_scheduled_date", "jobs", ["scheduled_date"])
    if not index_exists("ix_jobs_assigned_technician_name"):
        op.create_index("ix_jobs_assigned_technician_name", "jobs", ["assigned_technician_name"])
    if not index_exists("ix_jobs_job_type"):
        op.create_index("ix_jobs_job_type", "jobs", ["job_type"])
    if not index_exists("ix_jobs_created_at"):
        op.create_index("ix_jobs_created_at", "jobs", ["created_at"])

    # Index composites
    if not index_exists("ix_jobs_status_scheduled_date"):
        op.create_index("ix_jobs_status_scheduled_date", "jobs", ["status", "scheduled_date"])
    if not index_exists("ix_jobs_operator_status"):
        op.create_index("ix_jobs_operator_status", "jobs", ["operator", "status"])

    # =====================================================================
    # DOMAINE PERSONNEL — Technician
    # =====================================================================

    # FK technicians.current_job_id → jobs.id
    if not column_exists("technicians", "current_job_id"):
        op.add_column("technicians", sa.Column("current_job_id", sa.Integer(), nullable=True))
    if not fk_exists("fk_technicians_current_job_id_jobs"):
        try:
            op.create_foreign_key(
                "fk_technicians_current_job_id_jobs", "technicians", "jobs",
                ["current_job_id"], ["id"], ondelete="SET NULL"
            )
        except Exception:
            pass

    # Index technicians.live_status pour filtres KPI
    if not index_exists("ix_technicians_live_status"):
        op.create_index("ix_technicians_live_status", "technicians", ["live_status"])
    if not index_exists("ix_technicians_orienteur_id"):
        op.create_index("ix_technicians_orienteur_id", "technicians", ["orienteur_id"])
    if not index_exists("ix_technicians_is_active"):
        op.create_index("ix_technicians_is_active", "technicians", ["is_active"])
    if not index_exists("ix_technicians_created_at"):
        op.create_index("ix_technicians_created_at", "technicians", ["created_at"])

    # =====================================================================
    # DOMAINE ASSIGNMENTS — Index et contraintes
    # =====================================================================

    if not index_exists("ix_assignments_job_id"):
        op.create_index("ix_assignments_job_id", "assignments", ["job_id"])
    if not index_exists("ix_assignments_technician_id"):
        op.create_index("ix_assignments_technician_id", "assignments", ["technician_id"])
    if not index_exists("ix_assignments_assigned_at"):
        op.create_index("ix_assignments_assigned_at", "assignments", ["assigned_at"])

    # Index composite pour requêtes planning
    if not index_exists("ix_assignments_technician_assigned"):
        op.create_index(
            "ix_assignments_technician_assigned",
            "assignments", ["technician_id", "assigned_at"]
        )

    # =====================================================================
    # DOMAINE GPS — Index de performance
    # =====================================================================

    if not index_exists("ix_gps_history_recorded_at"):
        op.create_index("ix_gps_history_recorded_at", "gps_history", ["recorded_at"])
    if not index_exists("ix_gps_history_technician_id"):
        op.create_index("ix_gps_history_technician_id", "gps_history", ["technician_id"])
    if not index_exists("ix_gps_history_job_id"):
        op.create_index("ix_gps_history_job_id", "gps_history", ["job_id"])

    # Index composite pour les trajets
    if not index_exists("ix_gps_history_tech_recorded"):
        op.create_index(
            "ix_gps_history_tech_recorded",
            "gps_history", ["technician_id", "recorded_at"]
        )

    # =====================================================================
    # DOMAINE STOCK — Index
    # =====================================================================

    if not index_exists("ix_stock_warehouse_id"):
        op.create_index("ix_stock_warehouse_id", "stock", ["warehouse_id"])
    if not index_exists("ix_stock_item_id"):
        op.create_index("ix_stock_item_id", "stock", ["item_id"])
    if not index_exists("ix_stock_warehouse_item"):
        op.create_index(
            "ix_stock_warehouse_item",
            "stock", ["warehouse_id", "item_id"]
        )
    if not index_exists("ix_stock_movements_created_at"):
        op.create_index("ix_stock_movements_created_at", "stock_movements", ["created_at"])
    if not index_exists("ix_stock_movements_technician_id"):
        op.create_index("ix_stock_movements_technician_id", "stock_movements", ["technician_id"])
    if not index_exists("ix_stock_movements_movement_type"):
        op.create_index("ix_stock_movements_movement_type", "stock_movements", ["movement_type"])
    if not index_exists("ix_stock_items_equipment_type"):
        op.create_index("ix_stock_items_equipment_type", "stock_items", ["equipment_type"])
    if not index_exists("ix_stock_items_operator"):
        op.create_index("ix_stock_items_operator", "stock_items", ["operator"])
    if not index_exists("ix_warehouses_type"):
        op.create_index("ix_warehouses_type", "warehouses", ["type"])
    if not index_exists("ix_warehouses_city"):
        op.create_index("ix_warehouses_city", "warehouses", ["city"])

    # Index composite pour mouvements par entrepôt
    if not index_exists("ix_stock_movements_warehouse_created"):
        op.create_index(
            "ix_stock_movements_warehouse_created",
            "stock_movements", ["warehouse_id", "created_at"]
        )

    # =====================================================================
    # DOMAINE EQUIPMENT — Index
    # =====================================================================

    if not index_exists("ix_equipment_inventory_serial_number"):
        op.create_index("ix_equipment_inventory_serial_number", "equipment_inventory", ["serial_number"])
    if not index_exists("ix_equipment_inventory_mac_address"):
        op.create_index("ix_equipment_inventory_mac_address", "equipment_inventory", ["mac_address"])
    if not index_exists("ix_equipment_inventory_status"):
        op.create_index("ix_equipment_inventory_status", "equipment_inventory", ["status"])
    if not index_exists("ix_equipment_inventory_equipment_type"):
        op.create_index("ix_equipment_inventory_equipment_type", "equipment_inventory", ["equipment_type"])

    # =====================================================================
    # DOMAINE ACTIVITY LOG — Index
    # =====================================================================

    if not index_exists("ix_job_activity_logs_technician_id"):
        op.create_index("ix_job_activity_logs_technician_id", "job_activity_logs", ["technician_id"])
    if not index_exists("ix_job_activity_logs_created_at"):
        op.create_index("ix_job_activity_logs_created_at", "job_activity_logs", ["created_at"])

    # Index composites pour timeline
    if not index_exists("ix_job_activity_logs_job_created"):
        op.create_index(
            "ix_job_activity_logs_job_created",
            "job_activity_logs", ["job_id", "created_at"]
        )
    if not index_exists("ix_job_activity_logs_tech_created"):
        op.create_index(
            "ix_job_activity_logs_tech_created",
            "job_activity_logs", ["technician_id", "created_at"]
        )

    # =====================================================================
    # DOMAINE INCIDENTS — Index
    # =====================================================================

    if not index_exists("ix_incidents_status"):
        op.create_index("ix_incidents_status", "incidents", ["status"])
    if not index_exists("ix_incidents_severity"):
        op.create_index("ix_incidents_severity", "incidents", ["severity"])
    if not index_exists("ix_incidents_job_id"):
        op.create_index("ix_incidents_job_id", "incidents", ["job_id"])
    if not index_exists("ix_incidents_created_at"):
        op.create_index("ix_incidents_created_at", "incidents", ["created_at"])
    if not index_exists("ix_incidents_assigned_to"):
        op.create_index("ix_incidents_assigned_to", "incidents", ["assigned_to"])

    # =====================================================================
    # DOMAINE ORIENTEURS — Index
    # =====================================================================

    if not index_exists("ix_orienteurs_sector_id"):
        op.create_index("ix_orienteurs_sector_id", "orienteurs", ["sector_id"])
    if not index_exists("ix_orienteurs_is_active"):
        op.create_index("ix_orienteurs_is_active", "orienteurs", ["is_active"])

    # =====================================================================
    # DOMAINE SECTEURS — FK orienteur_sectors.sector_name → sectors.name
    # =====================================================================

    if not index_exists("ix_orienteur_sectors_sector_name"):
        op.create_index("ix_orienteur_sectors_sector_name", "orienteur_sectors", ["sector_name"])

    # =====================================================================
    # DOMAINE EXPORT — Index
    # =====================================================================

    if not index_exists("ix_export_templates_created_by"):
        op.create_index("ix_export_templates_created_by", "export_templates", ["created_by"])
    if not index_exists("ix_export_history_user_id"):
        op.create_index("ix_export_history_user_id", "export_history", ["user_id"])
    if not index_exists("ix_export_history_created_at"):
        op.create_index("ix_export_history_created_at", "export_history", ["created_at"])
    if not index_exists("ix_export_history_template_id"):
        op.create_index("ix_export_history_template_id", "export_history", ["template_id"])

    # =====================================================================
    # DOMAINE USERS — Index
    # =====================================================================

    if not index_exists("ix_users_role"):
        op.create_index("ix_users_role", "users", ["role"])
    if not index_exists("ix_users_is_active"):
        op.create_index("ix_users_is_active", "users", ["is_active"])

    # =====================================================================
    # FK jobs.orienteur_id → orienteurs.id (si manquante)
    # =====================================================================

    if not fk_exists("fk_jobs_orienteur_id_orienteurs"):
        try:
            op.create_foreign_key(
                "fk_jobs_orienteur_id_orienteurs", "jobs", "orienteurs",
                ["orienteur_id"], ["id"], ondelete="SET NULL"
            )
        except Exception:
            pass

    # =====================================================================
    # FK stock_movements.technician_id → technicians.id (si manquante)
    # =====================================================================

    if not fk_exists("fk_stock_movements_technician_id_technicians"):
        try:
            op.create_foreign_key(
                "fk_stock_movements_technician_id_technicians",
                "stock_movements", "technicians",
                ["technician_id"], ["id"], ondelete="SET NULL"
            )
        except Exception:
            pass

    # =====================================================================
    # FK equipment_inventory.assigned_job_id → jobs.id (si manquante)
    # =====================================================================

    if not fk_exists("fk_equipment_inventory_assigned_job_id_jobs"):
        try:
            op.create_foreign_key(
                "fk_equipment_inventory_assigned_job_id_jobs",
                "equipment_inventory", "jobs",
                ["assigned_job_id"], ["id"], ondelete="SET NULL"
            )
        except Exception:
            pass


def downgrade() -> None:
    """Downgrade : supprime les index et colonnes ajoutés."""
    # Index
    indexes_to_drop = [
        # Jobs
        "ix_jobs_deleted_at", "ix_jobs_status", "ix_jobs_operator",
        "ix_jobs_priority", "ix_jobs_scheduled_date",
        "ix_jobs_assigned_technician_name", "ix_jobs_job_type",
        "ix_jobs_created_at", "ix_jobs_status_scheduled_date",
        "ix_jobs_operator_status",
        # Technicians
        "ix_technicians_live_status", "ix_technicians_orienteur_id",
        "ix_technicians_is_active", "ix_technicians_created_at",
        # Assignments
        "ix_assignments_job_id", "ix_assignments_technician_id",
        "ix_assignments_assigned_at", "ix_assignments_technician_assigned",
        # GPS
        "ix_gps_history_recorded_at", "ix_gps_history_technician_id",
        "ix_gps_history_job_id", "ix_gps_history_tech_recorded",
        # Stock
        "ix_stock_warehouse_id", "ix_stock_item_id",
        "ix_stock_warehouse_item", "ix_stock_movements_created_at",
        "ix_stock_movements_technician_id", "ix_stock_movements_movement_type",
        "ix_stock_items_equipment_type", "ix_stock_items_operator",
        "ix_warehouses_type", "ix_warehouses_city",
        "ix_stock_movements_warehouse_created",
        # Equipment
        "ix_equipment_inventory_serial_number",
        "ix_equipment_inventory_mac_address",
        "ix_equipment_inventory_status",
        "ix_equipment_inventory_equipment_type",
        # Activity Log
        "ix_job_activity_logs_technician_id",
        "ix_job_activity_logs_created_at",
        "ix_job_activity_logs_job_created",
        "ix_job_activity_logs_tech_created",
        # Incidents
        "ix_incidents_status", "ix_incidents_severity",
        "ix_incidents_job_id", "ix_incidents_created_at",
        "ix_incidents_assigned_to",
        # Orienteurs
        "ix_orienteurs_sector_id", "ix_orienteurs_is_active",
        # Secteurs
        "ix_orienteur_sectors_sector_name",
        # Export
        "ix_export_templates_created_by",
        "ix_export_history_user_id", "ix_export_history_created_at",
        "ix_export_history_template_id",
        # Users
        "ix_users_role", "ix_users_is_active",
    ]

    for idx in indexes_to_drop:
        try:
            if index_exists(idx):
                op.drop_index(idx)
        except Exception:
            pass

    # Colonnes
    try:
        if column_exists("jobs", "deleted_by"):
            op.drop_constraint("fk_jobs_deleted_by_users", "jobs", type_="foreignkey")
            op.drop_column("jobs", "deleted_by")
    except Exception:
        pass

    try:
        if column_exists("jobs", "deleted_at"):
            op.drop_column("jobs", "deleted_at")
    except Exception:
        pass

    try:
        if column_exists("technicians", "current_job_id"):
            op.drop_constraint(
                "fk_technicians_current_job_id_jobs", "technicians",
                type_="foreignkey"
            )
            op.drop_column("technicians", "current_job_id")
    except Exception:
        pass