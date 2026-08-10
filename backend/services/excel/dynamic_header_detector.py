"""
Détection dynamique de l'en-tête dans les fichiers Excel FTTH.
Scanne les N premières lignes pour trouver la ligne contenant
'N° Com.', 'Secteur Mappé', ou un marqueur d'en-tête similaire.
"""
import logging

logger = logging.getLogger(__name__)

# Marqueurs d'en-tête reconnus pour les fichiers FTTH
HEADER_MARKERS = [
    "N° COM.",
    "N° COM",
    "N COM.",
    "NUMERO COMMANDE",
    "N° COMMANDE",
    "SECTEUR MAPPÉ",
    "SECTEUR MAPPE",
    "SECTEUR",
    "INTITULÉ CLIENT",
    "INTITULE CLIENT",
    "CODE TICKET",
    "EN COURS PAR STÉ MAGILAN",
    "EN COURS PAR STÉ MAGELAN",
    "EN COURS PAR LA STÉ MAGELAN",
]


def _normalize(text: str) -> str:
    """Normalise une valeur pour la comparaison."""
    import unicodedata
    text = text.strip().upper()
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    return text


def detect_header_row(rows: list, max_scan: int = 15) -> tuple[int, dict]:
    """
    Scanne les `max_scan` premières lignes du workbook pour détecter la ligne d'en-tête.

    Retourne:
        (index_de_ligne, mapping_des_colonnes)

    Lève ValueError si aucun en-tête valide n'est trouvé.

    Arguments:
        rows: Liste de listes de cellules (chaque cellule est un dict avec 'value')
        max_scan: Nombre maximum de lignes à scanner
    """
    for row_idx in range(min(len(rows), max_scan)):
        row = rows[row_idx]
        row_values = [str(cell.get("value", "") or "").strip() for cell in row]

        # Compter combien de valeurs non-vides
        non_empty = [v for v in row_values if v]
        if len(non_empty) < 2:
            continue  # Ligne vide, on continue

        # Chercher un marqueur d'en-tête
        found_markers = []
        for cell_idx, val in enumerate(row_values):
            norm_val = _normalize(val)
            for marker in HEADER_MARKERS:
                if _normalize(marker) in norm_val or norm_val in _normalize(marker):
                    found_markers.append((cell_idx, marker))
                    break

        if found_markers:
            # On a trouvé au moins un marqueur → c'est la ligne d'en-tête
            mapping = {}
            for cell_idx, cell in enumerate(row):
                val = str(cell.get("value", "") or "").strip()
                if val:
                    mapping[cell["column"]] = val

            logger.info(
                "En-tête détecté ligne %d avec %d marqueurs: %s",
                row_idx, len(found_markers),
                [m for _, m in found_markers[:5]]
            )
            return row_idx, mapping

    raise ValueError(
        "Format de fichier invalide : aucun en-tête reconnu "
        "(marqueurs attendus: N° Com., Secteur Mappé, Intitulé client, ...) "
        f"dans les {max_scan} premières lignes."
    )


def build_column_name_mapping(header_mapping: dict) -> dict:
    """
    Convertit le mapping 'colonne -> nom_en_tete' en 'nom_en_tete_normalise -> colonne'.
    Utile pour le traitement pandas.
    """
    import unicodedata

    def _norm(v: str) -> str:
        v = v.strip().upper()
        v = unicodedata.normalize('NFKD', v).encode('ascii', 'ignore').decode('ascii')
        return v

    return {_norm(name): col for col, name in header_mapping.items()}


