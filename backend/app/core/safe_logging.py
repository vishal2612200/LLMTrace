import logging
from typing import Any

from app.core.redaction import redact_payload


def get_logger(name: str) -> logging.Logger:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return logging.getLogger(name)


def safe_extra(extra: dict[str, Any] | None) -> dict[str, Any]:
    redacted, _ = redact_payload(extra or {})
    return redacted
