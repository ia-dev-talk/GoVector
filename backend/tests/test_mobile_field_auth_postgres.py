"""PostgreSQL contract for role-aware GoVector field login."""

import asyncio
from uuid import uuid4

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.routes.tech_auth import TechLoginRequest, tech_login
from backend.auth.security import get_password_hash
from backend.database.models import Base, Orienteur, Technician, User, UserRole
from backend.tests.test_technician_field_stock_postgres_contract import (
    _admin_url,
    _create_database,
    _database_url,
    _drop_database,
    _sqlalchemy_url,
)


async def _exercise(database_url: str) -> dict:
    engine = create_async_engine(_sqlalchemy_url(database_url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        async with factory() as db:
            agent_profile = Orienteur(name="Agent mobile Casablanca")
            technician = Technician(
                name="Technicien mobile Casablanca",
                employee_id="MOB-AUTH-TECH",
                home_latitude=33.58,
                home_longitude=-7.62,
                skills=[],
                assigned_routes=[],
                skill_bonuses={},
            )
            db.add_all([agent_profile, technician])
            await db.flush()

            technician_user = User(
                username="mobile-tech-auth",
                email="mobile-tech-auth@example.invalid",
                password_hash=get_password_hash("secret-tech"),
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=technician.id,
            )
            agent_user = User(
                username="mobile-agent-auth",
                email="mobile-agent-auth@example.invalid",
                password_hash=get_password_hash("secret-agent"),
                role=UserRole.CHEF_ORIENTEUR,
                is_active=True,
                orienteur_id=agent_profile.id,
            )
            db.add_all([technician_user, agent_user])
            await db.commit()

            tech_response = await tech_login(
                TechLoginRequest(username="mobile-tech-auth", password="secret-tech"),
                db=db,
            )
            agent_response = await tech_login(
                TechLoginRequest(username="mobile-agent-auth", password="secret-agent"),
                db=db,
            )

            return {
                "tech_role": tech_response.role,
                "tech_id": tech_response.technician_id,
                "tech_name": tech_response.technician_name,
                "tech_orienteur_id": tech_response.orienteur_id,
                "tech_agent_name": tech_response.field_agent_name,
                "agent_role": agent_response.role,
                "agent_tech_id": agent_response.technician_id,
                "agent_tech_name": agent_response.technician_name,
                "agent_orienteur_id": agent_response.orienteur_id,
                "agent_name": agent_response.field_agent_name,
            }
    finally:
        await engine.dispose()


def test_mobile_login_keeps_technician_and_field_agent_identities_separate():
    admin_url = _admin_url()
    database_name = f"govector_mobile_auth_{uuid4().hex}"
    asyncio.run(_create_database(admin_url, database_name))
    try:
        result = asyncio.run(_exercise(_database_url(admin_url, database_name)))
    finally:
        asyncio.run(_drop_database(admin_url, database_name))

    assert result["tech_role"] == UserRole.TECHNICIAN.value
    assert result["tech_id"] is not None
    assert result["tech_name"] == "Technicien mobile Casablanca"
    assert result["tech_agent_name"] is None

    assert result["agent_role"] == UserRole.CHEF_ORIENTEUR.value
    assert result["agent_tech_id"] is None
    assert result["agent_tech_name"] is None
    assert result["agent_orienteur_id"] is not None
    assert result["agent_name"] == "Agent mobile Casablanca"
