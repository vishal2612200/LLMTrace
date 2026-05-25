import hashlib
import re
from dataclasses import dataclass
from typing import Any

from app.core.config import get_settings


PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    ("private_key", "[PRIVATE_KEY_REDACTED]", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----")),
    ("jwt", "[JWT_REDACTED]", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("bearer", "[API_KEY_REDACTED]", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{16,}", re.IGNORECASE)),
    ("openai_key", "[API_KEY_REDACTED]", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("github_key", "[API_KEY_REDACTED]", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b")),
    ("aws_key", "[API_KEY_REDACTED]", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("stripe_key", "[API_KEY_REDACTED]", re.compile(r"\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b")),
    ("webhook_secret", "[SECRET_REDACTED]", re.compile(r"\bwhsec_[A-Za-z0-9]{16,}\b")),
    ("cookie", "[COOKIE_REDACTED]", re.compile(r"\b(?:cookie|set-cookie)\s*:\s*[A-Za-z0-9_.-]+=[^;\s\n]+(?:;\s*[A-Za-z0-9_.-]+=[^;\s\n]+)*", re.IGNORECASE)),
    ("ssn", "[SSN_REDACTED]", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("email", "[EMAIL_REDACTED]", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("phone", "[PHONE_REDACTED]", re.compile(r"(?<!\w)(?:\+?\d[\d .()\-]{8,}\d)(?!\w)")),
    ("session_token", "[SECRET_REDACTED]", re.compile(r"\b(?:session|token|secret|api[_-]?key)\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}", re.IGNORECASE)),
]


@dataclass(frozen=True)
class RedactionResult:
    redacted: str
    preview: str
    content_hash: str
    metadata: dict[str, int]


def redact_text(value: str, preview_chars: int | None = None) -> RedactionResult:
    settings = get_settings()
    limit = preview_chars or settings.preview_chars
    redacted = value
    counts: dict[str, int] = {}
    for key, replacement, pattern in PATTERNS:
        redacted, count = pattern.subn(replacement, redacted)
        if count:
            counts[key] = counts.get(key, 0) + count
    return RedactionResult(
        redacted=redacted,
        preview=redacted[:limit],
        content_hash=hashlib.sha256(value.encode("utf-8")).hexdigest(),
        metadata=counts,
    )


def redact_payload(payload: Any) -> tuple[Any, dict[str, int]]:
    counts: dict[str, int] = {}

    def merge(meta: dict[str, int]) -> None:
        for key, value in meta.items():
            counts[key] = counts.get(key, 0) + value

    def visit(item: Any) -> Any:
        if isinstance(item, str):
            result = redact_text(item)
            merge(result.metadata)
            return result.redacted
        if isinstance(item, list):
            return [visit(child) for child in item]
        if isinstance(item, dict):
            return {key: visit(value) for key, value in item.items()}
        return item

    return visit(payload), counts
