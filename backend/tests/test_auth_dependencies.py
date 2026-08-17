import pytest
from fastapi import HTTPException

from backend.auth import dependencies


class NeverExecuteDb:
    async def execute(self, *_args, **_kwargs):
        pytest.fail("database lookup must not run for a malformed JWT subject")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"sub": "not-a-number"},
        {"sub": None},
        ["unexpected", "payload"],
    ],
)
async def test_get_current_user_rejects_malformed_subject_before_db_lookup(
    monkeypatch,
    payload,
):
    monkeypatch.setattr(
        dependencies,
        "decode_token",
        lambda _token: payload,
    )

    with pytest.raises(HTTPException) as error:
        await dependencies.get_current_user(
            token="signed-but-invalid",
            db=NeverExecuteDb(),
        )

    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}
