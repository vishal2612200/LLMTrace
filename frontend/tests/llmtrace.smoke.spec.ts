import { expect, test } from "@playwright/test";

test("chat stream redacts previews, conversations resume, dashboard renders, mobile has no overflow", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });

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

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(consoleProblems).toEqual([]);
});
