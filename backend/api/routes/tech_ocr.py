"""
API routes for Technician OCR scanning (Mobile)
Endpoint pour scanner le numéro de série des routeurs via photo
Utilise Tesseract OCR si disponible, sinon fallback hash-based
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel

from backend.auth.dependencies import require_technician
from backend.services.ocr.router_sn_scanner import RouterSNScanner

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_technician)])


class OCRScanResponse(BaseModel):
    """Réponse du scan OCR"""
    serial_number: Optional[str] = None
    confidence: float = 0.0
    raw_text: Optional[str] = None
    message: Optional[str] = None


@router.post("/scan-router-sn", response_model=OCRScanResponse)
async def scan_router_sn(
    file: UploadFile = File(...),
):
    """
    Endpoint de scan OCR du numéro de série du routeur.
    Accepte une photo de l'étiquette et retourne le SN détecté.
    Priorité : Tesseract OCR > hash-based fallback.
    """
    try:
        # Vérifier le type de fichier
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail="Format de fichier invalide. Une image est requise."
            )

        # Lire le contenu de l'image
        image_data = await file.read()

        if len(image_data) == 0:
            raise HTTPException(
                status_code=400,
                detail="Fichier image vide."
            )

        # Étape 1 : Essayer Tesseract OCR (vrai OCR)
        ocr_text = RouterSNScanner.scan_image(image_data)
        serial_number = None
        confidence = 0.0
        raw_text = ""

        if ocr_text:
            logger.info(f"Tesseract OCR: {len(ocr_text)} chars extraits")
            serial_number, confidence = RouterSNScanner.extract_serial(ocr_text)
            raw_text = ocr_text

        if not serial_number:
            logger.info("OCR: aucun numéro de série fiable détecté")

        logger.info(f"OCR result: serial={serial_number}, confidence={confidence:.2f}")

        if serial_number:
            return OCRScanResponse(
                serial_number=serial_number,
                confidence=confidence,
                raw_text=raw_text[:500] if raw_text else None,
                message="Numéro de série détecté avec succès"
            )
        else:
            return OCRScanResponse(
                raw_text=raw_text[:500] if raw_text else None,
                confidence=0.0,
                message="Le numéro de série n'a pas pu être détecté. Veuillez reprendre une photo plus nette."
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors du scan OCR: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Erreur serveur lors du traitement de l'image."
        )
