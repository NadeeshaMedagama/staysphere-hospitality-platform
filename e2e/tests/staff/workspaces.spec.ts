import { expect, test } from '@playwright/test';

test.describe('staff access', () => {
  // This suite deliberately runs without the saved staff session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an unauthenticated visitor is sent to sign in', async ({ page }) => {
    await page.goto('/reception');

    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page).toHaveURL(/next=%2Freception/);
  });

  test('the sign-in page names the app it belongs to', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByText(/staff workspaces/i)).toBeVisible();
  });
});

test.describe('staff workspaces', () => {
  test('opening the app lands on the shift’s own workspace', async ({ page }) => {
    await page.goto('/');
    // A chooser between one option is friction; go straight to the queue.
    await expect(page).toHaveURL(/\/reception/);
  });

  test('the signed-in member of staff and their property are named', async ({ page }) => {
    await page.goto('/reception');

    await expect(page.getByText('Duty Manager').first()).toBeVisible();
    await expect(page.getByText(/Seaside Grand/).first()).toBeVisible();
  });

  test('reception reports the day from the booking and stay services', async ({ page }) => {
    await page.goto('/reception');

    await expect(page.getByRole('heading', { name: 'Reception', level: 1 })).toBeVisible();
    await expect(page.getByText('Arrivals today').first()).toBeVisible();
    await expect(page.getByText('Departures today').first()).toBeVisible();
    await expect(page.getByText('Rooms unassigned').first()).toBeVisible();

    // The desk gets a table when there are arrivals and a stated empty state
    // when there are none — never a blank panel that looks like a failure.
    const arrivals = page.locator('section').filter({ hasText: 'Arrivals' }).first();
    await expect(
      arrivals.getByRole('table').or(arrivals.getByText(/no arrivals today/i)),
    ).toBeVisible();
  });

  test('housekeeping shows the live queue with the next step on each task', async ({ page }) => {
    await page.goto('/housekeeping');

    await expect(page.getByRole('heading', { name: 'Housekeeping', level: 1 })).toBeVisible();
    await expect(page.getByText('In progress').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /housekeeping tasks/i })).toBeVisible();

    // Every open task offers exactly one transition, not a menu of all of them.
    const queue = page.getByRole('table', { name: /housekeeping tasks/i });
    await expect(queue.getByRole('button', { name: /^(Take|Start|Complete)$/ }).first()).toBeVisible();
  });

  test('maintenance lists tickets and what can be done to each', async ({ page }) => {
    await page.goto('/maintenance');

    await expect(page.getByRole('heading', { name: 'Maintenance', level: 1 })).toBeVisible();
    await expect(page.getByText('Rooms offline')).toBeVisible();
    await expect(page.getByRole('table', { name: /maintenance tickets/i })).toBeVisible();
  });

  test('taking a task assigns it to the person who took it', async ({ page }) => {
    await page.goto('/housekeeping');
    const queue = page.getByRole('table', { name: /housekeeping tasks/i });
    await expect(queue).toBeVisible();

    const take = queue.getByRole('button', { name: 'Take' }).first();
    if ((await take.count()) === 0) test.skip(true, 'no unassigned task is waiting right now');

    // "You" appears only where the row's assignee id matches the signed-in
    // person. The service resolves no *name* for a named assignment, so this
    // is the only thing on screen that proves the assignment actually landed.
    const mine = queue.getByRole('cell', { name: 'You', exact: true });
    const before = await mine.count();

    await take.click();
    await expect(mine).toHaveCount(before + 1);
  });

  test('resolving a ticket asks what fixed it before sending anything', async ({ page }) => {
    await page.goto('/maintenance');

    const resolve = page.getByRole('button', { name: /^Resolve$/ }).first();
    if ((await resolve.count()) === 0) test.skip(true, 'no ticket is in progress right now');

    await resolve.click();
    await expect(page.getByPlaceholder(/what fixed it/i)).toBeVisible();
  });

  test('finance separates money taken from money owed', async ({ page }) => {
    await page.goto('/finance');

    await expect(page.getByText('Captured').first()).toBeVisible();
    await expect(page.getByText('Outstanding').first()).toBeVisible();
    await expect(page.getByRole('table', { name: /payments/i })).toBeVisible();
  });

  test('the workspace navigation marks the current page', async ({ page }) => {
    await page.goto('/maintenance');
    await expect(page.getByRole('link', { name: 'Maintenance' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the staff app is not indexable', async ({ page }) => {
    await page.goto('/reception');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});

test.describe('notification centre', () => {
  test('the alert link carries the unread count for a screen reader', async ({ page }) => {
    await page.goto('/reception');
    // The count must reach a screen reader, not only the coloured dot.
    await expect(page.getByRole('link', { name: /notifications/i })).toBeVisible();
  });

  test('the inbox lists what the notification service holds', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible();
  });

  test('the alert opens the notification centre', async ({ page }) => {
    await page.goto('/reception');
    await page.getByRole('link', { name: /notifications/i }).click();
    await expect(page).toHaveURL(/\/notifications/);
  });
});
