"""
FTTH Mapper — Convertit les lignes Excel mappées en dictionnaires Job.
Support des 3 types de fichiers opérationnels :
  - Nouvelles Commandes FTTH
  - SAV FTTH DOWN
  - Situation Production
"""
from backend.database.models import (
    JobStatus,
    JobPriority,
    JobType,
)

from backend.services.excel.colors import interpret


def map_excel_row(row):
    """
    Mappe une ligne Excel (dictionnaire clé/valeur) vers un dictionnaire Job.
    Supporte les colonnes des fichiers opérationnels réels.
    """
    color = interpret(row.get("_color"))
    status = JobStatus.PENDING

    if color == "DONE":
        status = JobStatus.COMPLETED
    elif color == "FAILED":
        status = JobStatus.FAILED
    elif color == "WAITING":
        status = JobStatus.ON_HOLD

    # ── Détection du type de fichier par les colonnes présentes ──
    has_commandes_cols = bool(
        row.get("SECTEUR_MAPPE") or row.get("N_COM") or row.get("S_PRODUIT")
    )
    has_sav_cols = bool(
        row.get("ID_CLIENT") or row.get("VALEUR") or row.get("DELAI")
    )
    has_production_cols = bool(
        row.get("EN_COURS_MAGELLAN") or row.get("VALIDATION_AUJOURDHUI")
    )

    # ── Mapping NOUVELLES COMMANDES FTTH ──
    if has_commandes_cols:
        return {
            "customer_name": (
                row.get("INTITULE_CLIENT")
                or row.get("CLIENT")
                or row.get("NOM_CLIENT")
                or ""
            ),
            "customer_phone": (
                row.get("CONTACT_CLIENT")
                or row.get("TELEPHONE")
                or row.get("TELEPHONE_REF")
                or ""
            ),
            "service_address": row.get("ADRESSE") or "",
            "operator": row.get("OP") or row.get("OPERATEUR") or "",
            "secteur_mappe": row.get("SECTEUR_MAPPE") or "",
            "s_produit": row.get("S_PRODUIT") or "",
            "n_com": str(row.get("N_COM") or ""),
            "etat": row.get("ETAT") or row.get("STATUT") or "",
            "date_enreg": row.get("DATE_ENREG") or row.get("DATE") or "",
            "status": status,
            "priority": JobPriority.NORMALE,
            "job_type": JobType.INSTALLATION,
        }

    # ── Mapping SAV FTTH DOWN ──
    if has_sav_cols:
        return {
            "customer_name": (
                row.get("NOM_CLIENT")
                or row.get("CLIENT")
                or row.get("INTITULE_CLIENT")
                or ""
            ),
            "customer_phone": (
                row.get("TELEPHONE_REF")
                or row.get("TELEPHONE")
                or row.get("CONTACT_CLIENT")
                or ""
            ),
            "service_address": row.get("ADRESSE") or "",
            "operator": row.get("OPERATEUR") or "",
            "id_client": str(row.get("ID_CLIENT") or row.get("REFERENCE") or ""),
            "statut_sav": row.get("STATUT") or row.get("ETAT") or "Interrompu",
            "secteur": row.get("SECTEUR") or row.get("SECTEUR_MAPPE") or "",
            "valeur": row.get("VALEUR") or 0,
            "delai": row.get("DELAI") or "<24h",
            "status": status,
            "priority": JobPriority.URGENTE,
            "job_type": JobType.REPAIR,
        }

    # ── Mapping SITUATION PRODUCTION ──
    if has_production_cols:
        return {
            "customer_name": row.get("SECTEUR") or row.get("SECTEUR_MAPPE") or "",
            "en_cours_magellan": row.get("EN_COURS_MAGELLAN") or 0,
            "validation_aujourdhui": row.get("VALIDATION_AUJOURDHUI") or 0,
            "production": row.get("PRODUCTION") or 0,
            "reste_en_cours": row.get("RESTE_EN_COURS") or 0,
            "status": status,
            "priority": JobPriority.NORMALE,
            "job_type": JobType.INSTALLATION,
        }

    # ── Fallback générique ──
    return {
        "customer_name": (
            row.get("CLIENT")
            or row.get("NOM_CLIENT")
            or row.get("INTITULE_CLIENT")
            or ""
        ),
        "customer_phone": (
            row.get("TELEPHONE")
            or row.get("CONTACT_CLIENT")
            or row.get("TELEPHONE_REF")
            or ""
        ),
        "service_address": row.get("ADRESSE") or "",
        "operator": row.get("OPERATEUR") or row.get("OP") or "",
        "status": status,
        "priority": JobPriority.NORMALE,
        "job_type": JobType.INSTALLATION,
    }
