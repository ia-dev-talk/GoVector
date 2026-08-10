from backend.auth.security import get_password_hash, verify_password


def test_verify_password_requires_the_stored_password_hash() -> None:
    password_hash = get_password_hash("correct-password")

    assert verify_password("correct-password", password_hash) is True
    assert verify_password("master123", password_hash) is False
