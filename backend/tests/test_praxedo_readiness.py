from backend.integrations.praxedo.readiness import inspect_praxedo_readiness


def _complete_env():
    return {
        "PRAXEDO_BASE_URL": "https://sandbox.example.test/",
        "PRAXEDO_AUTH_MODE": "basic",
        "PRAXEDO_USERNAME": "user",
        "PRAXEDO_PASSWORD": "secret",
        "PRAXEDO_ENDPOINTS_JSON": (
            '{"technician_list":"api/technicians",'
            '"intervention_get":"api/interventions/{id}",'
            '"article_list":"api/articles",'
            '"work_report_write":"api/reports",'
            '"stock_movement_write":"api/stock-movements"}'
        ),
        "PRAXEDO_WRITE_CONTRACT_CONFIRMED": "true",
        "PRAXEDO_WRITE_CONTRACT_VERSION": "tenant-v1",
        "PRAXEDO_WRITE_METHODS_JSON": (
            '{"work_report_write":"PATCH",'
            '"stock_movement_write":"POST"}'
        ),
    }


def test_empty_environment_is_not_ready_and_exposes_no_secrets():
    report = inspect_praxedo_readiness({})
    assert report["ready_for_read"] is False
    assert report["ready_for_write"] is False
    assert report["write_contract_ready"] is False
    assert report["automated_write_replay_safe"] is False
    assert report["secrets_exposed"] is False
    assert "base_url" in report["missing"]


def test_basic_delivery_contract_reports_missing_operations():
    report = inspect_praxedo_readiness(
        {
            "PRAXEDO_BASE_URL": "https://sandbox.example.test/",
            "PRAXEDO_AUTH_MODE": "basic",
            "PRAXEDO_USERNAME": "user",
            "PRAXEDO_PASSWORD": "secret",
            "PRAXEDO_ENDPOINTS_JSON": '{"intervention_get":"api/interventions/{id}"}',
        }
    )
    assert report["configured"] is True
    assert report["ready_for_read"] is False
    assert report["ready_for_write"] is False
    assert "technician_list" in report["missing_read_operations"]
    assert "article_list" in report["missing_read_operations"]
    assert "work_report_write" in report["missing_write_operations"]
    assert "write_contract_confirmation" in report["missing"]


def test_endpoints_alone_never_mark_write_ready_without_confirmed_contract():
    env = _complete_env()
    env.pop("PRAXEDO_WRITE_CONTRACT_CONFIRMED")
    env.pop("PRAXEDO_WRITE_CONTRACT_VERSION")
    env.pop("PRAXEDO_WRITE_METHODS_JSON")

    report = inspect_praxedo_readiness(env)
    assert report["ready_for_read"] is True
    assert report["ready_for_write"] is False
    assert report["write_contract_ready"] is False
    assert "write_contract_confirmation" in report["missing"]
    assert "write_contract_version" in report["missing"]
    assert "work_report_write" in report["missing_write_method_aliases"]


def test_complete_confirmed_contract_is_read_write_ready_but_replay_requires_idempotency():
    env = _complete_env()
    report = inspect_praxedo_readiness(env)
    assert report["ready_for_read"] is True
    assert report["write_contract_ready"] is True
    assert report["ready_for_write"] is True
    assert report["configured_write_method_aliases"] == [
        "stock_movement_write",
        "work_report_write",
    ]
    assert report["automated_write_replay_safe"] is False

    env["PRAXEDO_IDEMPOTENCY_HEADER"] = "Idempotency-Key"
    report = inspect_praxedo_readiness(env)
    assert report["automated_write_replay_safe"] is True


def test_invalid_write_method_cannot_report_write_ready():
    env = _complete_env()
    env["PRAXEDO_WRITE_METHODS_JSON"] = (
        '{"work_report_write":"DELETE",'
        '"stock_movement_write":"POST"}'
    )
    report = inspect_praxedo_readiness(env)
    assert report["ready_for_read"] is True
    assert report["write_methods_json_valid"] is False
    assert report["ready_for_write"] is False
    assert "write_methods_json" in report["missing"]


def test_oauth_requires_https_token_url_and_credentials():
    report = inspect_praxedo_readiness(
        {
            "PRAXEDO_BASE_URL": "https://sandbox.example.test/",
            "PRAXEDO_AUTH_MODE": "oauth2",
            "PRAXEDO_CLIENT_ID": "id",
            "PRAXEDO_CLIENT_SECRET": "secret",
            "PRAXEDO_TOKEN_URL": "http://token.example.test/oauth/token",
            "PRAXEDO_ENDPOINTS_JSON": "{}",
        }
    )
    assert report["configured"] is False
    assert "oauth_token_url_https" in report["missing"]


def test_invalid_headers_timeout_and_retries_cannot_report_ready():
    report = inspect_praxedo_readiness(
        {
            "PRAXEDO_BASE_URL": "https://sandbox.example.test/",
            "PRAXEDO_AUTH_MODE": "basic",
            "PRAXEDO_USERNAME": "user",
            "PRAXEDO_PASSWORD": "secret",
            "PRAXEDO_ENDPOINTS_JSON": "{}",
            "PRAXEDO_HEADERS_JSON": "[]",
            "PRAXEDO_TIMEOUT_SECONDS": "not-a-number",
            "PRAXEDO_MAX_RETRIES": "-1",
        }
    )
    assert report["configured"] is False
    assert "headers_json" in report["missing"]
    assert "timeout_seconds" in report["missing"]
    assert "max_retries" in report["missing"]


def test_invalid_idempotency_header_is_never_marked_replay_safe():
    env = _complete_env()
    env["PRAXEDO_IDEMPOTENCY_HEADER"] = "Bad:Header"
    report = inspect_praxedo_readiness(env)
    assert report["ready_for_write"] is True
    assert report["idempotency_header_configured"] is True
    assert report["idempotency_header_valid"] is False
    assert report["automated_write_replay_safe"] is False
    assert "idempotency_header" in report["missing"]
