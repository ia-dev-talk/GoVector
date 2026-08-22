"""Authorization policy for technician stock allocations."""

from fastapi import HTTPException

from backend.database.models import Technician, User, UserRole


def enforce_technician_allocation_scope(
    *,
    current_user: User,
    technician: Technician,
) -> None:
    """Fail closed when the caller cannot allocate stock to ``technician``.

    ADMIN and CHEF_ORIENTEUR keep their operational scope. ORIENTEUR may only
    allocate to an active technician affiliated with the same orienteur scope.
    The endpoint itself is still protected by ``require_orienteur_or_above``;
    this helper deliberately re-checks the role so a future direct call cannot
    silently widen the policy.
    """
    if current_user.role in {UserRole.ADMIN, UserRole.CHEF_ORIENTEUR}:
        return

    if current_user.role == UserRole.ORIENTEUR:
        if (
            current_user.orienteur_id
            and technician.orienteur_id == current_user.orienteur_id
        ):
            return
        raise HTTPException(
            status_code=403,
            detail="Vous ne pouvez affecter du stock qu’à vos propres techniciens.",
        )

    raise HTTPException(
        status_code=403,
        detail="Accès insuffisant pour affecter du stock à un technicien.",
    )
