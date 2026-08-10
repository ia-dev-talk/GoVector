"""v020 — Seed initial FieldOpt sectors

Revision ID: ka0a1b2c3d4e
Revises: ja0a1b2c3d4e
Create Date: 2026-07-27
"""

import re
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert


revision: str = "ka0a1b2c3d4e"
down_revision: Union[str, None] = "ja0a1b2c3d4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_COLOR = "#1F497D"
_DESCRIPTION = (
    "Secteur initial FieldOpt — "
    "catalogue Casablanca et environs."
)

_INITIAL_SECTORS = (
    "Aïn Chock",
    "Aïn Sebaâ",
    "Al Fida",
    "Anfa",
    "Ben M'sik",
    "Essoukhour Assawda",
    "Hay Hassani",
    "Hay Mohammadi",
    "Maârif",
    "Mers Sultan",
    "Moulay Rachid",
    "Sbata",
    "Sidi Belyout",
    "Sidi Bernoussi",
    "Sidi Moumen",
    "Sidi Othman",
    "Aïn Harrouda",
    "Mohammedia",
    "Bouskoura",
    "Dar Bouazza",
    "Nouaceur",
    "Médiouna",
    "Tit Mellil",
    "Lahraouyine",
    "Sidi Hajjaj Oued Hassar",
    "Benslimane",
    "Berrechid",
)


def _normalize_sector_name(value: str) -> str:
    text = str(value).strip()
    if not text:
        return ""

    normalized = unicodedata.normalize(
        "NFKD",
        text,
    )
    without_accents = "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )
    folded = without_accents.casefold()
    separated = re.sub(
        r"[\W_]+",
        " ",
        folded,
        flags=re.UNICODE,
    )

    return " ".join(separated.split())


def _sector_table():
    return sa.table(
        "sectors",
        sa.column("name", sa.String(length=100)),
        sa.column("color", sa.String(length=7)),
        sa.column("description", sa.Text()),
        sa.column("is_active", sa.Boolean()),
        sa.column(
            "created_at",
            sa.DateTime(timezone=True),
        ),
        sa.column(
            "updated_at",
            sa.DateTime(timezone=True),
        ),
    )


def upgrade() -> None:
    sector_table = _sector_table()
    connection = op.get_bind()

    existing_names = connection.execute(
        sa.select(sector_table.c.name)
    ).scalars().all()
    existing_normalized = {
        _normalize_sector_name(name)
        for name in existing_names
        if _normalize_sector_name(name)
    }

    for name in _INITIAL_SECTORS:
        normalized_name = _normalize_sector_name(
            name
        )
        if normalized_name in existing_normalized:
            continue

        statement = insert(
            sector_table
        ).values(
            name=name,
            color=_DEFAULT_COLOR,
            description=_DESCRIPTION,
            is_active=True,
            created_at=sa.func.now(),
            updated_at=sa.func.now(),
        ).on_conflict_do_nothing(
            index_elements=[sector_table.c.name],
        )
        connection.execute(statement)
        existing_normalized.add(normalized_name)


def downgrade() -> None:
    """Downgrade non destructif : secteurs conservés."""
    pass
