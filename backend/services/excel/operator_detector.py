"""
OperatorDetector — automatic operator detection for FTTH Excel imports.

Architecture:
  OperatorDetector (orchestrator)
    ├── IAMDetector
    ├── OrangeDetector
    ├── InwiDetector
    └── CustomDetector (fallback)

Each detector implements a common interface and can be extended independently.
"""
from abc import ABC, abstractmethod
from typing import Literal, Optional

from backend.services.excel.operator_profiles import OPERATOR_PROFILES

OperatorName = Literal["IAM", "ORANGE", "INWI", "UNKNOWN"]


class BaseOperatorDetector(ABC):
    """Abstract base for operator-specific detectors."""

    @property
    @abstractmethod
    def operator_name(self) -> OperatorName:
        ...

    @abstractmethod
    def detect_from_filename(self, filename: str) -> bool:
        ...

    @abstractmethod
    def detect_from_sheet_name(self, sheet_name: str) -> bool:
        ...

    @abstractmethod
    def detect_from_headers(self, headers: list[str]) -> bool:
        ...


class IAMDetector(BaseOperatorDetector):
    operator_name: OperatorName = "IAM"

    _KEYWORDS_FILENAME = ["iam"]
    _KEYWORDS_SHEET = ["iam", "iam_", "iam-"]
    _KEYWORDS_HEADER = ["iam", "centrale", "sous repartiteur", "point branchement"]

    def detect_from_filename(self, filename: str) -> bool:
        name = filename.lower()
        return any(kw in name for kw in self._KEYWORDS_FILENAME)

    def detect_from_sheet_name(self, sheet_name: str) -> bool:
        name = sheet_name.lower()
        return any(kw in name for kw in self._KEYWORDS_SHEET)

    def detect_from_headers(self, headers: list[str]) -> bool:
        text = " ".join(h.lower() for h in headers if h)
        return any(kw in text for kw in self._KEYWORDS_HEADER)


class OrangeDetector(BaseOperatorDetector):
    operator_name: OperatorName = "ORANGE"

    _KEYWORDS_FILENAME = ["orange"]
    _KEYWORDS_SHEET = ["orange", "orange_", "orange-"]
    _KEYWORDS_HEADER = ["orange", "nro orange", "central orange", "abonne orange"]

    def detect_from_filename(self, filename: str) -> bool:
        name = filename.lower()
        return any(kw in name for kw in self._KEYWORDS_FILENAME)

    def detect_from_sheet_name(self, sheet_name: str) -> bool:
        name = sheet_name.lower()
        return any(kw in name for kw in self._KEYWORDS_SHEET)

    def detect_from_headers(self, headers: list[str]) -> bool:
        text = " ".join(h.lower() for h in headers if h)
        return any(kw in text for kw in self._KEYWORDS_HEADER)


class InwiDetector(BaseOperatorDetector):
    operator_name: OperatorName = "INWI"

    _KEYWORDS_FILENAME = ["inwi", "inwi_", "inwi-"]
    _KEYWORDS_SHEET = ["inwi", "inwi_", "inwi-"]
    _KEYWORDS_HEADER = ["inwi", "nro inwi", "site inwi", "abonne inwi", "msisdn"]

    def detect_from_filename(self, filename: str) -> bool:
        name = filename.lower()
        return any(kw in name for kw in self._KEYWORDS_FILENAME)

    def detect_from_sheet_name(self, sheet_name: str) -> bool:
        name = sheet_name.lower()
        return any(kw in name for kw in self._KEYWORDS_SHEET)

    def detect_from_headers(self, headers: list[str]) -> bool:
        text = " ".join(h.lower() for h in headers if h)
        return any(kw in text for kw in self._KEYWORDS_HEADER)


class CustomDetector(BaseOperatorDetector):
    """
    Fallback detector — tries to infer operator from column patterns.
    Looks for operator-specific column names in the headers.
    """
    operator_name: OperatorName = "UNKNOWN"

    # Mapping of column patterns to operators
    _PATTERNS: dict[OperatorName, list[str]] = {
        "IAM": ["centrale", "sous repartiteur", "point branchement", "pb", "sr"],
        "ORANGE": ["nro orange", "central orange", "abonne orange", "dossier orange"],
        "INWI": ["nro inwi", "site inwi", "msisdn", "order id", "commande inwi"],
    }

    def detect_from_filename(self, filename: str) -> bool:
        return False  # CustomDetector is a fallback, not filename-based

    def detect_from_sheet_name(self, sheet_name: str) -> bool:
        return False

    def detect_from_headers(self, headers: list[str]) -> bool:
        return False  # Used differently — see detect()

    def detect(self, headers: list[str]) -> OperatorName:
        """Score each operator based on header matches."""
        text = " ".join(h.lower() for h in headers if h)
        scores: dict[OperatorName, int] = {"IAM": 0, "ORANGE": 0, "INWI": 0}

        for operator, patterns in self._PATTERNS.items():
            for pattern in patterns:
                if pattern in text:
                    scores[operator] += 1

        best = max(scores, key=scores.get)  # type: ignore
        if scores[best] > 0:
            return best
        return "UNKNOWN"


class OperatorDetector:
    """
    Orchestrator that runs all detectors in priority order.
    Detection priority:
      1. Filename analysis
      2. Sheet name analysis
      3. Header content analysis
      4. Custom column-pattern fallback
    """

    def __init__(self):
        self._detectors: list[BaseOperatorDetector] = [
            IAMDetector(),
            OrangeDetector(),
            InwiDetector(),
        ]
        self._fallback = CustomDetector()

    def detect(
        self,
        filename: str,
        workbook: Optional[list] = None,
    ) -> OperatorName:
        """
        Detect operator from filename and/or workbook content.
        Returns one of: IAM, ORANGE, INWI, UNKNOWN.
        """
        # 1. Filename detection
        for detector in self._detectors:
            if detector.detect_from_filename(filename):
                return detector.operator_name

        if not workbook:
            return "UNKNOWN"

        # 2. Sheet name detection
        for sheet in workbook:
            sheet_name = sheet.get("sheet", "")
            for detector in self._detectors:
                if detector.detect_from_sheet_name(sheet_name):
                    return detector.operator_name

        # 3. Header content detection
        for sheet in workbook:
            rows = sheet.get("rows", [])
            if not rows:
                continue
            headers = [
                str(cell.get("value") or "").strip()
                for cell in rows[0]
            ]
            for detector in self._detectors:
                if detector.detect_from_headers(headers):
                    return detector.operator_name

        # 4. Custom fallback — column pattern scoring
        for sheet in workbook:
            rows = sheet.get("rows", [])
            if not rows:
                continue
            headers = [
                str(cell.get("value") or "").strip()
                for cell in rows[0]
            ]
            result = self._fallback.detect(headers)
            if result != "UNKNOWN":
                return result

        return "UNKNOWN"

    def get_profile(self, operator: OperatorName) -> dict:
        """Get the operator profile for a detected operator."""
        return OPERATOR_PROFILES.get(operator, OPERATOR_PROFILES["UNKNOWN"])


# Singleton for convenience
_default_detector = OperatorDetector()


def detect_operator(
    filename: str,
    workbook: Optional[list] = None,
) -> OperatorName:
    """Convenience function — uses the default OperatorDetector singleton."""
    return _default_detector.detect(filename, workbook)