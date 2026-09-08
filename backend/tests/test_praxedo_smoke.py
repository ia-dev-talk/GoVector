import asyncio

import pytest
from fastapi import HTTPException

from backend.api.routes import audit
from backend.integrations.praxedo.client import PraxedoClient, PraxedoConfig
from backend.integrations.praxedo.smoke import PraxedoSmokeError, describe_response, smoke_read


def _config(**overrides):
    values = {
        "base_url": "https://sandbox.example.test/root/",
        "auth_mode": "basic",
        "endpoints": {
            "technician_list": "api/technicians",
            "intervention_get": "api/interventions/{external_id}",
            "article_list": "api/articles",
        },
        "username": "bluevector-test",
        "password": "secret",
        "max_retries": 0,
    }
    values.update(overrides)
    return PraxedoConfig(**values)


def test_path_parameters_are_url_encoded_before_tenant_request():
    client = PraxedoClient(_config(), client=None)
    try:
        url = client.endpoint(
            "intervention_get",
            external_id="PXO/42 ?customer=other",
        )
        assert url == (
            "https://sandbox.example.test/root/api/interventions/"
            "PXO%2F42%20%3Fcustomer%3Dother"
        )
    finally:
        asyncio.run(client._client.aclose())


def test_response_description_never_returns_business_values():
    source = {
        "customerName": "SECRET CUSTOMER",
        "technicianId": "TECH-999",
        "status": "DONE",
    }
    result = describe_response(source)
    assert result["kind"] == "json_object"
    assert result["key_count"] == 3
    assert "customerName" in result["keys"]
    serialized = repr(result)
    assert "SECRET CUSTOMER" not in serialized
    assert "TECH-999" not in serialized
    assert "DONE" not in serialized


def test_response_description_array_exposes_shape_not_item_values():
    source = [{"id": "PXO-42", "name": "Sensitive name"}]
    result = describe_response(source)
    assert result["kind"] == "json_array"
    assert result["length"] == 1
    assert result["item_shape"]["keys"] == ["id", "name"]
    serialized = repr(result)
    assert "PXO-42" not in serialized
    assert "Sensitive name" not in serialized


def test_smoke_rejects_write_operation_alias():
    class FakeClient:
        async def get(self, *args, **kwargs):
            raise AssertionError("network must not be called")

    async def run():
        with pytest.raises(PraxedoSmokeError) as exc_info:
            await smoke_read(FakeClient(), operation="stock_movement_write")
        assert exc_info.value.code == "operation_not_allowed"

    asyncio.run(run())


def test_smoke_rejects_nested_or_crlf_parameters_before_network():
    class FakeClient:
        async def get(self, *args, **kwargs):
            raise AssertionError("network must not be called")

    async def run_nested():
        with pytest.raises(PraxedoSmokeError) as exc_info:
            await smoke_read(
                FakeClient(),
                operation="technician_list",
                params={"filter": {"role": "tech"}},
            )
        assert exc_info.value.code == "invalid_parameter_value"

    async def run_crlf():
        with pytest.raises(PraxedoSmokeError) as exc_info:
            await smoke_read(
                FakeClient(),
                operation="technician_list",
                params={"filter": "ok\r\nX-Injected: true"},
            )
        assert exc_info.value.code == "invalid_parameter_value"

    asyncio.run(run_nested())
    asyncio.run(run_crlf())


def test_smoke_calls_only_whitelisted_get_and_returns_shape():
    class FakeClient:
        def __init__(self):
            self.calls = []

        async def get(self, operation, *, path_params=None, params=None):
            self.calls.append((operation, path_params, params))
            return [{"id": "PXO-1", "name": "private"}]

    async def run():
        client = FakeClient()
        result = await smoke_read(
            client,
            operation="technician_list",
            params={"limit": 1},
        )
        assert client.calls == [("technician_list", {}, {"limit": 1})]
        assert result["ok"] is True
        assert result["business_values_exposed"] is False
        assert result["response"]["kind"] == "json_array"
        assert "private" not in repr(result)

    asyncio.run(run())


def test_admin_route_returns_safe_config_error(monkeypatch):
    def fail_config():
        raise ValueError("PRAXEDO_BASE_URL doit être une URL HTTPS absolue")

    monkeypatch.setattr(audit.PraxedoConfig, "from_env", fail_config)
    payload = audit.PraxedoSmokeReadRequest(operation="technician_list")

    async def run():
        with pytest.raises(HTTPException) as exc_info:
            await audit.run_praxedo_sandbox_read_smoke(
                payload,
                _current_user=object(),
            )
        assert exc_info.value.status_code == 409
        assert exc_info.value.detail["code"] == "praxedo_config_invalid"

    asyncio.run(run())
