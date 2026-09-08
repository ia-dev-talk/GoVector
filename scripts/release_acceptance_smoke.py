#!/usr/bin/env python3
"""BlueVector weekly release acceptance smoke.

Read-only by default and in strict delivery mode. This script never performs a
stock mutation, QField apply, or Praxedo write. It validates the deployed API
surface and authenticated read contracts required before final delivery.
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class SmokeFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class CheckResult:
    name: str
    ok: bool
    detail: str


def _safe_base_url(value: str) -> str:
    value = value.rstrip("/")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme == "https":
        return value
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        return value
    raise SmokeFailure("Une URL distante doit utiliser HTTPS; HTTP est autorisé uniquement en local.")


def _decode_json_response(raw: bytes, url: str) -> Any:
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SmokeFailure(f"Réponse non JSON sur {url}") from exc


def _open_json(request: urllib.request.Request, *, timeout: float) -> Any:
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=ssl.create_default_context(),
        ) as response:
            raw = response.read()
            if response.status < 200 or response.status >= 300:
                raise SmokeFailure(f"HTTP {response.status} sur {request.full_url}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:400]
        raise SmokeFailure(f"HTTP {exc.code} sur {request.full_url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SmokeFailure(
            f"API inaccessible sur {request.full_url}: {exc.reason}"
        ) from exc
    return _decode_json_response(raw, request.full_url)


def _request_json(url: str, *, token: str | None = None, timeout: float = 10.0) -> Any:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers, method="GET")
    return _open_json(request, timeout=timeout)


def _post_json(
    url: str,
    *,
    payload: dict[str, Any],
    token: str | None = None,
    timeout: float = 10.0,
) -> Any:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        url,
        headers=headers,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        method="POST",
    )
    return _open_json(request, timeout=timeout)


def _json_object_argument(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise argparse.ArgumentTypeError("JSON invalide") from exc
    if not isinstance(value, dict):
        raise argparse.ArgumentTypeError("Un objet JSON est requis")
    return value


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def _require_strict_inputs(args: argparse.Namespace) -> None:
    if not args.strict_delivery:
        return
    missing = []
    if not args.technician_token:
        missing.append("--technician-token")
    if not args.admin_token:
        missing.append("--admin-token")
    if not args.dataset_id:
        missing.append("--dataset-id")
    if not args.praxedo_smoke_operation:
        missing.append("--praxedo-smoke-operation")
    if missing:
        raise SmokeFailure("Mode strict: paramètres manquants: " + ", ".join(missing))


def run(args: argparse.Namespace) -> list[CheckResult]:
    _require_strict_inputs(args)
    root = _safe_base_url(args.root_url)
    api = root + "/api/v1"
    results: list[CheckResult] = []

    health = _request_json(root + "/health", timeout=args.timeout)
    _expect(
        isinstance(health, dict) and health.get("status") == "healthy",
        "Le /health n'est pas healthy",
    )
    results.append(
        CheckResult("health", True, f"version={health.get('version', 'unknown')}")
    )

    if args.technician_token:
        stock = _request_json(
            api + "/tech/jobs/stock-v2",
            token=args.technician_token,
            timeout=args.timeout,
        )
        _expect(isinstance(stock, list), "Le stock technicien n'est pas une liste")
        malformed_stock = [
            row
            for row in stock
            if not isinstance(row, dict)
            or "item_id" not in row
            or "available_quantity" not in row
        ]
        _expect(
            not malformed_stock,
            "Le payload stock technicien ne respecte pas le contrat V2",
        )
        available = sum(
            max(int(row.get("available_quantity") or 0), 0) for row in stock
        )
        results.append(
            CheckResult(
                "technician_stock",
                True,
                f"items={len(stock)}, available_units={available}",
            )
        )

        serialized = _request_json(
            api + "/tech/jobs/stock-v2/serialized",
            token=args.technician_token,
            timeout=args.timeout,
        )
        _expect(
            isinstance(serialized, list),
            "Le stock sérialisé technicien n'est pas une liste",
        )
        malformed_serialized = [
            row
            for row in serialized
            if not isinstance(row, dict)
            or "inventory_id" not in row
            or row.get("custody_verified") is not True
            or not (row.get("serial_number") or row.get("mac_address"))
        ]
        _expect(
            not malformed_serialized,
            "Le payload stock sérialisé contient une garde non vérifiée ou une identité équipement incomplète",
        )
        results.append(
            CheckResult(
                "technician_serialized_custody",
                True,
                f"equipment={len(serialized)}",
            )
        )
    else:
        results.append(
            CheckResult(
                "technician_stock",
                True,
                "SKIP: --technician-token non fourni",
            )
        )
        results.append(
            CheckResult(
                "technician_serialized_custody",
                True,
                "SKIP: --technician-token non fourni",
            )
        )

    if args.admin_token:
        readiness = _request_json(
            api + "/audit/integrations/readiness/praxedo",
            token=args.admin_token,
            timeout=args.timeout,
        )
        _expect(
            isinstance(readiness, dict),
            "Le readiness Praxedo n'est pas un objet JSON",
        )
        if args.strict_delivery:
            _expect(
                readiness.get("ready_for_read") is True,
                "Mode strict: Praxedo n'est pas prêt pour une lecture sandbox réelle",
            )
        results.append(
            CheckResult(
                "praxedo_readiness",
                True,
                "ready_for_read=%s ready_for_write=%s" % (
                    readiness.get("ready_for_read"),
                    readiness.get("ready_for_write"),
                ),
            )
        )

        if args.praxedo_smoke_operation:
            probe = _post_json(
                api + "/audit/integrations/praxedo/smoke-read",
                token=args.admin_token,
                timeout=args.timeout,
                payload={
                    "operation": args.praxedo_smoke_operation,
                    "path_params": args.praxedo_path_params,
                    "params": args.praxedo_params,
                },
            )
            _expect(
                isinstance(probe, dict)
                and probe.get("ok") is True
                and probe.get("operation") == args.praxedo_smoke_operation
                and probe.get("business_values_exposed") is False,
                "Le smoke Praxedo lecture seule n'a pas confirmé le contrat attendu",
            )
            response_shape = probe.get("response")
            _expect(
                isinstance(response_shape, dict) and "kind" in response_shape,
                "Le smoke Praxedo n'a pas renvoyé de forme de réponse exploitable",
            )
            results.append(
                CheckResult(
                    "praxedo_sandbox_read",
                    True,
                    "operation=%s response_kind=%s"
                    % (
                        args.praxedo_smoke_operation,
                        response_shape.get("kind"),
                    ),
                )
            )
        else:
            results.append(
                CheckResult(
                    "praxedo_sandbox_read",
                    True,
                    "SKIP: --praxedo-smoke-operation non fourni",
                )
            )

        journal = _request_json(
            api + "/audit/integrations/summary",
            token=args.admin_token,
            timeout=args.timeout,
        )
        _expect(
            isinstance(journal, dict) and "actionable" in journal,
            "Résumé journal intégration invalide",
        )
        results.append(
            CheckResult(
                "integration_journal",
                True,
                f"actionable={journal.get('actionable')} total={journal.get('total')}",
            )
        )

        if args.dataset_id:
            dataset_id = int(args.dataset_id)
            export = _request_json(
                api + f"/gis-datasets/{dataset_id}/qfield-sync",
                token=args.admin_token,
                timeout=args.timeout,
            )
            _expect(
                isinstance(export, dict) and export.get("type") == "FeatureCollection",
                "L'export QField n'est pas un FeatureCollection",
            )
            features = export.get("features")
            _expect(
                isinstance(features, list),
                "L'export QField ne contient pas de features valides",
            )
            results.append(
                CheckResult(
                    "qfield_export",
                    True,
                    f"dataset={dataset_id}, features={len(features)}",
                )
            )
        else:
            results.append(
                CheckResult(
                    "qfield_export",
                    True,
                    "SKIP: --dataset-id non fourni",
                )
            )
    else:
        results.append(
            CheckResult("admin_checks", True, "SKIP: --admin-token non fourni")
        )

    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description="BlueVector weekly non-destructive acceptance smoke"
    )
    parser.add_argument("--root-url", default="http://localhost:8080")
    parser.add_argument("--technician-token")
    parser.add_argument("--admin-token")
    parser.add_argument("--dataset-id", type=int)
    parser.add_argument("--praxedo-smoke-operation")
    parser.add_argument(
        "--praxedo-path-params",
        type=_json_object_argument,
        default={},
        metavar="JSON",
    )
    parser.add_argument(
        "--praxedo-params",
        type=_json_object_argument,
        default={},
        metavar="JSON",
    )
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument(
        "--strict-delivery",
        action="store_true",
        help=(
            "Require technician/admin/dataset inputs, Praxedo read readiness, "
            "and one real tenant read-only smoke operation."
        ),
    )
    args = parser.parse_args()

    try:
        results = run(args)
    except SmokeFailure as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1

    for result in results:
        print(f"PASS {result.name}: {result.detail}")
    print("PASS release_acceptance_smoke: no mutation was performed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
