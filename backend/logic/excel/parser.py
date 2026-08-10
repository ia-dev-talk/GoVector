import pandas as pd
import unicodedata


# ==========================================================
# Nettoyage d'un nom de colonne
# ==========================================================

def clean_column_name(name):

    if name is None:
        return ""

    name = str(name).strip().upper()

    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))

    name = name.replace("\n", " ")
    name = name.replace("\r", " ")

    while "  " in name:
        name = name.replace("  ", " ")

    return name


# ==========================================================
# Normalisation des colonnes
# ==========================================================

def normalize(df):

    df = df.copy()

    df.columns = [
        clean_column_name(col)
        for col in df.columns
    ]

    return df


# ==========================================================
# Détection opérateur
# ==========================================================

def detect_operator(df):

    cols = set(df.columns)

    if {
        "NRO",
        "PBO",
        "TECHNICIEN"
    }.issubset(cols):
        return "IAM"

    if "OLT" in cols:
        return "ORANGE"

    if "PM" in cols:
        return "INWI"

    return "UNKNOWN"


# ==========================================================
# Informations générales
# ==========================================================

def dataframe_info(df):

    return {
        "rows": len(df),
        "columns": list(df.columns),
        "operator": detect_operator(df)
    }