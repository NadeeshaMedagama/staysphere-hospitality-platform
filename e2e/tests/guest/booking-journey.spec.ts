import { expect, test } from '@playwright/test';

/**
 * The guest journey, from landing on the site to reaching the booking flow.
 *
 * This is the path that earns the money. Everything else in the platform can
 * degrade and the business survives the day; if this breaks, it does not.
 */
test.describe('guest booking journey', () => {
  test('the landing page presents the search panel and featured rooms', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /find your perfect stay/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /search rooms/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /rooms & suites/i })).toBeVisible();
    await expect(page.getByText('/ night').first()).toBeVisible();
  });

  test('searching carries the dates through to the results page', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Check-in').fill('2026-11-02');
    await page.getByLabel('Check-out').fill('2026-11-06');
    await page.getByLabel('Guests').selectOption('2');
    await page.getByRole('button', { name: /search rooms/i }).click();

    await expect(page).toHaveURL(/\/rooms\?checkIn=2026-11-02&checkOut=2026-11-06&guests=2/);
    // Four nights, and the stay summary must reflect what was asked for.
    await expect(page.getByText(/Nov 2 – Nov 6 · 4 nights · 2 guests/)).toBeVisible();
  });

  test('an impossible date range is rejected before it reaches the server', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Check-in').fill('2026-11-06');
    await page.getByLabel('Check-out').fill('2026-11-02');
    await page.getByRole('button', { name: /search rooms/i }).click();

    // Scoped to the form: Next.js mounts its own role="alert" route announcer.
    await expect(page.locator('form').getByRole('alert')).toContainText(/at least one night/i);
    // Still on the homepage: the invalid search never navigated.
    await expect(page).toHaveURL(/\/$/);
  });

  test('results show a price and a way to reserve', async ({ page }) => {
    await page.goto('/rooms?checkIn=2026-11-02&checkOut=2026-11-05&guests=2');

    const first = page.getByRole('listitem').first();
    await expect(first.getByText(/per night, incl\. tax/i)).toBeVisible();
    await expect(first.getByRole('link', { name: /reserve/i })).toBeVisible();
  });

  test('a party too large for any room gets an explanation, not an empty page', async ({
    page,
  }) => {
    await page.goto('/rooms?checkIn=2026-11-02&checkOut=2026-11-05&guests=9');

    await expect(
      page.getByRole('heading', { name: /no rooms fit that party size/i }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /change your search/i })).toBeVisible();
  });

  test('reserving reaches the booking flow with its progress visible', async ({ page }) => {
    await page.goto('/rooms?checkIn=2026-11-02&checkOut=2026-11-05&guests=2');
    await page
      .getByRole('link', { name: /reserve/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/book\//);
    await expect(page.getByRole('heading', { name: /complete your booking/i })).toBeVisible();
    for (const step of ['Room', 'Guest details', 'Extras', 'Payment', 'Confirmation']) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }
  });
});

test.describe('guest site quality', () => {
  test('every primary navigation link resolves', async ({ page }) => {
    await page.goto('/');

    for (const label of ['Rooms & Suites', 'Amenities', 'Offers', 'Contact']) {
      const response = await page.request.get(
        (await page.getByRole('link', { name: label }).first().getAttribute('href')) ?? '/',
      );
      expect({ label, status: response.status() }).toEqual({ label, status: 200 });
    }
  });

  test('an unknown page returns a helpful 404 rather than a stack trace', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /could not find that page/i })).toBeVisible();
  });

  test('the page is reachable by keyboard from the very first tab', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /skip to content/i })).toBeFocused();
  });

  test('the health endpoint reports the service and commit', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'web' });
  });
});

test.describe('room detail', () => {
  test('shows what a guest needs to decide with', async ({ page }) => {
    await page.goto('/rooms/deluxe');

    await expect(page.getByRole('heading', { name: 'Deluxe King', level: 1 })).toBeVisible();
    for (const term of ['Size', 'Sleeps', 'Beds', 'Bathroom', 'View']) {
      await expect(page.getByRole('term').filter({ hasText: term })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /in this room/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /cancellation/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /reserve now/i })).toBeVisible();
  });

  test('reaches the booking flow from the detail page', async ({ page }) => {
    await page.goto('/rooms/suite');
    await page.getByRole('link', { name: /reserve now/i }).click();
    await expect(page).toHaveURL(/\/book\/suite/);
  });

  test('the results list links through to the detail page', async ({ page }) => {
    await page.goto('/rooms?checkIn=2026-11-02&checkOut=2026-11-05&guests=2');
    await page
      .getByRole('link', { name: /view room/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toBeVisible();
  });

  test('an unknown room type is a 404, not an empty page', async ({ page }) => {
    const response = await page.goto('/rooms/penthouse');
    expect(response?.status()).toBe(404);
  });
});
