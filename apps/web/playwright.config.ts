import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? '3000');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const disableManagedWebServer = process.env.PLAYWRIGHT_NO_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: disableManagedWebServer
    ? undefined
    : [
        {
          command: `pnpm dev --port ${port}`,
          port,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
