from app.core.redaction import redact_payload, redact_text


def test_redacts_pii_and_secrets_with_typed_placeholders():
    text = "email me at v@example.com with Bearer sk-secret123456789012345 and SSN 123-45-6789"
    result = redact_text(text)

    assert "v@example.com" not in result.redacted
    assert "sk-secret" not in result.redacted
    assert "123-45-6789" not in result.redacted
    assert "[EMAIL_REDACTED]" in result.redacted
    assert "[API_KEY_REDACTED]" in result.redacted
    assert "[SSN_REDACTED]" in result.redacted
    assert result.metadata["email"] == 1


def test_redacts_jwt_private_key_cookie_and_provider_keys():
    private_key = "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----"
    text = (
        "jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456 "
        "Cookie: sid=secret-session; theme=dark "
        "github ghp_abcdefghijklmnopqrstuvwxyz123456 "
        f"{private_key}"
    )

    result = redact_text(text)

    assert "eyJhbGci" not in result.redacted
    assert "ghp_" not in result.redacted
    assert "BEGIN PRIVATE KEY" not in result.redacted
    assert "sid=secret-session" not in result.redacted
    assert "[JWT_REDACTED]" in result.redacted
    assert "[COOKIE_REDACTED]" in result.redacted
    assert "[API_KEY_REDACTED]" in result.redacted
    assert "[PRIVATE_KEY_REDACTED]" in result.redacted


def test_redact_payload_recurses():
    payload, counts = redact_payload({"nested": ["token=abcdef1234567890", "x@y.com"]})

    assert payload["nested"][0] == "[SECRET_REDACTED]"
    assert payload["nested"][1] == "[EMAIL_REDACTED]"
    assert counts["session_token"] == 1
    assert counts["email"] == 1
