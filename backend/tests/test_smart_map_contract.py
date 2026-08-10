from types import SimpleNamespace

import pytest

from backend.logic.mapping.ftth_network_layer import FTTHNetworkLayer


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _DB:
    def __init__(self, rows):
        self.rows = rows

    async def execute(self, _query):
        return _Result(self.rows)


@pytest.mark.asyncio
async def test_network_layer_omits_unknown_geometry_instead_of_inventing_it():
    unknown = SimpleNamespace(
        nro="NRO-CASA",
        avg_latitude=None,
        avg_longitude=None,
        count=3,
    )

    assert await FTTHNetworkLayer(_DB([unknown])).get_nro_positions() == []


@pytest.mark.asyncio
async def test_network_layer_preserves_real_aggregated_geometry():
    known = SimpleNamespace(
        nro="NRO-CASA",
        avg_latitude=33.58,
        avg_longitude=-7.60,
        count=3,
    )

    points = await FTTHNetworkLayer(_DB([known])).get_nro_positions()

    assert points[0]["lat"] == 33.58
    assert points[0]["lng"] == -7.60


def test_network_layer_has_no_random_or_placeholder_operational_values():
    import inspect
    from backend.logic.mapping import ftth_network_layer

    source = inspect.getsource(ftth_network_layer)
    assert "random." not in source
    assert 'or "N/A"' not in source
