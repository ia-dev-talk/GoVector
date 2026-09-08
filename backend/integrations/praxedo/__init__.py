"""Praxedo integration boundary.

The concrete tenant contract is intentionally configuration-driven because
Praxedo exposes SOAP/REST APIs whose exact operations and field names must come
from the customer documentation.
"""

from backend.integrations.praxedo.client import PraxedoClient, PraxedoConfig, PraxedoError
from backend.integrations.praxedo.payloads import (
    PraxedoPayloadError,
    canonical_envelope,
    intervention_snapshot,
    stock_movement,
    technician_stock_snapshot,
    work_report,
)

__all__ = [
    "PraxedoClient",
    "PraxedoConfig",
    "PraxedoError",
    "PraxedoPayloadError",
    "canonical_envelope",
    "intervention_snapshot",
    "stock_movement",
    "technician_stock_snapshot",
    "work_report",
]