# Champs internaux attendus pour le mapping
FIELD_MAPPING = {
    "N_COM": ["N° COM.", "N° COM", "N COM.", "N COM", "NUMERO COMMANDE", "N° COMMANDE"],
    "SECTEUR_MAPPE": ["SECTEUR MAPPÉ", "SECTEUR MAPPE", "SECTEUR"],
    "S_PRODUIT": ["S. PRODUIT", "S PRODUIT", "SPRODUIT"],
    "ETAT": ["ETAT", "STATUT", "STATUS"],
    "OP": ["OP", "OPERATEUR", "OPÉRATEUR"],
    "DATE_ENREG": ["DATE ENREG.", "DATE ENREG", "DATE ENREGISTREMENT"],
    "INTITULE_CLIENT": ["INTITULÉ CLIENT", "INTITULE CLIENT", "INTITULÉ", "INTITULE", "NOM CLIENT", "CLIENT"],
    "CONTACT_CLIENT": ["CONTACT CLIENT", "CONTACT", "TÉLÉPHONE", "TELEPHONE", "TEL", "MOBILE"],
    "ADRESSE": ["ADRESSE", "ADRESSE CLIENT", "ADDRESS"],
    "ID_CLIENT": ["ID CLIENT", "IDCLIENT", "CODE TICKET", "CODE"],
    "NOM_CLIENT": ["NOM CLIENT", "NOM"],
    "VALEUR": ["VALEUR", "VALUE"],
    "DELAI": ["DÉLAI", "DELAI", "DELAIS"],
    "TELEPHONE_REF": ["TÉLÉPHONE / RÉF", "TÉLÉPHONE/RÉF", "TÉLÉPHONE", "RÉFÉRENCE"],
    "EN_COURS_MAGELLAN": ["EN COURS PAR STÉ MAGILAN", "EN COURS PAR STÉ MAGELAN", "EN COURS PAR LA STÉ MAGELAN"],
    "VALIDATION_AUJOURDHUI": ["VALIDATION DU AUJOURD'HUI", "VALIDATION AUJOURD'HUI"],
    "PRODUCTION": ["PRODUCTION", "PROD"],
    "RESTE_EN_COURS": ["RESTE EN COURS", "RESTE"],
    "NRO": ["NRO", "CENTRAL", "SITE"],
    "SRO": ["SRO", "SOUS REPARTITEUR"],
    "PBO": ["PBO", "POINT DE BRANCHEMENT", "BRANCHEMENT"],
    "PTO": ["PTO", "POINT TERMINAL", "POINT TERMINAL OPTIQUE"],
    "SPLITTER": ["SPLITTER", "SPL"],
    "PORT": ["PORT", "PORT SPLITTER"],
    "TECHNICIEN": ["TECHNICIEN", "TECH", "AGENT", "INTERVENANT"],
    "DATE": ["DATE", "DATE RDV", "RENDEZ-VOUS", "RDV"],
    "PRIORITE": ["PRIORITE", "PRIORITY", "URGENT", "PRIORITÉ"],
    "TYPE": ["TYPE", "TYPE INTERVENTION"],
    "CLIENT": ["CLIENT", "ABONNE", "NOM ABONNE"],
    "VILLE": ["VILLE", "CITY", "COMMUNE"],
    "CODE_POSTAL": ["CODE POSTAL", "CP"],
    "TELEPHONE": ["TÉLÉPHONE", "TELEPHONE", "TEL", "MOBILE", "PHONE"],
    "COMMENTAIRE": ["COMMENTAIRE", "COMMENT", "OBSERVATION", "REMARQUE", "NOTE"],
    "REFERENCE": ["REFERENCE", "RÉFÉRENCE", "REF", "N° DOSSIER", "ID"],
    "OPERATEUR": ["OPERATEUR", "OPÉRATEUR", "OPERATOR"],
}


def map_headers_to_fields(header_values: list[str]) -> dict:
    """
    Prend une liste d'en-têtes (strings) et retourne un mapping
    {col_index: field_name} où field_name est un champ interne.
    """
    import unicodedata

    def _norm(v: str) -> str:
        v = v.strip().upper()
        v = unicodedata.normalize('NFKD', v).encode('ascii', 'ignore').decode('ascii')
        return v

    result = {}
    for col_idx, raw_header in enumerate(header_values):
        if not raw_header or not raw_header.strip():
            continue
        norm_header = _norm(raw_header)
        best_field = None
        best_len = 0

        for field, aliases in FIELD_MAPPING.items():
            for alias in aliases:
                norm_alias = _norm(alias)
                if norm_alias in norm_header and len(norm_alias) > best_len:
                    best_field = field
                    best_len = len(norm_alias)

        if best_field:
            result[col_idx] = best_field

    return result