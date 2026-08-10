import asyncio

from sqlalchemy import select

from database.connection import AsyncSessionLocal
from database.models import User
from auth.security import get_password_hash


async def main():
    async with AsyncSessionLocal() as db:

        result = await db.execute(
            select(User).where(
                User.username == "admin"
            )
        )

        user = result.scalar_one_or_none()

        if not user:
            print("Admin introuvable")
            return

        user.password_hash = get_password_hash(
            "admin123"
        )

        await db.commit()

        print("Password reset OK")
        print("username: admin")
        print("password: admin123")


asyncio.run(main())