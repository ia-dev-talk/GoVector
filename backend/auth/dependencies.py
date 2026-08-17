from jose import JWTError, ExpiredSignatureError
from fastapi import Depends, HTTPException, status, WebSocket, WebSocketException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select

from backend.auth.security import decode_token
from backend.database.connection import AsyncSessionLocal, get_db
from backend.database.models import ClientOrganization, User, UserRole, Technician

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


async def require_chef_orienteur(
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.CHEF_ORIENTEUR and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès Chef Orienteur ou Admin requis"
        )

    return current_user


async def require_orienteur(
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.ORIENTEUR, UserRole.CHEF_ORIENTEUR, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès Orienteur, Chef Orienteur ou Admin requis"
        )
    return current_user


async def require_orienteur_or_above(
    current_user: User = Depends(get_current_user)
):
    """Alias — same as require_orienteur but explicit"""
    return await require_orienteur(current_user)


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
    current_user: User = Depends(get_current_user)
):
    allowed_roles = [UserRole.TECHNICIAN, UserRole.CHEF_ORIENTEUR]
    if not any(role == current_user.role for role in allowed_roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès Technicien ou Chef Orienteur requis"
        )
    if not current_user.technician_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profil technicien non lié"
        )
    return current_user


async def get_current_user_ws(token: str) -> User:
    """
    Validate a JWT token from WebSocket connection.
    Returns the User or raises WebSocketException.
    """
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise WebSocketException(code=1008, reason="Invalid token")
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User).where(
                    User.id == int(user_id),
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
    except (JWTError, ExpiredSignatureError, ValueError):
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
