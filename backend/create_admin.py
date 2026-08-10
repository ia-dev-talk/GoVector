from sqlalchemy import insert

from database.connection import AsyncSessionLocal
from database.models import User, UserRole
from auth.security import get_password_hash

import asyncio
async def main():

    async with AsyncSessionLocal() as db:

        user = User(
            username="admin",
            email="admin@magillan.com",
            password_hash=get_password_hash("admin123"),
            role=UserRole.ADMIN,
            is_active=True
        )

        db.add(user)

        await db.commit()

        print("ADMIN CREATED")


asyncio.run(main())