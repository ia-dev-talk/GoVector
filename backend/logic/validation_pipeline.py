"""Canonical three-step intervention validation markers.

The public job status remains ``EN_ATTENTE_VALIDATION`` between the technician
handoff and the office decision. ``validation_status`` records who currently
owns the dossier without adding a second competing workflow enum.
"""

TECHNICIAN_SUBMITTED = "TECHNICIAN_SUBMITTED"
FIELD_AGENT_VERIFIED = "FIELD_AGENT_VERIFIED"
RETURNED_FOR_CORRECTION = "RETURNED_FOR_CORRECTION"
ORIENTEUR_VALIDATED = "ORIENTEUR_VALIDATED"


def is_field_agent_verified(value: str | None) -> bool:
    return str(value or "").strip().upper() == FIELD_AGENT_VERIFIED
