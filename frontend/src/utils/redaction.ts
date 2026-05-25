const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g, "[PRIVATE_KEY_REDACTED]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[JWT_REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "[API_KEY_REDACTED]"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[API_KEY_REDACTED]"],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[API_KEY_REDACTED]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[API_KEY_REDACTED]"],
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "[API_KEY_REDACTED]"],
  [/\bwhsec_[A-Za-z0-9]{16,}\b/g, "[SECRET_REDACTED]"],
  [/\b(?:cookie|set-cookie)\s*:\s*[A-Za-z0-9_.-]+=[^;\s\n]+(?:;\s*[A-Za-z0-9_.-]+=[^;\s\n]+)*/gi, "[COOKIE_REDACTED]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN_REDACTED]"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL_REDACTED]"],
  [/(?<!\w)(?:\+?\d[\d .()-]{8,}\d)(?!\w)/g, "[PHONE_REDACTED]"],
  [/\b(?:session|token|secret|api[_-]?key)\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}/gi, "[SECRET_REDACTED]"],
];

export function redactForPreview(value: string) {
  return PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}
