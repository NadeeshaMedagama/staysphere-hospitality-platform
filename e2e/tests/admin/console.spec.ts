import { expect, test, type Page } from '@playwright/test';

const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? 'manager@staysphere.local';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? 'StaySphere-Dev-2026!';
const GUEST_EMAIL = process.env.E2E_GUEST_EMAIL ?? 'guest@example.com';

async function signIn(page: Page, email = STAFF_EMAIL, password = STAFF_PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
}

test.describe('console access', () => {
  // This suite exercises signing in, so it deliberately starts with no session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an unauthenticated visitor is sent to sign in, not to the console', async ({ page }) => {
    await page.goto('/reservations');

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('the path asked for is carried through the sign-in', async ({ page }) => {
    await page.goto('/housekeeping');
    await expect(page).toHaveURL(/next=%2Fhousekeeping/);

    await page.getByLabel('Work email').fill(STAFF_EMAIL);
    await page.getByLabel('Password').fill(STAFF_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/housekeeping/);
  });

  test('a guest account is refused even with correct credentials', async ({ page, context }) => {
    await signIn(page, GUEST_EMAIL);

    // Scoped to the form: Next.js mounts its own role="alert" route announcer.
    await expect(page.locator('form').getByRole('alert')).toContainText(/does not have access/i);
    // The decisive check: no session was created, so the console is still shut.
    expect(
      (await context.cookies()).find((c) => c.name === 'staysphere_admin_session'),
    ).toBeFalsy();
  });

  test('the console session cookie is not readable by page scripts', async ({ page, context }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'staysphere_admin_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('staysphere_admin_session');
  });
});

/**
 * These run against the session saved once by the setup project. Signing in per
 * test would trip the gateway's own brute-force protection: `/auth/login` is
 * rate-limited to thirty a minute, and a suite that sets that off is testing
 * the wrong thing.
 */
test.describe('operations console', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible();
  });

  test('the overview shows the shift figures and the floor board', async ({ page }) => {
    for (const label of ['Revenue today', 'Occupancy', 'Average daily rate']) {
      await expect(page.getByText(label)).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /room board/i })).toBeVisible();
  });

  test('the signed-in member of staff is named in the topbar', async ({ page }) => {
    await expect(page.getByText('Duty Manager').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('room status is conveyed in words as well as colour', async ({ page }) => {
    // Colour alone is unreadable for colour-blind staff and on a washed-out
    // front-desk monitor, so every tile prints its status.
    const board = page.getByRole('region').filter({ hasText: 'Room board' });
    await expect(board.getByText('Available').first()).toBeVisible();
  });

  test('each room tile is a labelled control a screen reader can announce', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^Room 101, / })).toBeVisible();
  });

  test('the sidebar reaches every console section', async ({ page }) => {
    const destinations = [
      ['Reservations', '/reservations'],
      ['Room board', '/rooms'],
      ['Housekeeping', '/housekeeping'],
      ['Audit log', '/audit'],
    ] as const;

    for (const [label, path] of destinations) {
      await page.getByRole('link', { name: label, exact: true }).click();
      // Wait for the navigation to commit before asserting on the sidebar:
      // Next keeps the previous page — and its heading — on screen until the
      // new route's data arrives, so asserting earlier tests the old page.
      await page.waitForURL(`**${path}`);
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible();
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test('reservations lists real bookings rather than a placeholder', async ({ page }) => {
    await page.goto('/reservations');

    await expect(page.getByRole('heading', { name: /^reservations$/i })).toBeVisible();
    // The console used to claim every service was "not yet deployed".
    await expect(page.getByText(/module in development/i)).toHaveCount(0);
    await expect(page.getByRole('table')).toBeVisible();
    // Seeded references all carry this prefix.
    await expect(page.getByText(/^SS-/).first()).toBeVisible();
  });

  test('arrivals reports the day from the booking service', async ({ page }) => {
    await page.goto('/arrivals');

    await expect(page.getByText('Arriving today')).toBeVisible();
    await expect(page.getByText('Departing today')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^arrivals$/i })).toBeVisible();
    // A table when there are arrivals, a stated empty state when there are none.
    const arrivals = page.locator('section').filter({ hasText: 'Arrivals' }).first();
    await expect(
      arrivals.getByRole('table').or(arrivals.getByText(/no arrivals today/i)),
    ).toBeVisible();
  });

  test('housekeeping shows the live queue', async ({ page }) => {
    await page.goto('/housekeeping');

    // Both the stat card and the table's own cells carry these words.
    await expect(page.getByText('Open tasks').first()).toBeVisible();
    await expect(page.getByText('Unassigned').first()).toBeVisible();
  });

  test('maintenance renders tickets that have no cost recorded', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));

    await page.goto('/maintenance');

    await expect(page.getByRole('table', { name: /maintenance tickets/i })).toBeVisible();
    await expect(page.getByText('Rooms offline').first()).toBeVisible();

    // A ticket stores `costMinor` with a default of 0 and leaves `currency`
    // null until a cost is actually recorded. Formatting money from that pair
    // used to throw on the null, taking the whole section down.
    expect(crashes, `page threw: ${crashes.join('; ')}`).toHaveLength(0);
  });

  test('the audit log renders entries that belong to no single record', async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));

    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible();

    // `resourceId` is null for an action that is not about one record, and the
    // actor's roles arrive as an array rather than a single role.
    expect(crashes, `page threw: ${crashes.join('; ')}`).toHaveLength(0);
  });

  test('a section whose read API is genuinely missing says exactly that', async ({ page }) => {
    await page.goto('/staff');

    await expect(page.getByText(/cannot be listed yet/i)).toBeVisible();
    // It must name what is actually absent, not blame a service for being down.
    await expect(page.getByText(/not yet deployed/i)).toHaveCount(0);
  });

  test('an unknown section is a genuine 404', async ({ page }) => {
    const response = await page.goto('/not-a-section');
    expect(response?.status()).toBe(404);
  });

  test('the console is not indexable', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

});

test.describe('signing out', () => {
  // Signs in for itself: the shared session must survive this suite.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('signing out closes the console', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto('/reservations');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
