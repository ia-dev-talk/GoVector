"""Bootstrap or migrate the BlueVector PostgreSQL schema.

Historical BlueVector installations pre-date the Alembic baseline revision. That
baseline intentionally contains no DDL, so replaying the legacy migration chain
against a truly empty database cannot work: early revisions expect tables that
already existed before Alembic was introduced.

For a brand-new database we therefore create the *current* authoritative schema
from SQLAlchemy metadata, then stamp Alembic at head. Existing Alembic-managed
databases continue through the normal ``upgrade head`` path.

The bootstrap is deliberately conservative: a non-empty database without an
Alembic version table is refused rather than guessed/stamped automatically.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from backend.database.connection import engine
from backend.database.models import Base


@dataclass(frozen=True)
class DatabaseState:
    tables: frozenset[str]

    @property
    def application_tables(self) -> frozenset[str]:
        return self.tables - {"alembic_version"}

    @property
    def has_alembic_version(self) -> bool:
        return "alembic_version" in self.tables

    @property
    def is_effectively_empty(self) -> bool:
        return not self.application_tables


async def _inspect_database() -> DatabaseState:
    async with engine.begin() as connection:
        tables = await connection.run_sync(
            lambda sync_connection: frozenset(
                inspect(sync_connection).get_table_names()
            )
        )
    return DatabaseState(tables=tables)


async def _create_current_schema() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


def _alembic_config() -> Config:
    return Config("alembic.ini")


def main() -> None:
    state = asyncio.run(_inspect_database())
    config = _alembic_config()

    if state.is_effectively_empty:
        print(
            "BlueVector schema bootstrap: empty database detected; "
            "creating current SQLAlchemy schema."
        )
        asyncio.run(_create_current_schema())
        command.stamp(config, "head")
        print("BlueVector schema bootstrap: schema created and stamped at Alembic head.")
        return

    if not state.has_alembic_version:
        table_preview = ", ".join(sorted(state.application_tables)[:8])
        raise RuntimeError(
            "Refusing to migrate a non-empty database without alembic_version. "
            "Restore/stamp it through the documented legacy migration procedure first. "
            f"Detected tables: {table_preview or 'unknown'}."
        )

    print("BlueVector schema bootstrap: managed database detected; upgrading to head.")
    command.upgrade(config, "head")
    print("BlueVector schema bootstrap: migration complete.")


if __name__ == "__main__":
    main()
