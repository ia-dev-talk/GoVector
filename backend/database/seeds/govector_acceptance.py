"""Seed the empty GoVector acceptance database used for the Monday tests.

This seed is intentionally small: identities, one operational team and the two
physical cable drums required by the acceptance scenarios. Interventions must
come from the real spreadsheet import, never from invented demo rows.
"""

from __future__ import annotations

import asyncio
import os

from sqlalchemy import func, select

from backend.auth.security import get_password_hash
from backend.database.connection import AsyncSessionLocal, engine
from backend.database.models import (
    CableDrum,
    CableDrumAssignment,
    ClientOrganization,
    FieldTeam,
    FieldTeamSector,
    Job,
    Orienteur,
    Sector,
    Technician,
    TechnicianLiveStatus,
    TechnicianStatus,
    User,
    UserRole,
)


EXPECTED_USERNAMES = {
    "admin.govector",
    "orienteur.casablanca",
    "agent.casablanca",
    "amine.benali",
    "nabil.lkhair",
    "client.magillan",
}


def _password() -> str:
    value = os.environ.get("GOVECTOR_ACCEPTANCE_PASSWORD", "")
    if len(value) < 12:
        raise RuntimeError(
            "GOVECTOR_ACCEPTANCE_PASSWORD doit contenir au moins 12 caractères."
        )
    return value


async def _seed() -> None:
    password_hash = get_password_hash(_password())
    async with AsyncSessionLocal() as db:
        user_count = await db.scalar(select(func.count(User.id))) or 0
        job_count = await db.scalar(select(func.count(Job.id))) or 0
        drum_count = await db.scalar(select(func.count(CableDrum.id))) or 0

        if user_count or job_count or drum_count:
            existing = set(
                (await db.execute(select(User.username))).scalars().all()
            )
            if existing == EXPECTED_USERNAMES and job_count == 0 and drum_count == 2:
                print("GoVector acceptance seed: déjà présent, aucune modification.")
                return
            raise RuntimeError(
                "Seed refusé: la base n'est pas vide. Sauvegardez puis nettoyez "
                "la base GoVector explicitement avant de relancer."
            )

        sector = Sector(
            name="Casablanca",
            is_active=True,
        )
        owner = Orienteur(
            name="Équipe Casablanca 1",
            email="equipe.casablanca@govector.local",
            is_active=True,
        )
        client = ClientOrganization(
            name="MAGILLAN",
            code="MAGILLAN",
            operator=None,
            is_active=True,
            metadata_json={"access": "read_only"},
        )
        db.add_all([sector, owner, client])
        await db.flush()
        owner.sector_id = sector.id

        team = FieldTeam(
            name="Équipe Casablanca 1",
            code="CASA-01",
            orienteur_id=owner.id,
            is_active=True,
        )
        db.add(team)
        await db.flush()
        db.add(FieldTeamSector(team_id=team.id, sector_id=sector.id))

        technicians = [
            Technician(
                name="Amine Benali",
                employee_id="TECH-001",
                phone="0600000001",
                email="amine.benali@govector.local",
                status=TechnicianStatus.AVAILABLE,
                live_status=TechnicianLiveStatus.DECONNECTE,
                home_latitude=33.5731,
                home_longitude=-7.5898,
                home_address="Casablanca",
                skills=["FO16", "RACCORDEMENT"],
                assigned_routes=[],
                skill_bonuses={},
                username="amine.benali",
                password_hash=password_hash,
                orienteur_id=owner.id,
                team_id=team.id,
                grade="confirme",
            ),
            Technician(
                name="Nabil Lkhair",
                employee_id="TECH-002",
                phone="0600000002",
                email="nabil.lkhair@govector.local",
                status=TechnicianStatus.AVAILABLE,
                live_status=TechnicianLiveStatus.DECONNECTE,
                home_latitude=33.5731,
                home_longitude=-7.5898,
                home_address="Casablanca",
                skills=["FO64", "RACCORDEMENT"],
                assigned_routes=[],
                skill_bonuses={},
                username="nabil.lkhair",
                password_hash=password_hash,
                orienteur_id=owner.id,
                team_id=team.id,
                grade="confirme",
            ),
        ]
        db.add_all(technicians)
        await db.flush()

        users = [
            User(
                username="admin.govector",
                email="admin@govector.local",
                password_hash=password_hash,
                role=UserRole.ADMIN,
                is_active=True,
            ),
            User(
                username="orienteur.casablanca",
                email="orienteur.casablanca@govector.local",
                password_hash=password_hash,
                role=UserRole.ORIENTEUR,
                is_active=True,
                orienteur_id=owner.id,
            ),
            User(
                username="agent.casablanca",
                email="agent.casablanca@govector.local",
                password_hash=password_hash,
                role=UserRole.CHEF_ORIENTEUR,
                is_active=True,
                orienteur_id=owner.id,
            ),
            User(
                username="amine.benali",
                email="amine.benali@govector.local",
                password_hash=password_hash,
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=technicians[0].id,
            ),
            User(
                username="nabil.lkhair",
                email="nabil.lkhair@govector.local",
                password_hash=password_hash,
                role=UserRole.TECHNICIAN,
                is_active=True,
                technician_id=technicians[1].id,
            ),
            User(
                username="client.magillan",
                email="client.magillan@govector.local",
                password_hash=password_hash,
                role=UserRole.CLIENT,
                is_active=True,
                client_organization_id=client.id,
            ),
        ]
        db.add_all(users)
        await db.flush()

        drums = [
            CableDrum(
                code="4475",
                cable_type="FO16",
                current_mark_m=2003,
                status="ACTIVE",
                assigned_technician_id=technicians[0].id,
                created_by_user_id=users[1].id,
            ),
            CableDrum(
                code="9281",
                cable_type="FO64",
                current_mark_m=1320,
                status="ACTIVE",
                assigned_technician_id=technicians[1].id,
                created_by_user_id=users[1].id,
            ),
        ]
        db.add_all(drums)
        await db.flush()
        db.add_all(
            [
                CableDrumAssignment(
                    drum_id=drums[0].id,
                    technician_id=technicians[0].id,
                    assigned_by_user_id=users[1].id,
                ),
                CableDrumAssignment(
                    drum_id=drums[1].id,
                    technician_id=technicians[1].id,
                    assigned_by_user_id=users[1].id,
                ),
            ]
        )

        await db.commit()
        print("GoVector acceptance seed: 6 comptes, 1 équipe, 2 techniciens, 2 bobines.")


async def _main() -> None:
    try:
        await _seed()
    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
