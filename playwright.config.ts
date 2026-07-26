import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4322',
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    // preview serves dist/, so a fresh build must run first.
    command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4322',
    url: 'http://127.0.0.1:4322',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
