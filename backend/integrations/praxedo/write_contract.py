"""Fail-closed Praxedo write contract configuration.

BlueVector must not guess either the HTTP method or the business payload contract
for tenant writes.  Delivery code can be prepared in advance, but execution is
enabled only after the customer's official Praxedo contract has been reviewed
and the server is explicitly configured to acknowledge that fact.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Mapping

from backend.integrations.praxedo.readiness import DELIVERY_REQUIRED_WRITE_OPERATIONS


class PraxedoWriteContractError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


_ALLOWED_METHODS = frozenset({"POST", "PUT", "PATCH"})
_ALLOWED_OPERATIONS = frozenset(DELIVERY_REQUIRED_WRITE_OPERATIONS)


def _truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class PraxedoWriteContract:
    confirmed: bool
    contract_version: str
    methods: Mapping[str, str]

    @classmethod
    def from_env(cls) -> "PraxedoWriteContract":
        raw_methods = os.getenv("PRAXEDO_WRITE_METHODS_JSON", "{}")
        try:
            parsed = json.loads(raw_methods)
        except json.JSONDecodeError as exc:
            raise PraxedoWriteContractError(
                "write_methods_json_invalid",
                "PRAXEDO_WRITE_METHODS_JSON est invalide",
            ) from exc
        if not isinstance(parsed, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in parsed.items()
        ):
            raise PraxedoWriteContractError(
                "write_methods_json_invalid",
                "PRAXEDO_WRITE_METHODS_JSON doit être un objet opération/méthode",
            )

        methods: dict[str, str] = {}
        for raw_operation, raw_method in parsed.items():
            operation = raw_operation.strip()
            method = raw_method.strip().upper()
            if operation not in _ALLOWED_OPERATIONS:
                raise PraxedoWriteContractError(
                    "write_operation_unknown",
                    f"Opération d'écriture Praxedo non autorisée : {operation}",
                )
            if method not in _ALLOWED_METHODS:
                raise PraxedoWriteContractError(
                    "write_method_invalid",
                    f"Méthode Praxedo non autorisée pour {operation}",
                )
            methods[operation] = method

        version = str(os.getenv("PRAXEDO_WRITE_CONTRACT_VERSION") or "").strip()
        return cls(
            confirmed=_truthy(os.getenv("PRAXEDO_WRITE_CONTRACT_CONFIRMED")),
            contract_version=version,
            methods=methods,
        )

    def method_for(self, operation: str) -> str:
        operation = str(operation or "").strip()
        if not self.confirmed:
            raise PraxedoWriteContractError(
                "write_contract_not_confirmed",
                "Le contrat d'écriture Praxedo n'est pas confirmé côté serveur",
            )
        if not self.contract_version:
            raise PraxedoWriteContractError(
                "write_contract_version_missing",
                "La version du contrat d'écriture Praxedo est manquante",
            )
        if operation not in _ALLOWED_OPERATIONS:
            raise PraxedoWriteContractError(
                "write_operation_not_allowed",
                "Cette opération n'appartient pas au contrat d'écriture de livraison",
            )
        method = self.methods.get(operation)
        if method is None:
            raise PraxedoWriteContractError(
                "write_method_not_configured",
                f"Méthode Praxedo non configurée : {operation}",
            )
        return method
