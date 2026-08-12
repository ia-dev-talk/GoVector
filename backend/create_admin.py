"""Explicit administrative-account bootstrap.

This script is intentionally separate from the demo seed. It never falls back
to a known password: production/staging operators must provide credentials via
environment variables.

Example:
  BLUEVECTOR_ADMIN_USERNAME=admin \
  BLUEVECTOR_ADMIN_EMAIL=admin@example.com \
  BLUEVECTOR_ADMIN_PASSWORD='a-long-random-password' \
  python -m backend.create_admin
"""

from __future__ import annotations

import asyncio
import os

from sqlalchemy import or_, select

from backend.auth.security import get_password_hash
from backend.database.connection import AsyncSessionLocal
from backend.database.models import User, UserRole


MINIMUM_PASSWORD_LENGTH = 14


def _required(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Variable obligatoire absente : {name}")
    return value


async def main() -> None:
    username = _required("BLUEVECTOR_ADMIN_USERNAME")
    email = _required("BLUEVECTOR_ADMIN_EMAIL")
    password = _required("BLUEVECTOR_ADMIN_PASSWORD")
    if len(password) < MINIMUM_PASSWORD_LENGTH:
        raise RuntimeError(
            f"BLUEVECTOR_ADMIN_PASSWORD doit contenir au moins {MINIMUM_PASSWORD_LENGTH} caractères."
        )

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(
            select(User).where(or_(User.username == username, User.email == email))
        )
        if existing is not None:
            raise RuntimeError(
                "Un compte utilisant déjà cet identifiant ou cet email existe. "
                "Utilisez l’administration BlueVector pour gérer ses accès."
            )

        user = User(
            username=username,
            email=email,
            password_hash=get_password_hash(password),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"Compte administrateur créé : {username}")


if __name__ == "__main__":
    asyncio.run(main())
