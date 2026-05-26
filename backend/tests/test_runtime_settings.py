from fastapi.testclient import TestClient

from app.main import app


def test_runtime_settings_persist_and_reset_without_secret_fields():
    client = TestClient(app)

    response = client.put(
        "/api/settings/runtime",
        json={
            "default_provider": "openai",
            "default_model": "gpt-4.1-mini",
            "context_window_messages": 12,
            "context_window_tokens": 2400,
            "preview_chars": 900,
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "default_provider": "openai",
        "default_model": "gpt-4.1-mini",
        "context_window_messages": 12,
        "context_window_tokens": 2400,
        "preview_chars": 900,
    }

    saved = client.get("/api/settings/runtime")
    assert saved.status_code == 200
    assert saved.json()["default_provider"] == "openai"
    assert "ingestion_api_key" not in saved.text

    reset = client.post("/api/settings/runtime/reset")
    assert reset.status_code == 200
    assert reset.json()["default_provider"] == "mock"


def test_runtime_settings_validate_bounds():
    client = TestClient(app)

    response = client.put(
        "/api/settings/runtime",
        json={
            "default_provider": "openai",
            "default_model": "",
            "context_window_messages": 0,
            "context_window_tokens": 100,
            "preview_chars": 40,
        },
    )

    assert response.status_code == 422


def test_provider_status_reports_selected_provider_and_key_readiness():
    client = TestClient(app)
    client.put(
        "/api/settings/runtime",
        json={
            "default_provider": "openai",
            "default_model": "gpt-4.1-mini",
            "context_window_messages": 8,
            "context_window_tokens": 1200,
            "preview_chars": 500,
        },
    )

    response = client.get("/api/settings/providers/status")

    assert response.status_code == 200
    statuses = {item["provider"]: item for item in response.json()}
    assert statuses["mock"]["configured"] is True
    assert statuses["openai"]["selected"] is True
    assert statuses["openai"]["key_env_var"] == "OPENAI_API_KEY"
    assert "OPENAI_API_KEY" in statuses["openai"]["detail"]


def test_provider_key_can_be_configured_from_settings_without_echoing_secret():
    client = TestClient(app)

    response = client.put("/api/settings/providers/openai/key", json={"api_key": "sk-test-runtime-key"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider"] == "openai"
    assert payload["configured"] is True
    assert payload["key_source"] == "runtime"
    assert "sk-test-runtime-key" not in response.text
    assert payload["detail"] == "Ready. API key configured from Settings."

    statuses = client.get("/api/settings/providers/status").json()
    openai_status = next(item for item in statuses if item["provider"] == "openai")
    assert openai_status["configured"] is True
    assert openai_status["key_source"] == "runtime"
    assert "sk-test-runtime-key" not in str(statuses)
