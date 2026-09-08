"""Safe, non-business Praxedo sandbox read diagnostics.

The smoke call proves that configured auth + one documented GET operation work
without returning Praxedo business data to the diagnostics API. Only response
shape (kind, top-level keys, array length) is exposed.
"""

from __future__ import annotations

import math
import re
from typing import Any, Mapping

from backend.integrations.praxedo.client import PraxedoClient
from backend.integrations.praxedo.readiness import DELIVERY_REQUIRED_READ_OPERATIONS


class PraxedoSmokeError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


_ALLOWED_OPERATIONS = frozenset(DELIVERY_REQUIRED_READ_OPERATIONS)
_PARAM_KEY = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
_MAX_PARAMS = 30
_MAX_VALUE_LENGTH = 512


def _safe_parameters(
    raw: Mapping[str, Any] | None,
    *,
    field: str,
) -> dict[str, str | int | float | bool]:
    if raw is None:
        return {}
    if not isinstance(raw, Mapping) or len(raw) > _MAX_PARAMS:
        raise PraxedoSmokeError("invalid_parameters", f"{field} invalide")
    result: dict[str, str | int | float | bool] = {}
    for key, value in raw.items():
        name = str(key)
        if not _PARAM_KEY.fullmatch(name):
            raise PraxedoSmokeError("invalid_parameter_name", f"Nom de paramètre invalide dans {field}")
        if isinstance(value, bool):
            result[name] = value
        elif isinstance(value, int):
            result[name] = value
        elif isinstance(value, float):
            if not math.isfinite(value):
                raise PraxedoSmokeError("invalid_parameter_value", f"Valeur invalide dans {field}")
            result[name] = value
        elif isinstance(value, str):
            if len(value) > _MAX_VALUE_LENGTH or any(char in value for char in "\r\n"):
                raise PraxedoSmokeError("invalid_parameter_value", f"Valeur invalide dans {field}")
            result[name] = value
        else:
            raise PraxedoSmokeError(
                "invalid_parameter_value",
                f"{field} accepte uniquement chaîne, nombre ou booléen",
            )
    return result


def _object_shape(value: Mapping[Any, Any]) -> dict[str, Any]:
    keys = sorted(str(key) for key in value.keys())[:50]
    return {
        "kind": "json_object",
        "key_count": len(value),
        "keys": keys,
        "keys_truncated": len(value) > len(keys),
    }


def describe_response(value: Any) -> dict[str, Any]:
    """Describe response structure without including business values."""

    if value is None:
        return {"kind": "empty"}
    if isinstance(value, Mapping):
        return _object_shape(value)
    if isinstance(value, list):
        description: dict[str, Any] = {
            "kind": "json_array",
            "length": len(value),
        }
        if value:
            first = value[0]
            if isinstance(first, Mapping):
                description["item_shape"] = _object_shape(first)
            elif first is None:
                description["item_shape"] = {"kind": "empty"}
            else:
                description["item_shape"] = {"kind": type(first).__name__}
        return description
    if isinstance(value, str):
        return {"kind": "text", "length": len(value)}
    return {"kind": type(value).__name__}


async def smoke_read(
    client: PraxedoClient,
    *,
    operation: str,
    path_params: Mapping[str, Any] | None = None,
    params: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_operation = str(operation or "").strip()
    if normalized_operation not in _ALLOWED_OPERATIONS:
        raise PraxedoSmokeError(
            "operation_not_allowed",
            "Le smoke Praxedo est limité aux opérations de lecture de la recette",
        )
    safe_path = _safe_parameters(path_params, field="path_params")
    safe_query = _safe_parameters(params, field="params")
    response = await client.get(
        normalized_operation,
        path_params=safe_path,
        params=safe_query,
    )
    return {
        "ok": True,
        "operation": normalized_operation,
        "response": describe_response(response),
        "business_values_exposed": False,
    }
