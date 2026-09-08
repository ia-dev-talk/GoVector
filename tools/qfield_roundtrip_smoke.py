#!/usr/bin/env python3
"""Smoke the BlueVector QField revision-safe round trip.

Export is always read-only. Preview is read-only. Apply requires the explicit
``--apply`` flag so this helper cannot mutate a dataset by accident.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

import httpx


def _json_file(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Impossible de lire {path}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise SystemExit(f"{path} n'est pas une FeatureCollection GeoJSON")
    return payload


def _request_json(client: httpx.Client, method: str, url: str, **kwargs) -> dict:
    response = client.request(method, url, **kwargs)
    if response.status_code >= 400:
        body = response.text[:1000]
        raise SystemExit(f"HTTP {response.status_code} sur {url}: {body}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise SystemExit(f"Réponse JSON invalide sur {url}") from exc
    if not isinstance(payload, dict):
        raise SystemExit(f"Réponse inattendue sur {url}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="BlueVector QField round-trip smoke test")
    parser.add_argument(
        "--base-url",
        default=os.getenv("BLUEVECTOR_BASE_URL", "http://localhost:8080"),
        help="BlueVector API origin (default: BLUEVECTOR_BASE_URL or localhost:8080)",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("BLUEVECTOR_ADMIN_TOKEN"),
        help="Admin bearer token (prefer BLUEVECTOR_ADMIN_TOKEN env var)",
    )
    parser.add_argument("--dataset-id", required=True, type=int)
    parser.add_argument("--layer-id", type=int)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("bluevector-qfield-export.geojson"),
    )
    parser.add_argument(
        "--changed-file",
        type=Path,
        help="Modified GeoJSON to preview (and optionally apply)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the changed file only after a conflict-free preview",
    )
    args = parser.parse_args()

    if args.dataset_id <= 0 or (args.layer_id is not None and args.layer_id <= 0):
        parser.error("dataset/layer ids must be positive")
    if args.apply and args.changed_file is None:
        parser.error("--apply requires --changed-file")
    if not args.token:
        parser.error("Admin token missing; set BLUEVECTOR_ADMIN_TOKEN or --token")

    base = args.base_url.rstrip("/")
    root = f"{base}/api/v1/gis-datasets/{args.dataset_id}/qfield-sync"
    headers = {"Authorization": f"Bearer {args.token}", "Accept": "application/json"}

    with httpx.Client(headers=headers, timeout=30.0, follow_redirects=False) as client:
        params = {"layer_id": args.layer_id} if args.layer_id is not None else None
        exported = _request_json(client, "GET", root, params=params)
        args.output.write_text(
            json.dumps(exported, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"EXPORT_OK {args.output} features={len(exported.get('features', []))}")

        if args.changed_file is None:
            return 0

        changed = _json_file(args.changed_file)
        preview = _request_json(client, "POST", f"{root}/preview", json=changed)
        print(
            "PREVIEW_OK "
            f"apply={preview.get('apply_count', 0)} "
            f"noop={preview.get('noop_count', 0)} "
            f"conflicts={preview.get('conflict_count', 0)}"
        )
        if int(preview.get("conflict_count") or 0) > 0:
            print("APPLY_BLOCKED conflicts detected", file=sys.stderr)
            return 2

        if not args.apply:
            print("APPLY_SKIPPED use --apply for an explicit write")
            return 0

        applied = _request_json(client, "POST", f"{root}/apply", json=changed)
        print(
            "APPLY_OK "
            f"status={applied.get('status')} "
            f"applied={applied.get('applied_count', 0)} "
            f"dataset_revision={applied.get('dataset_revision')}"
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
