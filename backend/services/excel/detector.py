"""
Detector — backwards-compatible re-export of the OperatorDetector.
"""
from backend.services.excel.operator_detector import detect_operator, OperatorDetector

__all__ = ["detect_operator", "OperatorDetector"]