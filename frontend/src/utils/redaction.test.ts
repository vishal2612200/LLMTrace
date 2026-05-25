import { describe, expect, it } from "vitest";

import { redactForPreview } from "./redaction";

describe("redactForPreview", () => {
  it("redacts optimistic UI secrets before stream completes", () => {
    const redacted = redactForPreview(
      "email a@example.com Bearer sk-client12345678901234567890 Cookie: sid=abc123456789012",
    );

    expect(redacted).toContain("[EMAIL_REDACTED]");
    expect(redacted).toContain("[API_KEY_REDACTED]");
    expect(redacted).toContain("[COOKIE_REDACTED]");
    expect(redacted).not.toContain("a@example.com");
    expect(redacted).not.toContain("sk-client");
  });
});
