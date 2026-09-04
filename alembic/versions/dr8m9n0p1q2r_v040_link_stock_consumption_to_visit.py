"""v040 link stock consumption history to field visits

Revision ID: dr8m9n0p1q2r
Revises: cq7l8m9n0p1q
"""

from alembic import op
import sqlalchemy as sa


revision = "dr8m9n0p1q2r"
down_revision = "cq7l8m9n0p1q"
branch_labels = None
depends_on = None


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(
        column["name"] == column_name
        for column in inspector.get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(
        index["name"] == index_name
        for index in inspector.get_indexes(table_name)
    )


def _foreign_key_exists(table_name: str, constraint_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(
        foreign_key.get("name") == constraint_name
        for foreign_key in inspector.get_foreign_keys(table_name)
    )


def _add_visit_link(table_name: str) -> None:
    index_name = f"ix_{table_name}_visit_id"
    constraint_name = f"fk_{table_name}_visit_id_job_visits"
    if not _column_exists(table_name, "visit_id"):
        op.add_column(table_name, sa.Column("visit_id", sa.Integer(), nullable=True))
    if not _foreign_key_exists(table_name, constraint_name):
        op.create_foreign_key(
            constraint_name,
            table_name,
            "job_visits",
            ["visit_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, ["visit_id"])


def _drop_visit_link(table_name: str) -> None:
    index_name = f"ix_{table_name}_visit_id"
    constraint_name = f"fk_{table_name}_visit_id_job_visits"
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)
    if _foreign_key_exists(table_name, constraint_name):
        op.drop_constraint(constraint_name, table_name, type_="foreignkey")
    if _column_exists(table_name, "visit_id"):
        op.drop_column(table_name, "visit_id")


def upgrade() -> None:
    _add_visit_link("stock_consumption")
    _add_visit_link("stock_movements")


def downgrade() -> None:
    _drop_visit_link("stock_movements")
    _drop_visit_link("stock_consumption")
