from backend.integrations.praxedo.readiness import inspect_praxedo_readiness


def test_empty_environment_is_not_ready_and_exposes_no_secrets():
    report = inspect_praxedo_readiness({})
    assert report["ready_for_read"] is False
    assert report["ready_for_write"] is False
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
    assert "technician_list" in report["missing_read_operations"]
    assert "article_list" in report["missing_read_operations"]
    assert "work_report_write" in report["missing_write_operations"]


def test_complete_contract_is_read_write_ready_but_replay_requires_confirmation():
    env = {
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
    }
    report = inspect_praxedo_readiness(env)
    assert report["ready_for_read"] is True
    assert report["ready_for_write"] is True
    assert report["automated_write_replay_safe"] is False

    env["PRAXEDO_IDEMPOTENCY_HEADER"] = "Idempotency-Key"
    report = inspect_praxedo_readiness(env)
    assert report["automated_write_replay_safe"] is True


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
