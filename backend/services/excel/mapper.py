"""
ExcelMapper — fait correspondre les en-têtes de colonnes Excel aux champs internes.
Support des colonnes exactes des fichiers opérationnels FTTH :
  - Nouvelles Commandes FTTH
  - SAV FTTH DOWN
  - Situation Production

Stratégie de matching :
  1. Match exact (case-insensitive, accents insensibles via upper())
  2. Si pas de match exact, match par similarité (sous-chaîne normalisée)
"""
import unicodedata
from backend.services.excel.operator_profiles import merge_column_aliases


def _normalize(text: str) -> str:
    """Normalise un texte : upper case, sans accents, sans espaces superflus."""
    text = text.strip().upper()
    # Enlève les accents
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    # Réduit les espaces multiples
    while '  ' in text:
        text = text.replace('  ', ' ')
    return text


def _build_alias_variants(alias: str) -> list[str]:
    """Génère les variantes d'un alias (avec et sans accents, avec et sans ponctuation)."""
    base = _normalize(alias)
    variants = [base]
    # Sans le point
    if '.' in base:
        variants.append(base.replace('.', ''))
    # Sans le /
    if '/' in base:
        variants.append(base.replace('/', ''))
    return variants


# ─────────────────────────────────────────────
# ALIAS DE COLONNES — Fichiers opérationnels FTTH
# Chaque clé = nom du champ interne
# Chaque valeur = liste d'en-têtes Excel possibles (exacts, tels qu'affichés)
# ─────────────────────────────────────────────

BASE_COLUMN_ALIASES: dict[str, list[str]] = {
    # ── Colonnes NOUVELLES COMMANDES FTTH ──
    "SECTEUR_MAPPE": [
        "SECTEUR MAPPÉ", "SECTEUR MAPPE", "SECTEUR",
    ],
    "S_PRODUIT": [
        "S. PRODUIT", "S PRODUIT", "SPRODUIT",
    ],
    "N_COM": [
        "COMMANDE",
        "N° COM.", "N° COM", "N COM.", "N COM",
        "NUMERO COMMANDE", "N° COMMANDE",
    ],
    "ETAT": [
        "ETAT", "ÉTAT", "STATUT", "STATUS",
    ],
    "OP": [
        "OP", "OPERATEUR", "OPÉRATEUR",
    ],
    "DATE_ENREG": [
        "DATE ENREG.", "DATE ENREG", "DATE ENREGISTREMENT",
        "DATE D'ENREGISTREMENT",
    ],
    "INTITULE_CLIENT": [
        "INTITULÉ CLIENT", "INTITULE CLIENT",
        "INTITULÉ", "INTITULE",
        "NOM CLIENT", "CLIENT",
    ],
    "CONTACT_CLIENT": [
        "CONTACT CLIENT", "CONTACT",
        "TÉLÉPHONE", "TELEPHONE", "TEL", "MOBILE",
    ],

    # ── Colonnes SAV FTTH DOWN ──
    "ID_CLIENT": [
        "ID CLIENT", "IDCLIENT", "CODE TICKET", "CODE",
    ],
    "NOM_CLIENT": [
        "NOM CLIENT", "NOM", "CLIENT",
    ],
    "VALEUR": [
        "VALEUR", "VALUE",
    ],
    "DELAI": [
        "DÉLAI", "DELAI", "DELAIS",
    ],
    "TELEPHONE_REF": [
        "TÉLÉPHONE / RÉF", "TELEPHONE / REF",
        "TÉLÉPHONE/RÉF", "TELEPHONE/REF",
        "TÉLÉPHONE", "TELEPHONE", "RÉFÉRENCE",
    ],

    # ── Colonnes SITUATION PRODUCTION ──
    "EN_COURS_MAGELLAN": [
        "EN COURS PAR STÉ MAGILAN", "EN COURS PAR STÉ MAGELAN",
        "EN COURS PAR LA STÉ MAGELAN", "EN COURS PAR LA STÉ MAGILAN",
        "EN COURS STÉ MAGELAN", "EN COURS MAGELAN",
        "EN COURS PAR LA STÉ MAGELAN 05H00",
    ],
    "VALIDATION_AUJOURDHUI": [
        "VALIDATION DU AUJOURD'HUI", "VALIDATION DU AUJOURDHUI",
        "VALIDATION AUJOURD'HUI", "VALIDATION AUJOURDHUI",
    ],
    "PRODUCTION": [
        "PRODUCTION", "PROD",
    ],
    "RESTE_EN_COURS": [
        "RESTE EN COURS", "RESTE",
    ],

    # ── Champs génériques FTTH (gardés pour compatibilité) ──
    "NRO": ["NRO", "CENTRAL", "SITE", "NOEUD"],
    "SRO": ["SRO", "SOUS REPARTITEUR", "SOUS-REPARTITEUR"],
    "PBO": ["PBO", "POINT DE BRANCHEMENT", "POINT_BRANCHEMENT", "BRANCHEMENT"],
    "PTO": ["PTO", "POINT TERMINAL", "POINT TERMINAL OPTIQUE"],
    "SPLITTER": ["SPLITTER", "SPL"],
    "PORT": ["PORT", "PORT SPLITTER", "PORT SPL"],
    "TECHNICIEN": ["TECHNICIEN", "TECH", "AGENT", "INTERVENANT", "INSTALLATEUR"],
    "DATE": ["DATE", "DATE RDV", "DATE_RDV", "RENDEZ-VOUS", "RDV"],
    "STATUT": ["STATUT", "STATUS", "ETAT", "ÉTAT"],
    "PRIORITE": ["PRIORITE", "PRIORITY", "URGENT", "PRIORITÉ"],
    "TYPE": ["TYPE", "TYPE INTERVENTION", "TYPE D'INTERVENTION", "INTERVENTION"],
    "CLIENT": ["CLIENT", "NOM", "ABONNE", "NOM CLIENT", "NOM ABONNE"],
    "ADRESSE": ["ADRESSE", "ADDRESS", "ADRESSE CLIENT"],
    "VILLE": ["VILLE", "CITY", "COMMUNE"],
    "CODE_POSTAL": ["CODE POSTAL", "CODE_POSTAL", "CP", "ZIP"],
    "GPS_PCO": ["GPS PCO", "GPS_PCO"],
    "GPS_DERIVATION": [
        "GPS DERIVATION", "GPS DÉRIVATION", "GPS_DERIVATION",
    ],
    "GPS_SPLITTER": ["GPS SPLITTER", "GPS_SPLITTER"],
    "TELEPHONE": ["TÉLÉPHONE", "TELEPHONE", "TEL", "MOBILE", "PHONE"],
    "COMMENTAIRE": ["COMMENTAIRE", "COMMENT", "OBSERVATION", "REMARQUE", "NOTE"],
    "REFERENCE": ["REFERENCE", "RÉFÉRENCE", "REF", "N° DOSSIER", "NUM DOSSIER", "ID"],
    "OPERATEUR": ["OPERATEUR", "OPÉRATEUR", "OPERATOR"],
}


