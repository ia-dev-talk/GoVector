"""Operator-specific aliases and neutral import metadata."""
from backend.database.models import JobPriority


# Aliases communs à tous les opérateurs. Les fichiers terrain réels n'utilisent
# pas toujours les intitulés détaillés ``GPS PCO`` / ``GPS DERIVATION`` : une
# colonne générique ``GPS`` ou ``COORDONNEES`` doit rester exploitable sans
# modifier chaque profil opérateur séparément. Elle est rattachée à GPS_PCO,
# qui est déjà une source GPS fiable reconnue par le contrat de confirmation.
COMMON_COLUMN_ALIASES = {
    "GPS_PCO": [
        "GPS",
        "COORDONNEES",
        "COORDONNÉES",
        "COORDONNEES GPS",
        "COORDONNÉES GPS",
    ],
}


OPERATOR_PROFILES = {
    "ORANGE": {
        "skills": [],
        "default_job_type": None,
        "default_priority": JobPriority.NORMALE,
        "reference_prefix": "ORA",
        "column_aliases": {
            "NRO": ["NRO ORANGE", "CENTRAL ORANGE", "SITE ORANGE"],
            "CLIENT": ["NOM ABONNE ORANGE", "ABONNE ORANGE"],
            "ADRESSE": ["ADRESSE ABONNE", "ADRESSE CLIENT"],
            "TELEPHONE": ["NUMERO ABONNE", "N° ABONNE"],
            "REFERENCE": ["N° DOSSIER ORANGE", "ID ORANGE", "REF ORANGE"],
            "TYPE": ["TYPE ACTE", "TYPE ACTIVITE"],
        },
    },
    "IAM": {
        "skills": [],
        "default_job_type": None,
        "default_priority": JobPriority.NORMALE,
        "reference_prefix": "IAM",
        "column_aliases": {
            "NRO": ["NRO IAM", "CENTRALE", "SITE IAM"],
            "SRO": ["SR", "SOUS REPARTITEUR IAM"],
            "PBO": ["PB", "POINT BRANCHEMENT"],
            "PTO": ["PT", "PRISE"],
            "CLIENT": ["NOM ABONNE IAM", "ABONNE IAM"],
            "REFERENCE": ["N° TICKET", "TICKET IAM", "REF IAM"],
            "TYPE": ["TYPE PRESTATION", "PRESTATION"],
        },
    },
    "INWI": {
        "skills": [],
        "default_job_type": None,
        "default_priority": JobPriority.NORMALE,
        "reference_prefix": "INW",
        "column_aliases": {
            "NRO": ["NRO INWI", "SITE INWI"],
            "PBO": ["PBO INWI", "BOITIER"],
            "CLIENT": ["NOM CLIENT INWI", "ABONNE INWI"],
            "TELEPHONE": ["MSISDN", "NUMERO INWI"],
            "REFERENCE": ["N° COMMANDE", "ORDER ID", "REF INWI"],
            "TYPE": ["TYPE SERVICE", "SERVICE"],
        },
    },
    "UNKNOWN": {
        "skills": [],
        "default_job_type": None,
        "default_priority": JobPriority.NORMALE,
        "reference_prefix": "IMP",
        "column_aliases": {},
    },
}


def get_operator_profile(operator: str) -> dict:

    return OPERATOR_PROFILES.get(
        operator,
        OPERATOR_PROFILES["UNKNOWN"],
    )


def merge_column_aliases(operator: str) -> dict:

    profile = get_operator_profile(operator)
    merged: dict[str, list[str]] = {
        field: list(aliases)
        for field, aliases in COMMON_COLUMN_ALIASES.items()
    }

    for field, aliases in profile.get("column_aliases", {}).items():
        existing = merged.setdefault(field, [])
        for alias in aliases:
            if alias not in existing:
                existing.append(alias)

    return merged
