import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.PFT_AI_LIVE === '1' ? './test-results/e2e-live' : './test-results/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder:
          process.env.PFT_AI_LIVE === '1'
            ? 'test-results/live-playwright-report'
            : 'playwright-report',
      },
    ],
  ],
  use: {
    baseURL: process.env.PFT_E2E_BASE_URL,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
});
