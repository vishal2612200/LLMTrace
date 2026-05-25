import { expect, test } from "@playwright/test";

test("chat stream redacts previews, conversations resume, dashboard and harness render, mobile has no overflow", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });

  const runResponse = await page.request.post("http://127.0.0.1:8000/api/harness/runs", {
    data: {
      name: "Playwright harness run",
      task: "Verify high-risk approval visibility",
      selected_context: { files: ["backend/app/api/harness.py"] },
    },
  });
  expect(runResponse.ok()).toBe(true);
  const { id: runId } = await runResponse.json();
  await page.request.post(`http://127.0.0.1:8000/api/harness/runs/${runId}/tool-calls`, {
    data: {
      tool_name: "deploy",
      tool_input_json: { token: "Bearer sk-playwright12345678901234567890" },
      tool_output: "waiting for approval from dev@example.com",
      status: "started",
      risk_level: "high",
      latency_ms: 18,
    },
  });
  await page.request.post(`http://127.0.0.1:8000/api/harness/runs/${runId}/verification-results`, {
    data: {
      check_type: "tests",
      command: "npm test -- --run",
      status: "passed",
      expected_files: ["frontend/src/pages/HarnessPage.tsx"],
      forbidden_files: ["billing/"],
      result_summary: "Smoke verification passed",
    },
  });
  await page.request.post("http://127.0.0.1:8000/api/harness/evals/load-fixtures");

  await page.goto("/");
  await page.getByPlaceholder("Type a message. Sensitive data is redacted before storage.").fill(
    "Playwright smoke with smoke@example.com and Bearer sk-smoke12345678901234567890",
  );
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Mock response")).toBeVisible();
  await expect(page.getByText("[EMAIL_REDACTED]")).toBeVisible();
  await expect(page.getByText("[API_KEY_REDACTED]")).toBeVisible();
  await expect(page.getByText("smoke@example.com")).toHaveCount(0);

  await page.getByRole("button", { name: "Conversations" }).click();
  await expect(page.getByRole("button", { name: "Resume" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Inference Dashboard" })).toBeVisible();
  await expect(page.getByText("Provider mix")).toBeVisible();

  await page.getByRole("button", { name: "Harness" }).click();
  await expect(page.getByRole("heading", { name: "Harness Observatory" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Playwright harness run" })).toBeVisible();
  await expect(page.getByText("Pending high risk")).toBeVisible();
  await expect(page.getByText("login redirect bug")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(consoleProblems).toEqual([]);
});
