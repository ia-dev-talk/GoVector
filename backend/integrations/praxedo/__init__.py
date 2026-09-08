"""Praxedo integration boundary.

The concrete tenant contract is intentionally configuration-driven because
Praxedo exposes SOAP/REST APIs whose exact operations and field names must come
from the customer documentation.
"""

from backend.integrations.praxedo.client import PraxedoClient, PraxedoConfig, PraxedoError

__all__ = ["PraxedoClient", "PraxedoConfig", "PraxedoError"]