class ExcelMapper:
    """Mappe les en-têtes de colonnes Excel vers des champs internes normalisés."""

    COLUMN_ALIASES = BASE_COLUMN_ALIASES

    def __init__(
        self,
        workbook,
        operator: str = "UNKNOWN",
        mapping_overrides: dict[str, list[str]] | None = None,
    ):
        self.workbook = workbook
        self.operator = operator
        self.column_aliases = self._build_aliases()
        for field, aliases in (mapping_overrides or {}).items():
            if field not in BASE_COLUMN_ALIASES or not isinstance(aliases, list):
                continue
            target = self.column_aliases.setdefault(field, [])
            for alias in aliases:
                if isinstance(alias, str) and alias.strip() and alias.strip() not in target:
                    target.append(alias.strip())
        # Index de recherche rapide : pour chaque variante normalisée, stocke le champ
        self._alias_index: dict[str, str] = {}
        self._build_alias_index()

    def _build_aliases(self) -> dict[str, list[str]]:
        merged = {
            field: list(aliases)
            for field, aliases in BASE_COLUMN_ALIASES.items()
        }
        operator_aliases = merge_column_aliases(self.operator)
        for field, aliases in operator_aliases.items():
            existing = merged.setdefault(field, [])
            for alias in aliases:
                if alias not in existing:
                    existing.append(alias)
        return merged

    def _build_alias_index(self):
        """Construit un index de recherche : normalisé(variante) -> nom du champ."""
        for field, aliases in self.column_aliases.items():
            for alias in aliases:
                for variant in _build_alias_variants(alias):
                    self._alias_index[variant] = field

    def _match_field(self, header_value: str) -> str | None:
        """
        Trouve le champ interne qui correspond à l'en-tête.
        Stratégie :
          1. Match exact normalisé (prioritaire)
          2. Match partiel (longest match)
        """
        norm = _normalize(header_value)
        if not norm:
            return None

        # 1. Match exact dans l'index
        if norm in self._alias_index:
            return self._alias_index[norm]

        # 2. Match partiel : trouver le champ dont l'alias est le plus long
        #    qui est contenu dans l'en-tête
        best_field = None
        best_len = 0
        for field, aliases in self.column_aliases.items():
            for alias in aliases:
                alias_norm = _normalize(alias)
                if not alias_norm:
                    continue
                # L'alias doit être contenu dans l'en-tête normalisé
                if alias_norm in norm and len(alias_norm) > best_len:
                    # Protections contre les faux positifs :
                    # "OP" (2 chars) est trop court pour matcher "OPERATEUR"
                    # On exige au moins 4 caractères pour le match partiel
                    if len(alias_norm) >= 4:
                        best_field = field
                        best_len = len(alias_norm)

        return best_field

    def map(self):
        """Exécute le mapping sur toutes les feuilles du workbook."""
        mapped = []
        for sheet in self.workbook:
            if not sheet["rows"]:
                continue

            header = sheet["rows"][0]
            mapping = {}
            raw_headers = []

            for cell in header:
                value = cell["value"]
                if value is None:
                    continue
                header_value = str(value).strip()
                raw_headers.append(header_value)
                field = self._match_field(header_value)
                if field and field not in mapping:
                    mapping[field] = cell["column"]

            mapped.append({
                "sheet": sheet["sheet"],
                "mapping": mapping,
                "rows": sheet["rows"],
                "headers": raw_headers,
                "unmapped_headers": [
                    header
                    for header in raw_headers
                    if self._match_field(header) is None
                ],
            })

        return mapped
