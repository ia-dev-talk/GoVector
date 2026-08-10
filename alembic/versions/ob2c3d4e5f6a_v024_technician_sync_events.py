"""Add durable technician sync event receipts.

Revision ID: ob2c3d4e5f6a
Revises: nb1b2c3d4e5f
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "ob2c3d4e5f6a"
down_revision = "nb1b2c3d4e5f"
branch_labels = None
depends_on = None


_TABLE = "technician_sync_events"


def _create_table() -> None:
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "technician_id",
            sa.Integer(),
            sa.ForeignKey("technicians.id"),
            nullable=False,
        ),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "technician_id",
            "event_id",
            name="uq_technician_sync_events_technician_event",
        ),
    )
    op.create_index(
        "ix_technician_sync_events_user_id",
        _TABLE,
        ["user_id"],
    )
    op.create_index(
        "ix_technician_sync_events_technician_id",
        _TABLE,
        ["technician_id"],
    )
    op.create_index(
        "ix_technician_sync_events_job_id",
        _TABLE,
        ["job_id"],
    )


def _validate_existing_columns(inspector) -> dict:
    columns = {column["name"]: column for column in inspector.get_columns(_TABLE)}
    expected = {
        "id": (sa.Integer, False, None, None),
        "event_id": (sa.String, False, 36, None),
        "schema_version": (sa.Integer, False, None, None),
        "user_id": (sa.Integer, False, None, None),
        "technician_id": (sa.Integer, False, None, None),
        "job_id": (sa.Integer, False, None, None),
        "event_type": (sa.String, False, 64, None),
        "payload": (postgresql.JSONB, False, None, None),
        "occurred_at": (sa.DateTime, False, None, True),
        "request_hash": (sa.String, False, 64, None),
        "status": (sa.String, False, 20, None),
        "code": (sa.String, True, 80, None),
        "error": (sa.Text, True, None, None),
        "created_at": (sa.DateTime, False, None, True),
        "updated_at": (sa.DateTime, False, None, True),
        "processed_at": (sa.DateTime, True, None, True),
    }
    missing = sorted(set(expected) - set(columns))
    unexpected = sorted(set(columns) - set(expected))
    errors = []
    if missing:
        errors.append(f"missing columns: {', '.join(missing)}")
    if unexpected:
        errors.append(f"unexpected columns: {', '.join(unexpected)}")

    for name, (type_class, nullable, length, timezone) in expected.items():
        column = columns.get(name)
        if column is None:
            continue
        actual_type = column["type"]
        if not isinstance(actual_type, type_class):
            errors.append(
                f"{name} type is {actual_type!s}, expected {type_class.__name__}"
            )
        if column["nullable"] is not nullable:
            errors.append(
                f"{name} nullable={column['nullable']}, expected {nullable}"
            )
        if length is not None and getattr(actual_type, "length", None) != length:
            errors.append(
                f"{name} length={getattr(actual_type, 'length', None)}, "
                f"expected {length}"
            )
        if (
            timezone is not None
            and getattr(actual_type, "timezone", None) is not timezone
        ):
            errors.append(
                f"{name} timezone={getattr(actual_type, 'timezone', None)}, "
                f"expected {timezone}"
            )

    if errors:
        raise RuntimeError(
            "Existing technician_sync_events is incompatible with v024: "
            + "; ".join(errors)
        )
    return columns


def _has_columns(items: list[dict], expected: list[str]) -> bool:
    return any(item.get("column_names") == expected for item in items)


def _assert_no_rows(bind, query: str, error: str) -> None:
    if bind.execute(sa.text(query)).first() is not None:
        raise RuntimeError(error)


def _repair_existing_table(bind, inspector) -> None:
    columns = _validate_existing_columns(inspector)

    primary_key = inspector.get_pk_constraint(_TABLE)
    primary_columns = primary_key.get("constrained_columns") or []
    if primary_columns != ["id"]:
        if primary_columns:
            raise RuntimeError(
                "Existing technician_sync_events has an incompatible primary key"
            )
        _assert_no_rows(
            bind,
            f"SELECT id FROM {_TABLE} GROUP BY id HAVING COUNT(*) > 1 LIMIT 1",
            "Cannot add v024 primary key: duplicate id values exist",
        )
        op.create_primary_key("technician_sync_events_pkey", _TABLE, ["id"])

    id_default = columns["id"].get("default") or ""
    if "nextval(" not in id_default:
        if id_default:
            raise RuntimeError(
                "Existing technician_sync_events.id has an incompatible default"
            )
        op.execute(
            "CREATE SEQUENCE IF NOT EXISTS technician_sync_events_id_seq"
        )
        op.execute(
            "ALTER SEQUENCE technician_sync_events_id_seq "
            "OWNED BY technician_sync_events.id"
        )
        op.alter_column(
            _TABLE,
            "id",
            server_default=sa.text(
                "nextval('technician_sync_events_id_seq'::regclass)"
            ),
        )
        op.execute(
            "SELECT setval('technician_sync_events_id_seq', "
            "GREATEST(COALESCE((SELECT MAX(id) FROM technician_sync_events), 0), 1), "
            "COALESCE((SELECT MAX(id) FROM technician_sync_events), 0) > 0)"
        )

    unique_constraints = inspector.get_unique_constraints(_TABLE)
    unique_name = "uq_technician_sync_events_technician_event"
    named_unique = next(
        (item for item in unique_constraints if item.get("name") == unique_name),
        None,
    )
    if named_unique and named_unique.get("column_names") != [
        "technician_id",
        "event_id",
    ]:
        raise RuntimeError(
            f"Existing constraint {unique_name} has incompatible columns"
        )
    if not _has_columns(
        unique_constraints,
        ["technician_id", "event_id"],
    ):
        _assert_no_rows(
            bind,
            "SELECT technician_id, event_id FROM technician_sync_events "
            "GROUP BY technician_id, event_id HAVING COUNT(*) > 1 LIMIT 1",
            "Cannot add v024 uniqueness: duplicate technician/event pairs exist",
        )
        op.create_unique_constraint(
            unique_name,
            _TABLE,
            ["technician_id", "event_id"],
        )

    foreign_keys = inspector.get_foreign_keys(_TABLE)
    expected_foreign_keys = {
        "user_id": ("users", "id", "technician_sync_events_user_id_fkey"),
        "technician_id": (
            "technicians",
            "id",
            "technician_sync_events_technician_id_fkey",
        ),
    }
    for column, (
        target_table,
        target_column,
        constraint_name,
    ) in expected_foreign_keys.items():
        matching = [
            item
            for item in foreign_keys
            if item.get("constrained_columns") == [column]
        ]
        if matching:
            item = matching[0]
            if item.get("referred_table") != target_table or item.get(
                "referred_columns"
            ) != [target_column]:
                raise RuntimeError(
                    f"Existing foreign key on {column} is incompatible with v024"
                )
            continue
        _assert_no_rows(
            bind,
            f"SELECT event.{column} FROM {_TABLE} AS event "
            f"LEFT JOIN {target_table} AS parent "
            f"ON parent.{target_column} = event.{column} "
            f"WHERE parent.{target_column} IS NULL LIMIT 1",
            f"Cannot add v024 foreign key: orphan {column} values exist",
        )
        op.create_foreign_key(
            constraint_name,
            _TABLE,
            target_table,
            [column],
            [target_column],
        )

    indexes = {item["name"]: item for item in inspector.get_indexes(_TABLE)}
    for name, column in {
        "ix_technician_sync_events_user_id": "user_id",
        "ix_technician_sync_events_technician_id": "technician_id",
        "ix_technician_sync_events_job_id": "job_id",
    }.items():
        existing = indexes.get(name)
        if existing is not None:
            if existing.get("column_names") != [column] or existing.get("unique"):
                raise RuntimeError(f"Existing index {name} is incompatible with v024")
            continue
        op.create_index(name, _TABLE, [column])

    expected_defaults = {
        "payload": (sa.text("'{}'::jsonb"), {"'{}'::jsonb", "'{}'::json"}),
        "created_at": (sa.text("CURRENT_TIMESTAMP"), {"current_timestamp", "now()"}),
        "updated_at": (sa.text("CURRENT_TIMESTAMP"), {"current_timestamp", "now()"}),
    }
    for column, (default, accepted_values) in expected_defaults.items():
        actual_default = (columns[column].get("default") or "").lower()
        if actual_default not in accepted_values:
            op.alter_column(_TABLE, column, server_default=default)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(_TABLE):
        _create_table()
        return
    _repair_existing_table(bind, inspector)


def downgrade() -> None:
    op.drop_index(
        "ix_technician_sync_events_job_id",
        table_name="technician_sync_events",
    )
    op.drop_index(
        "ix_technician_sync_events_technician_id",
        table_name="technician_sync_events",
    )
    op.drop_index(
        "ix_technician_sync_events_user_id",
        table_name="technician_sync_events",
    )
    op.drop_table("technician_sync_events")
