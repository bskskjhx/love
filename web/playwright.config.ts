import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';
const ARTIFACTS = '../.artifacts/mobile-checks/M09';

/**
 * Drives the mobile-fixture dev server started by `npm run dev:mobile`.
 *
 * Real pinch gestures, the system soft keyboard and native safe-area insets are
 * not reproducible here — see web/MOBILE-TESTING.md section 6 for the manual
 * checklist that covers them.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${ARTIFACTS}/playwright-report`, open: 'never' }],
  ],
  outputDir: `${ARTIFACTS}/test-results`,
  use: {
    baseURL: BASE_URL,
    // A previously registered sw.js would serve stale app shells and hide
    // source changes.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: 'npm run dev:mobile',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
