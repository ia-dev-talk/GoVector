"""
Operator-specific import profiles for Moroccan FTTH operators.
"""
from backend.database.models import JobPriority, JobType

OPERATOR_PROFILES = {
    "ORANGE": {
        "skills": ["install", "repair", "maintenance"],
        "default_job_type": JobType.INSTALLATION,
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
        "skills": ["install", "repair"],
        "default_job_type": JobType.INSTALLATION,
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
        "skills": ["install", "service_change"],
        "default_job_type": JobType.INSTALLATION,
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
        "skills": ["install"],
        "default_job_type": JobType.INSTALLATION,
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
    merged: dict[str, list[str]] = {}

    for field, aliases in profile.get("column_aliases", {}).items():
        merged[field] = list(aliases)

    return merged
