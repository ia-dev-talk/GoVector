import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from database.models import Technician, Job, User, Orienteur
from sqlalchemy import select, func
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./fieldopt.db")

# Fix for SQLite async
if DATABASE_URL.startswith("sqlite:///"):
    DATABASE_URL = DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

async def check():
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        tc = (await db.execute(select(func.count(Technician.id)))).scalar_one()
        jc = (await db.execute(select(func.count(Job.id)))).scalar_one()
        uc = (await db.execute(select(func.count(User.id)))).scalar_one()
        oc = (await db.execute(select(func.count(Orienteur.id)))).scalar_one()

        print(f'Techniciens: {tc}')
        print(f'Interventions: {jc}')
        print(f'Utilisateurs: {uc}')
        print(f'Orienteurs: {oc}')

        # Show first 5 technicians with orienteur_id and is_active
        result = await db.execute(
            select(Technician.id, Technician.name, Technician.orienteur_id, Technician.is_active).limit(5)
        )
        rows = result.all()
        print('\nPremiers techniciens:')
        for r in rows:
            print(f'  ID:{r[0]} Nom:{r[1]} OrientID:{r[2]} Active:{r[3]}')

        # Show first 5 jobs
        result2 = await db.execute(
            select(Job.id, Job.reference, Job.customer_name, Job.orienteur_id, Job.status).limit(5)
        )
        rows2 = result2.all()
        print('\nPremières interventions:')
        for r in rows2:
            print(f'  ID:{r[0]} Ref:{r[1]} Client:{r[2]} OrientID:{r[3]} Status:{r[4]}')

    await engine.dispose()

asyncio.run(check())