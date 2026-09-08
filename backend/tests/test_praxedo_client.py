import asyncio

import httpx
import pytest

from backend.integrations.praxedo.client import PraxedoClient, PraxedoConfig, PraxedoError


def _basic_config(**overrides):
    values = {
        "base_url": "https://sandbox.example.test/root/",
        "auth_mode": "basic",
        "endpoints": {"job": "api/jobs/{job_id}", "consumption": "api/consumptions"},
        "username": "bluevector-test",
        "password": "secret",
        "max_retries": 0,
    }
    values.update(overrides)
    return PraxedoConfig(**values)


def test_config_rejects_non_https_base_url():
    with pytest.raises(ValueError):
        _basic_config(base_url="http://example.test/")


def test_config_rejects_absolute_operation_endpoint():
    with pytest.raises(ValueError):
        _basic_config(endpoints={"job": "https://evil.example/jobs"})


def test_unconfigured_operation_fails_closed():
    client = PraxedoClient(_basic_config(), client=httpx.AsyncClient())
    with pytest.raises(PraxedoError) as exc_info:
        client.endpoint("unknown")
    assert exc_info.value.code == "operation_not_configured"
    asyncio.run(client._client.aclose())


def test_basic_get_uses_configured_relative_path_and_auth():
    async def run():
        observed = {}

        def handler(request: httpx.Request) -> httpx.Response:
            observed["url"] = str(request.url)
            observed["authorization"] = request.headers.get("Authorization")
            return httpx.Response(200, json={"id": "PXO-42"}, request=request)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as raw_client:
            client = PraxedoClient(_basic_config(), client=raw_client)
            result = await client.get("job", path_params={"job_id": 42})

        assert observed["url"] == "https://sandbox.example.test/root/api/jobs/42"
        assert observed["authorization"].startswith("Basic ")
        assert result == {"id": "PXO-42"}

    asyncio.run(run())


def test_idempotency_header_is_only_sent_when_explicitly_configured():
    async def run():
        observed = {}

        def handler(request: httpx.Request) -> httpx.Response:
            observed.update(dict(request.headers))
            return httpx.Response(204, request=request)

        config = _basic_config(idempotency_header="Idempotency-Key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
            client = PraxedoClient(config, client=raw_client)
            result = await client.post(
                "consumption",
                json_body={"quantity": 1},
                idempotency_key="bv-event-123",
            )

        assert result is None
        assert observed["idempotency-key"] == "bv-event-123"

    asyncio.run(run())
