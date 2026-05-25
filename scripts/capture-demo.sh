#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

node <<'NODE'
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Type a message. Sensitive data is redacted before storage.').fill(
    'Demo with demo@example.com and Bearer sk-demo12345678901234567890'
  );
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText('Mock response').waitFor();
  await page.screenshot({ path: '/tmp/llmtrace-chat.png', fullPage: false });
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.getByRole('heading', { name: 'Inference Dashboard' }).waitFor();
  await page.screenshot({ path: '/tmp/llmtrace-dashboard.png', fullPage: false });
  await browser.close();
  console.log('Screenshots written to /tmp/llmtrace-chat.png and /tmp/llmtrace-dashboard.png');
})();
NODE
