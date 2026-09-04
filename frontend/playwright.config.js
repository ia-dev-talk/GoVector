import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,

  expect: {
    timeout: 7_000,
  },

  reporter: [
    ['line'],
    ['html', {
      outputFolder: 'playwright-report',
      open: 'never',
    }],
  ],

  use: {
    baseURL:
      process.env.BLUEVECTOR_E2E_BASE_URL ||
      'http://127.0.0.1:8080',

    viewport: {
      width: 1440,
      height: 900,
    },

    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',

    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  outputDir: 'test-results/playwright',
});
