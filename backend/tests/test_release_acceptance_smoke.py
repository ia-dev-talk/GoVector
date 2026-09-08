from __future__ import annotations

import importlib.util
import sys
from argparse import Namespace
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "release_acceptance_smoke.py"
spec = importlib.util.spec_from_file_location("release_acceptance_smoke", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def _args(**overrides):
    values = {
        "root_url": "http://localhost:8080",
        "technician_token": "tech-token",
        "admin_token": "admin-token",
        "dataset_id": 12,
        "praxedo_smoke_operation": "technician_list",
        "praxedo_path_params": {},
        "praxedo_params": {"limit": 1},
        "timeout": 5.0,
        "strict_delivery": False,
    }
    values.update(overrides)
    return Namespace(**values)


def test_remote_http_is_rejected():
    with pytest.raises(module.SmokeFailure, match="HTTPS"):
        module._safe_base_url("http://example.test")


def test_local_http_is_allowed_and_trailing_slash_removed():
    assert module._safe_base_url("http://127.0.0.1:8080/") == "http://127.0.0.1:8080"


def test_https_remote_is_allowed():
    assert module._safe_base_url("https://bluevector.example.test/") == "https://bluevector.example.test"


def test_cli_json_params_require_object():
    assert module._json_object_argument('{"limit":1}') == {"limit": 1}
    with pytest.raises(Exception):
        module._json_object_argument("[]")


def test_read_only_smoke_checks_expected_contracts(monkeypatch):
    responses = {
        "http://localhost:8080/health": {"status": "healthy", "version": "rc"},
        "http://localhost:8080/api/v1/tech/jobs/stock-v2": [
            {"item_id": 7, "available_quantity": 3}
        ],
        "http://localhost:8080/api/v1/tech/jobs/stock-v2/serialized": [
            {
                "inventory_id": 22,
                "serial_number": "ONT-22",
                "mac_address": "AA:BB:CC:DD:EE:22",
                "custody_verified": True,
            }
        ],
        "http://localhost:8080/api/v1/audit/integrations/readiness/praxedo": {
            "ready_for_read": True,
            "ready_for_write": False,
        },
        "http://localhost:8080/api/v1/audit/integrations/summary": {
            "total": 2,
            "actionable": 1,
        },
        "http://localhost:8080/api/v1/gis-datasets/12/qfield-sync": {
            "type": "FeatureCollection",
            "features": [{"type": "Feature"}],
        },
    }

    def fake_request(url, *, token=None, timeout=10.0):
        assert token in {None, "tech-token", "admin-token"}
        assert timeout == 5.0
        return responses[url]

    def fake_post(url, *, payload, token=None, timeout=10.0):
        assert url.endswith("/audit/integrations/praxedo/smoke-read")
        assert token == "admin-token"
        assert timeout == 5.0
        assert payload == {
            "operation": "technician_list",
            "path_params": {},
            "params": {"limit": 1},
        }
        return {
            "ok": True,
            "operation": "technician_list",
            "response": {"kind": "json_array", "length": 1},
            "business_values_exposed": False,
        }

    monkeypatch.setattr(module, "_request_json", fake_request)
    monkeypatch.setattr(module, "_post_json", fake_post)
    results = module.run(_args())

    names = {result.name for result in results}
    assert names == {
        "health",
        "technician_stock",
        "technician_serialized_custody",
        "praxedo_readiness",
        "praxedo_sandbox_read",
        "integration_journal",
        "qfield_export",
    }


def test_stock_contract_failure_is_explicit(monkeypatch):
    def fake_request(url, *, token=None, timeout=10.0):
        if url.endswith("/health"):
            return {"status": "healthy"}
        if url.endswith("/stock-v2"):
            return [{"item_id": 1}]
        raise AssertionError(url)

    monkeypatch.setattr(module, "_request_json", fake_request)
    with pytest.raises(module.SmokeFailure, match="stock technicien"):
        module.run(
            _args(
                admin_token=None,
                dataset_id=None,
                praxedo_smoke_operation=None,
            )
        )


def test_serialized_custody_must_be_server_verified(monkeypatch):
    responses = {
        "http://localhost:8080/health": {"status": "healthy"},
        "http://localhost:8080/api/v1/tech/jobs/stock-v2": [],
        "http://localhost:8080/api/v1/tech/jobs/stock-v2/serialized": [
            {
                "inventory_id": 4,
                "serial_number": "FOREIGN",
                "custody_verified": False,
            }
        ],
    }

    monkeypatch.setattr(
        module,
        "_request_json",
        lambda url, *, token=None, timeout=10.0: responses[url],
    )
    with pytest.raises(module.SmokeFailure, match="garde non vérifiée"):
        module.run(
            _args(
                admin_token=None,
                dataset_id=None,
                praxedo_smoke_operation=None,
            )
        )


def test_strict_delivery_requires_all_inputs_including_real_praxedo_probe():
    with pytest.raises(module.SmokeFailure, match="praxedo-smoke-operation"):
        module.run(
            _args(
                praxedo_smoke_operation=None,
                strict_delivery=True,
            )
        )


def test_strict_delivery_requires_real_praxedo_readiness(monkeypatch):
    responses = {
        "http://localhost:8080/health": {"status": "healthy"},
        "http://localhost:8080/api/v1/tech/jobs/stock-v2": [],
        "http://localhost:8080/api/v1/tech/jobs/stock-v2/serialized": [],
        "http://localhost:8080/api/v1/audit/integrations/readiness/praxedo": {
            "ready_for_read": False,
            "ready_for_write": False,
        },
    }

    monkeypatch.setattr(
        module,
        "_request_json",
        lambda url, *, token=None, timeout=10.0: responses[url],
    )
    with pytest.raises(module.SmokeFailure, match="Praxedo"):
        module.run(_args(strict_delivery=True))


def test_praxedo_probe_must_prove_read_only_redaction(monkeypatch):
    responses = {
        "http://localhost:8080/health": {"status": "healthy"},
        "http://localhost:8080/api/v1/tech/jobs/stock-v2": [],
        "http://localhost:8080/api/v1/tech/jobs/stock-v2/serialized": [],
        "http://localhost:8080/api/v1/audit/integrations/readiness/praxedo": {
            "ready_for_read": True,
            "ready_for_write": False,
        },
    }
    monkeypatch.setattr(
        module,
        "_request_json",
        lambda url, *, token=None, timeout=10.0: responses[url],
    )
    monkeypatch.setattr(
        module,
        "_post_json",
        lambda *args, **kwargs: {
            "ok": True,
            "operation": "technician_list",
            "response": {"kind": "json_array"},
            "business_values_exposed": True,
        },
    )
    with pytest.raises(module.SmokeFailure, match="contrat attendu"):
        module.run(_args(admin_token="admin-token", dataset_id=None))
