from jose import JWTError
from fastapi import Depends, HTTPException, status, WebSocketException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select

from backend.auth.security import decode_token
from backend.database.connection import AsyncSessionLocal, get_db
from backend.database.models import ClientOrganization, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db=Depends(get_db),
):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        if not isinstance(payload, dict):
            raise credentials_exception

        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception

        user_id = int(user_id)
    except (JWTError, TypeError, ValueError):
        raise credentials_exception

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.is_active.is_(True),
        )
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if user.role == UserRole.CLIENT:
        if user.client_organization_id is None:
            raise credentials_exception
        organization_active = await db.scalar(
            select(ClientOrganization.is_active).where(
                ClientOrganization.id == user.client_organization_id
            )
        )
        if organization_active is not True:
            raise credentials_exception

    return user


async def require_office_orienteur(
    current_user: User = Depends(get_current_user),
):
    """Central dispatch identity: create, plan and assign interventions.

    Delivery 2026-09: ORIENTEUR is the office dispatcher.  The historical
    CHEF_ORIENTEUR role is now the field-team agent and must never inherit
    global dispatch rights merely because of its legacy name.
    """
    if current_user.role not in [UserRole.ORIENTEUR, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès Orienteur bureau ou Admin requis",
        )
    return current_user


async def require_field_agent(
    current_user: User = Depends(get_current_user),
):
    """Field-team supervisor using the tablet on their own team only."""
    if current_user.role != UserRole.CHEF_ORIENTEUR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès Agent terrain requis",
        )
    if not current_user.orienteur_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent terrain non lié à une équipe",
        )
    return current_user


async def require_chef_orienteur(
    current_user: User = Depends(get_current_user),
):
    """Legacy dependency name kept for route compatibility.

    Team/dispatch administration is now an office responsibility.  Keeping this
    function as an alias avoids a risky route-wide rename during the delivery
    week while removing legacy CHEF_ORIENTEUR global permissions.
    """
    return await require_office_orienteur(current_user)


async def require_orienteur(
    current_user: User = Depends(get_current_user),
):
    """Office dispatch only; field agents use require_field_agent."""
    return await require_office_orienteur(current_user)


async def require_orienteur_or_above(
    current_user: User = Depends(get_current_user),
):
    """Legacy alias for central office dispatch permissions."""
    return await require_office_orienteur(current_user)


async def require_internal_user(
    current_user: User = Depends(get_current_user),
):
    """Allow authenticated BlueVector operators, but never client accounts."""
    if current_user.role == UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès interne BlueVector requis",
        )
    return current_user


async def require_technician(
    current_user: User = Depends(get_current_user),
):
    """Own-job technician access only.

    Field agents no longer enter technician routes directly: their team-scoped
    surface resolves the actual assigned technician server-side.
    """
    if current_user.role != UserRole.TECHNICIAN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès Technicien requis",
        )
    if not current_user.technician_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profil technicien non lié",
        )
    return current_user


async def get_current_user_ws(token: str) -> User:
    """
    Validate a JWT token from WebSocket connection.
    Returns the User or raises WebSocketException.
    """
    try:
        payload = decode_token(token)
        if not isinstance(payload, dict):
            raise WebSocketException(code=1008, reason="Invalid token")

        user_id = payload.get("sub")
        if user_id is None:
            raise WebSocketException(code=1008, reason="Invalid token")

        user_id = int(user_id)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(
                    User.id == user_id,
                    User.is_active.is_(True),
                )
            )
            user = result.scalar_one_or_none()
            if user is None:
                raise WebSocketException(code=1008, reason="User not found")
            if user.role == UserRole.CLIENT:
                if user.client_organization_id is None:
                    raise WebSocketException(code=1008, reason="Client access disabled")
                organization_active = await db.scalar(
                    select(ClientOrganization.is_active).where(
                        ClientOrganization.id == user.client_organization_id
                    )
                )
                if organization_active is not True:
                    raise WebSocketException(code=1008, reason="Client access disabled")
            return user
    except (JWTError, TypeError, ValueError):
        raise WebSocketException(code=1008, reason="Invalid or expired token")


async def require_admin(
    current_user: User = Depends(get_current_user),
):
    """Autorise uniquement les administrateurs BlueVector."""

    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès administrateur requis",
        )

    return current_user


async def require_client(
    current_user: User = Depends(get_current_user),
):
    """Compte entreprise : consultation uniquement de son périmètre."""
    if current_user.role != UserRole.CLIENT or not current_user.client_organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès entreprise cliente requis",
        )
    return current_user
