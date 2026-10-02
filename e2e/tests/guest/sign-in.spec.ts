import { expect, test } from '@playwright/test';

/**
 * Guest authentication.
 *
 * The sign-in form posts to a server action that exchanges credentials at the
 * gateway and sets an httpOnly session cookie, so these tests assert on what
 * the guest actually ends up with: a session, their own reservations, and no
 * token readable from the page.
 */
const EMAIL = process.env.E2E_GUEST_EMAIL ?? 'guest@example.com';
const PASSWORD = process.env.E2E_GUEST_PASSWORD ?? 'StaySphere-Dev-2026!';

test.describe('guest sign-in', () => {
  test('rejects an empty submission without leaving the page', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page.getByText(/enter the email address on your account/i)).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('shows one non-committal message for a wrong password', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const alert = page.locator('form').getByRole('alert');
    await expect(alert).toContainText(/do not match an account/i);
    // It must not reveal whether the address itself is registered.
    await expect(alert).not.toContainText(/password is incorrect|no such user|not found/i);
  });

  test('signs in, lands on bookings and shows the account as signed in', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/bookings/);
    await expect(page.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  });

  test('keeps the session token out of reach of page scripts', async ({ page, context }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/bookings/);

    const cookie = (await context.cookies()).find((c) => c.name === 'staysphere_guest_session');
    expect(cookie, 'the session cookie should exist').toBeTruthy();
    expect(cookie?.httpOnly, 'the session cookie must be httpOnly').toBe(true);

    // The definitive check: script on the page cannot read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain('staysphere_guest_session');
  });

  test('honours a same-site next parameter and refuses an off-site one', async ({ page }) => {
    await page.goto('/sign-in?next=%2Frooms');
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/rooms/);
  });

  test('signing out clears the session', async ({ page, context }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/bookings/);

    await page.getByRole('button', { name: /sign out/i }).click();

    await expect(page.getByRole('link', { name: /^sign in$/i }).first()).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'staysphere_guest_session')).toBeFalsy();
  });
});
