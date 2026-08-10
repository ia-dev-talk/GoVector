"""
AUDIT COMPLET DE LA BASE DE DONNÉES
Compare les modèles SQLAlchemy avec les migrations Alembic.
Produit un rapport exhaustif de toutes les incohérences.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import inspect, MetaData, create_engine
from backend.database.models import Base
from backend.config import get_settings

settings = get_settings()
DB_URL = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql+psycopg2://", "postgresql://")

def audit_models():
    """Analyse les modèles SQLAlchemy et produit un rapport."""
    engine = create_engine(DB_URL.replace("://", "+psycopg2://", 1) if DB_URL.startswith("postgresql") else DB_URL)
    metadata = Base.metadata
    inspector = inspect(engine)

    report_lines = []
    report_lines.append("=" * 80)
    report_lines.append("AUDIT COMPLET DE LA BASE DE DONNÉES")
    report_lines.append("=" * 80)
    report_lines.append("")

    # 1. Lister toutes les tables SQLAlchemy
    orm_tables = sorted(metadata.tables.keys())
    db_tables = sorted(inspector.get_table_names())

    report_lines.append(f"Tables SQLAlchemy : {len(orm_tables)}")
    report_lines.append(f"Tables PostgreSQL   : {len(db_tables)}")
    report_lines.append("")

    # Tables dans le code mais pas en base (manquantes)
    missing_in_db = [t for t in orm_tables if t not in db_tables]
    if missing_in_db:
        report_lines.append(f"⚠️  TABLES MANQUANTES EN BASE ({len(missing_in_db)}) :")
        for t in missing_in_db:
            report_lines.append(f"   - {t}")
        report_lines.append("")

    # Tables en base mais pas dans le code (mortes)
    missing_in_code = [t for t in db_tables if t not in orm_tables]
    if missing_in_code:
        report_lines.append(f"⚠️  TABLES MORTES (en base, plus dans le code) ({len(missing_in_code)}) :")
        for t in missing_in_code:
            report_lines.append(f"   - {t}")
        report_lines.append("")

    total_issues = 0
    total_columns_added = 0
    total_fk_added = 0
    total_index_added = 0
    total_index_composite_added = 0

    # Analyse table par table
    for table_name in orm_tables:
        if table_name.startswith("alembic_"):
            continue

        table = metadata.tables[table_name]
        report_lines.append(f"\n{'─' * 70}")
        report_lines.append(f"TABLE : {table_name}")
        report_lines.append(f"{'─' * 70}")

        # Colonnes SQLAlchemy
        orm_columns = {c.name: c for c in table.columns}

        if table_name in db_tables:
            db_columns_raw = inspector.get_columns(table_name)
            db_columns = {c['name']: c for c in db_columns_raw}
            db_indexes_raw = inspector.get_indexes(table_name)
            db_indexes = {idx['name']: idx for idx in db_indexes_raw if idx['name']}
            db_fks_raw = inspector.get_foreign_keys(table_name)
            db_fks = {fk['name']: fk for fk in db_fks_raw if fk['name']}
            db_pk = inspector.get_pk_constraint(table_name)
        else:
            db_columns = {}
            db_indexes = {}
            db_fks = {}
            db_pk = {}

        # 2. Colonnes manquantes
        for col_name, orm_col in orm_columns.items():
            if col_name not in db_columns:
                col_type_str = str(orm_col.type)
                nullable = "NULL" if orm_col.nullable else "NOT NULL"
                default = f" DEFAULT {orm_col.default.arg}" if orm_col.default else ""
                report_lines.append(f"   ➕ Colonne manquante : {col_name} ({col_type_str}, {nullable}{default})")
                total_columns_added += 1

        # 3. Colonnes en base mais supprimées du code
        for col_name in db_columns:
            if col_name not in orm_columns:
                report_lines.append(f"   ⚠️  Colonne morte (en base, plus dans code) : {col_name}")

        # 4. Type mismatch
        for col_name, orm_col in orm_columns.items():
            if col_name in db_columns:
                db_col = db_columns[col_name]
                orm_type_str = str(orm_col.type).lower()
                db_type_str = str(db_col['type']).lower()
                # Comparaison simplifiée
                orm_base = orm_type_str.split("(")[0]
                db_base = db_type_str.split("(")[0]
                if orm_base != db_base and orm_base not in db_base and db_base not in orm_base:
                    if not (orm_base in ("integer", "bigint") and db_base in ("integer", "bigint")):
                        if not (orm_base in ("varchar", "character varying") and db_base in ("varchar", "character varying")):
                            report_lines.append(f"   ⚠️  Type mismatch {col_name} : ORM={orm_type_str} DB={db_type_str}")

                # Nullable mismatch
                if orm_col.nullable != db_col['nullable']:
                    report_lines.append(f"   ⚠️  Nullable mismatch {col_name} : ORM={orm_col.nullable} DB={db_col['nullable']}")

        # 5. Index manquants
        orm_indexes = {idx.name: idx for idx in table.indexes if idx.name}

        # Index ajoutés via create_index dans les migrations (on les détecte via les migrations)
        for idx_name, orm_idx in orm_indexes.items():
            if idx_name not in db_indexes:
                cols = ", ".join(c.name for c in orm_idx.columns)
                unique = " UNIQUE" if orm_idx.unique else ""
                report_lines.append(f"   ➕ Index manquant : {idx_name} ({cols}{unique})")
                if len(orm_idx.columns) > 1:
                    total_index_composite_added += 1
                else:
                    total_index_added += 1

        # 6. Index composites supplémentaires détectés par analyse des colonnes fréquemment requêtées
        # (ajout manuel dans le rapport - voir section analyse des performances)

        # 7. FK manquantes
        orm_fks = {}
        for col_name, orm_col in orm_columns.items():
            if orm_col.foreign_keys:
                for fk in orm_col.foreign_keys:
                    fk_name = fk.constraint.name if fk.constraint and fk.constraint.name else f"fk_{table_name}_{col_name}"
                    target_table = fk.column.table.name
                    target_col = fk.column.name
                    ondelete = fk.ondelete or "NO ACTION"
                    if fk_name not in db_fks:
                        report_lines.append(f"   ➕ FK manquante : {fk_name} ({table_name}.{col_name} → {target_table}.{target_col}, ON DELETE {ondelete})")
                        total_fk_added += 1

        # 8. Vérifier les FK existantes
        for fk_name, fk in db_fks.items():
            constrained = fk['constrained_columns']
            referred = fk['referred_columns']
            referred_table = fk['referred_table']
            report_lines.append(f"   ✅ FK existante : {fk_name} ({','.join(constrained)} → {referred_table}.{','.join(referred)})")

        report_lines.append(f"   📊 Bilan table {table_name} : {len(orm_columns)} colonnes ORM, {len(db_columns)} colonnes DB, {len(db_indexes)} index, {len(db_fks)} FK")

    # Rapport récapitulatif
    report_lines.append("\n" + "=" * 70)
    report_lines.append("RÉCAPITULATIF GLOBAL")
    report_lines.append("=" * 70)
    report_lines.append(f"Tables SQLAlchemy          : {len(orm_tables)}")
    report_lines.append(
        "Tables PostgreSQL          : "
        f"{len([table for table in db_tables if table != 'alembic_version'])}"
    )
    report_lines.append(f"Colonnes manquantes        : {total_columns_added}")
    report_lines.append(f"FK manquantes              : {total_fk_added}")
    report_lines.append(f"Index simples manquants    : {total_index_added}")
    report_lines.append(f"Index composites manquants : {total_index_composite_added}")
    report_lines.append(f"Problèmes totaux           : {total_columns_added + total_fk_added + total_index_added + total_index_composite_added}")
    report_lines.append("")

    return "\n".join(report_lines)


if __name__ == "__main__":
    report = audit_models()
    print(report)
