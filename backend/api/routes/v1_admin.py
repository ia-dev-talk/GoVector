"""V1 administration: clients and operational teams."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas.v1_admin import (
    ClientAccountCreate,
    ClientAccountResponse,
    ClientOrganizationPatch,
    ClientOrganizationResponse,
    ClientOrganizationWrite,
    FieldTeamPatch,
    FieldTeamResponse,
    FieldTeamWrite,
    TeamTechnicianResponse,
    TeamTechnicianUpdate,
)
from backend.auth.dependencies import require_admin, require_chef_orienteur
from backend.auth.security import get_password_hash
from backend.database.connection import get_db
from backend.database.models import (
    ApplicationSetting,
    ClientOrganization,
    FieldTeam,
    FieldTeamSector,
    Orienteur,
    Sector,
    Technician,
    User,
    UserRole,
)


router = APIRouter(tags=["V1 Administration"])


async def _validate_active_grade(db: AsyncSession, grade: str) -> None:
    """Reject grades that are not part of the governed active catalog."""
    document = (
        await db.execute(
            select(ApplicationSetting).where(
                ApplicationSetting.namespace == "business_catalog"
            )
        )
    ).scalar_one_or_none()
    items = (document.values or {}).get("technician_grades", []) if document else []
    active_codes = {
        str(item.get("code"))
        for item in items
        if isinstance(item, dict) and item.get("active") is True
    }
    if not active_codes:
        active_codes = {"junior", "senior"}
    if grade not in active_codes:
        raise HTTPException(
            status_code=422,
            detail="Grade technicien inactif ou inconnu dans le référentiel métier.",
        )


async def _team_response(db: AsyncSession, team: FieldTeam) -> FieldTeamResponse:
    orienteur = (
        await db.execute(select(Orienteur).where(Orienteur.id == team.orienteur_id))
    ).scalar_one()
    sector_rows = (
        await db.execute(
            select(Sector)
            .join(FieldTeamSector, FieldTeamSector.sector_id == Sector.id)
            .where(FieldTeamSector.team_id == team.id)
            .order_by(Sector.name)
        )
    ).scalars().all()
    technicians = (
        await db.execute(
            select(Technician)
            .where(Technician.team_id == team.id)
            .order_by(Technician.name)
        )
    ).scalars().all()
    return FieldTeamResponse(
        id=team.id,
        name=team.name,
        code=team.code,
        orienteur_id=team.orienteur_id,
        orienteur_name=orienteur.name,
        sector_ids=[row.id for row in sector_rows],
        sector_names=[row.name for row in sector_rows],
        technicians=[
            TeamTechnicianResponse(
                id=technician.id,
                name=technician.name,
                grade=technician.grade,
                is_active=technician.is_active,
            )
            for technician in technicians
        ],
        is_active=team.is_active,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


async def _replace_team_sectors(
    db: AsyncSession, *, team_id: int, sector_ids: list[int]
) -> None:
    unique_ids = list(dict.fromkeys(sector_ids))
    existing = set(
        (
            await db.execute(select(Sector.id).where(Sector.id.in_(unique_ids)))
        ).scalars().all()
    )
    if existing != set(unique_ids):
        raise HTTPException(status_code=422, detail="Un ou plusieurs secteurs sont inconnus.")
    await db.execute(delete(FieldTeamSector).where(FieldTeamSector.team_id == team_id))
    for sector_id in unique_ids:
        db.add(FieldTeamSector(team_id=team_id, sector_id=sector_id))


async def _deactivate_empty_previous_team(
    db: AsyncSession, *, technician: Technician, next_team_id: int
) -> None:
    previous_team_id = technician.team_id
    if previous_team_id is None or previous_team_id == next_team_id:
        return
    remaining = (
        await db.execute(
            select(func.count(Technician.id)).where(
                Technician.team_id == previous_team_id,
                Technician.id != technician.id,
            )
        )
    ).scalar_one()
    if remaining == 0:
        previous = await db.get(FieldTeam, previous_team_id)
        if previous is not None:
            previous.is_active = False


@router.get("/clients", response_model=list[ClientOrganizationResponse])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    return (
        await db.execute(select(ClientOrganization).order_by(ClientOrganization.name))
    ).scalars().all()


@router.post(
    "/clients", response_model=ClientOrganizationResponse, status_code=status.HTTP_201_CREATED
)
async def create_client(
    payload: ClientOrganizationWrite,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    client = ClientOrganization(**payload.model_dump())
    db.add(client)
    try:
        await db.commit()
        await db.refresh(client)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Nom ou code client déjà utilisé.") from exc
    return client


@router.patch("/clients/{client_id}", response_model=ClientOrganizationResponse)
async def update_client(
    client_id: int,
    payload: ClientOrganizationPatch,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    client = await db.get(ClientOrganization, client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="Entreprise cliente introuvable.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    try:
        await db.commit()
        await db.refresh(client)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Nom ou code client déjà utilisé.") from exc
    return client


@router.post(
    "/client-accounts", response_model=ClientAccountResponse, status_code=status.HTTP_201_CREATED
)
async def create_client_account(
    payload: ClientAccountCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    organization = await db.get(ClientOrganization, payload.organization_id)
    if organization is None or not organization.is_active:
        raise HTTPException(status_code=422, detail="Entreprise cliente inactive ou inconnue.")
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.CLIENT,
        client_organization_id=organization.id,
    )
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Identifiant ou email déjà utilisé.") from exc
    return ClientAccountResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        organization_id=organization.id,
        is_active=user.is_active,
    )


@router.get("/teams", response_model=list[FieldTeamResponse])
async def list_teams(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_chef_orienteur),
):
    teams = (await db.execute(select(FieldTeam).order_by(FieldTeam.name))).scalars().all()
    return [await _team_response(db, team) for team in teams]


@router.post("/teams", response_model=FieldTeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: FieldTeamWrite,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_chef_orienteur),
):
    await _validate_active_grade(db, payload.initial_grade)
    if await db.get(Orienteur, payload.orienteur_id) is None:
        raise HTTPException(status_code=422, detail="Orienteur inconnu.")
    technician = await db.get(Technician, payload.initial_technician_id)
    if technician is None or not technician.is_active:
        raise HTTPException(status_code=422, detail="Technicien initial inactif ou inconnu.")
    team = FieldTeam(
        name=payload.name,
        code=payload.code,
        orienteur_id=payload.orienteur_id,
        is_active=payload.is_active,
    )
    db.add(team)
    try:
        await db.flush()
        await _replace_team_sectors(db, team_id=team.id, sector_ids=payload.sector_ids)
        await _deactivate_empty_previous_team(
            db, technician=technician, next_team_id=team.id
        )
        technician.team_id = team.id
        technician.grade = payload.initial_grade
        technician.orienteur_id = team.orienteur_id
        await db.commit()
        await db.refresh(team)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Nom/code déjà utilisé ou cet orienteur possède déjà une équipe.",
        ) from exc
    return await _team_response(db, team)


@router.patch("/teams/{team_id}", response_model=FieldTeamResponse)
async def update_team(
    team_id: int,
    payload: FieldTeamPatch,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_chef_orienteur),
):
    team = await db.get(FieldTeam, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Équipe introuvable.")
    data = payload.model_dump(exclude_unset=True)
    sector_ids = data.pop("sector_ids", None)
    previous_orienteur_id = team.orienteur_id
    if "orienteur_id" in data and await db.get(Orienteur, data["orienteur_id"]) is None:
        raise HTTPException(status_code=422, detail="Orienteur inconnu.")
    for key, value in data.items():
        setattr(team, key, value)
    if sector_ids is not None:
        await _replace_team_sectors(db, team_id=team.id, sector_ids=sector_ids)
    if team.orienteur_id != previous_orienteur_id:
        # The V1 team is authoritative, while Technician.orienteur_id still feeds
        # legacy dispatch/access paths. Keep both projections consistent until the
        # legacy ownership column can be retired.
        await db.execute(
            update(Technician)
            .where(Technician.team_id == team.id)
            .values(orienteur_id=team.orienteur_id)
        )
    if team.is_active:
        technician_count = (
            await db.execute(
                select(func.count(Technician.id)).where(Technician.team_id == team.id)
            )
        ).scalar_one()
        if technician_count == 0:
            raise HTTPException(
                status_code=409,
                detail="Une équipe active doit contenir au moins un technicien.",
            )
    try:
        await db.commit()
        await db.refresh(team)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Nom/code déjà utilisé ou cet orienteur possède déjà une équipe.",
        ) from exc
    return await _team_response(db, team)


@router.put("/teams/{team_id}/technicians/{technician_id}", response_model=FieldTeamResponse)
async def put_team_technician(
    team_id: int,
    technician_id: int,
    payload: TeamTechnicianUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_chef_orienteur),
):
    await _validate_active_grade(db, payload.grade)
    team = await db.get(FieldTeam, team_id)
    technician = await db.get(Technician, technician_id)
    if team is None or technician is None:
        raise HTTPException(status_code=404, detail="Équipe ou technicien introuvable.")
    if not team.is_active:
        raise HTTPException(status_code=409, detail="Impossible d’affecter à une équipe inactive.")
    if not technician.is_active:
        raise HTTPException(status_code=409, detail="Impossible d’affecter un technicien inactif.")
    await _deactivate_empty_previous_team(
        db, technician=technician, next_team_id=team.id
    )
    technician.team_id = team.id
    technician.grade = payload.grade
    # Keep the legacy ownership path coherent during the V1 transition.
    technician.orienteur_id = team.orienteur_id
    await db.commit()
    await db.refresh(team)
    return await _team_response(db, team)


@router.delete("/teams/{team_id}/technicians/{technician_id}", response_model=FieldTeamResponse)
async def remove_team_technician(
    team_id: int,
    technician_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_chef_orienteur),
):
    team = await db.get(FieldTeam, team_id)
    technician = await db.get(Technician, technician_id)
    if team is None or technician is None or technician.team_id != team.id:
        raise HTTPException(status_code=404, detail="Association équipe-technicien introuvable.")
    remaining = (
        await db.execute(
            select(func.count(Technician.id)).where(
                Technician.team_id == team.id,
                Technician.id != technician.id,
            )
        )
    ).scalar_one()
    if team.is_active and remaining == 0:
        raise HTTPException(
            status_code=409,
            detail="Désactivez l’équipe avant d’en retirer son dernier technicien.",
        )
    technician.team_id = None
    technician.orienteur_id = None
    await db.commit()
    await db.refresh(team)
    return await _team_response(db, team)
