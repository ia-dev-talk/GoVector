"""
Service OCR pour l'extraction du numéro de série des routeurs.
Utilise Tesseract comme moteur OCR (simple à maintenir).
"""

import os
import re
import subprocess
import logging
from typing import Optional
from pathlib import Path
import tempfile

logger = logging.getLogger(__name__)


class RouterSNScanner:
    """
    Scanner OCR pour détecter les numéros de série de routeurs.
    Utilise Tesseract OCR si disponible et ne fabrique jamais de résultat.
    """

    # Vérifier si Tesseract est installé
    _tesseract_available = None

    @classmethod
    def _check_tesseract(cls) -> bool:
        if cls._tesseract_available is not None:
            return cls._tesseract_available
        try:
            result = subprocess.run(
                ['tesseract', '--version'],
                capture_output=True, text=True, timeout=5
            )
            cls._tesseract_available = result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            cls._tesseract_available = False
        logger.info(f"Tesseract disponible: {cls._tesseract_available}")
        return cls._tesseract_available

    @classmethod
    def scan_image(cls, image_data: bytes) -> str:
        """
        Extrait le texte d'une image via Tesseract OCR.
        Retourne le texte extrait ou une chaîne vide.
        """
        if not cls._check_tesseract():
            return ""

        try:
            # Écrire l'image dans un fichier temporaire
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                tmp.write(image_data)
                tmp_path = tmp.name

            # Appeler Tesseract
            result = subprocess.run(
                ['tesseract', tmp_path, 'stdout', '--psm', '6', '-l', 'fra+eng'],
                capture_output=True, text=True, timeout=30
            )

            # Nettoyer
            os.unlink(tmp_path)

            if result.returncode == 0:
                text = result.stdout.strip()
                logger.info(f"Tesseract OCR: extracted {len(text)} chars")
                return text
            return ""

        except Exception as e:
            logger.warning(f"Tesseract error: {e}")
            return ""

    # Patterns pour détecter les numéros de série
    PATTERNS = [
        # SN: ABC123456
        re.compile(r'\bSN[:\s]*([A-Z0-9]{6,20})\b', re.IGNORECASE),
        # Serial: ABC123456
        re.compile(r'\bSerial\s*(?:Number)?[:\s]+([A-Z0-9]{6,20})\b', re.IGNORECASE),
        # S/N: ABC123456
        re.compile(r'\bS/[N\s]*[:\s]+([A-Z0-9]{6,20})\b', re.IGNORECASE),
        # MAC Address format (pour distinguer du SN)
        re.compile(r'\b(?:MAC|MAC\s*Address)[:\s]+([A-F0-9]{2}(?::[A-F0-9]{2}){5})\b', re.IGNORECASE),
        # Generic alphanumeric (8-20 chars) - last resort
        re.compile(r'\b([A-Z0-9]{8,20})\b'),
    ]

    @classmethod
    def extract_serial(cls, text: str) -> tuple[Optional[str], float]:
        """
        Extrait le numéro de série le plus probable du texte OCR.
        Retourne (serial_number, confidence).
        """
        if not text or not text.strip():
            return None, 0.0

        # Nettoyer le texte
        cleaned = cls._clean_text(text)

        candidates: list[tuple[str, float, int]] = []

        for i, pattern in enumerate(cls.PATTERNS):
            matches = pattern.finditer(cleaned)
            for match in matches:
                candidate = match.group(1) if match.lastindex >= 1 else match.group(0)
                score = cls._calculate_score(candidate, pattern_index=i)
                candidates.append((candidate, score, i))

        if not candidates:
            return None, 0.0

        # Trier par score décroissant, puis par ordre de priorité (plus petit index = plus fiable)
        candidates.sort(key=lambda x: (-x[1], x[2]))

        best = candidates[0]
        confidence = min(best[1] / 100.0, 1.0)

        logger.info("OCR extraction: text_length=%d, best_candidate='%s', confidence=%.2f",
                    len(cleaned), best[0], confidence)

        return best[0], confidence

    @staticmethod
    def _clean_text(text: str) -> str:
        """Nettoie le texte OCR."""
        # Remplacer les retours à la ligne et espaces multiples
        text = re.sub(r'\s+', ' ', text)
        # Supprimer les caractères parasites
        text = re.sub(r'[^\w\s:/-]', '', text)
        return text.strip()

    @staticmethod
    def _calculate_score(candidate: str, pattern_index: int) -> float:
        """Calcule un score de confiance pour un candidat."""
        if not candidate:
            return 0.0

        score = 50.0

        # Bonus pour les patterns explicites de SN
        if pattern_index <= 2:
            score += 40.0
        elif pattern_index == 3:
            score += 20.0  # MAC address

        # Bonus pour la longueur (SN sont généralement 8-20 caractères)
        if 8 <= len(candidate) <= 20:
            score += 10.0

        # Malus pour les patterns génériques
        if pattern_index == 4:
            score -= 20.0

        # Bonus pour mélange lettres/chiffres typique des SN
        if re.search(r'[A-Z]', candidate) and re.search(r'[0-9]', candidate):
            score += 10.0

        # Bonus si commence par des lettres (typique SN: 48 caracteres)
        if re.match(r'^[A-Z]{2,}', candidate):
            score += 5.0

        return max(score, 0.0)
