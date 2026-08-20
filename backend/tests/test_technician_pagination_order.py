import pytest

from backend.database.models import Technician
from backend.logic import technicians as tech_logic


class _ScalarRows:
    def all(self):
        return []


class _Result:
    def scalars(self):
        return _ScalarRows()


class _RecordingSession:
    def __init__(self):
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _Result()


def _assert_deterministic_id_order(statement):
    order_by = list(statement._order_by_clauses)
    assert len(order_by) == 1
    assert order_by[0].compare(Technician.id.asc())


@pytest.mark.asyncio
async def test_all_technicians_pagination_orders_by_unique_id():
    db = _RecordingSession()

    await tech_logic.get_all_technicians(db, skip=500, limit=500)

    statement = db.statements[-1]
    _assert_deterministic_id_order(statement)
    assert statement._offset_clause.value == 500
    assert statement._limit_clause.value == 500


@pytest.mark.asyncio
async def test_orienteur_technician_pagination_orders_by_unique_id():
    db = _RecordingSession()

    await tech_logic.get_technicians_by_orienteur(
        db,
        orienteur_id=17,
        skip=500,
        limit=500,
    )

    statement = db.statements[-1]
    _assert_deterministic_id_order(statement)
    assert statement._offset_clause.value == 500
    assert statement._limit_clause.value == 500
