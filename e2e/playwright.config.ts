import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * The three front ends are started by Playwright itself, so `pnpm test:e2e`
 * behaves identically on a laptop and in CI. Point the `*_URL` variables at a
 * deployed environment to run the same suite as a post-deploy smoke test.
 */
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3100';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3200';
const STAFF_URL = process.env.E2E_STAFF_URL ?? 'http://127.0.0.1:3300';

const external = Boolean(process.env.E2E_WEB_URL);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // A test that only passes on a retry is a flaky test; never let one land.
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  /**
   * One worker by default.
   *
   * Every request in a local run leaves the same IP, so the whole suite shares
   * a single bucket in the gateway's rate limiter (120 requests per minute).
   * A console page costs several upstream calls, so two workers is enough to
   * trip it — and a throttled read renders as "could not be loaded", which
   * looks like a product bug rather than the suite's own noise. Raise
   * RATE_LIMIT_MAX on the gateway if the suite needs to go faster.
   */
  workers: CI ? 2 : 1,
  reporter: CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'guest',
      testMatch: /guest\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      name: 'guest-mobile',
      // The booking journey only. Re-running the sign-in flow on a second
      // device profile tests no new layout and doubles the hits on the
      // gateway's thirty-a-minute limit for /auth/login, which shows up as a
      // spurious "too many attempts" failure rather than a real defect.
      testMatch: /guest\/booking-journey\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: WEB_URL },
    },
    // Signs in once and saves a session the console and staff suites reuse.
    { name: 'setup', testMatch: /setup\/.*\.setup\.ts/ },
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_URL,
        storageState: 'tests/.auth/admin.json',
      },
    },
    {
      name: 'staff',
      testMatch: /staff\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: STAFF_URL,
        storageState: 'tests/.auth/staff.json',
      },
    },
  ],

  // Against a deployed environment there is nothing to start.
  webServer: external
    ? undefined
    : [
        {
          command: 'pnpm --filter @staysphere/web start',
          url: `${WEB_URL}/api/health`,
          reuseExistingServer: !CI,
          timeout: 120_000,
          cwd: '..',
        },
        {
          command: 'pnpm --filter @staysphere/admin start',
          url: `${ADMIN_URL}/api/health`,
          reuseExistingServer: !CI,
          timeout: 120_000,
          cwd: '..',
        },
        {
          command: 'pnpm --filter @staysphere/staff start',
          url: `${STAFF_URL}/api/health`,
          reuseExistingServer: !CI,
          timeout: 120_000,
          cwd: '..',
        },
      ],
});
