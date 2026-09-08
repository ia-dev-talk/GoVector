import pytest

from tools.qfield_roundtrip_smoke import _safe_base_url


def test_qfield_smoke_allows_local_http_for_development():
    assert _safe_base_url("http://localhost:8080/") == "http://localhost:8080"
    assert _safe_base_url("http://127.0.0.1:8080") == "http://127.0.0.1:8080"


def test_qfield_smoke_allows_remote_https():
    assert _safe_base_url("https://pilot.bluevector.example/") == "https://pilot.bluevector.example"


def test_qfield_smoke_rejects_remote_plain_http():
    with pytest.raises(SystemExit, match="HTTPS"):
        _safe_base_url("http://pilot.bluevector.example")


def test_qfield_smoke_rejects_credentials_in_base_url():
    with pytest.raises(SystemExit, match="credentials"):
        _safe_base_url("https://admin:secret@pilot.bluevector.example")
