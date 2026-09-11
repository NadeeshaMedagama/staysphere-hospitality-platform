import { test as setup, expect } from '@playwright/test';

/**
 * Signs in once per run and saves the session for the suites that need one.
 *
 * Signing in inside every test would be both slower and wrong: the gateway
 * rate-limits `/auth/login` to thirty a minute precisely so a burst of attempts
 * looks like an attack, and a suite that trips its own platform's brute-force
 * protection is testing the wrong thing.
 */
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? 'manager@staysphere.local';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? 'StaySphere-Dev-2026!';
const GUEST_EMAIL = process.env.E2E_GUEST_EMAIL ?? 'guest@example.com';
const GUEST_PASSWORD = process.env.E2E_GUEST_PASSWORD ?? 'StaySphere-Dev-2026!';

export const ADMIN_STATE = 'tests/.auth/admin.json';
export const STAFF_STATE = 'tests/.auth/staff.json';
export const GUEST_STATE = 'tests/.auth/guest.json';

setup('authenticate as staff for the console', async ({ page }) => {
  await page.goto(`${process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3200'}/sign-in`);
  await page.getByLabel('Work email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page.getByRole('heading', { name: /today at a glance/i })).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});

setup('authenticate as staff for the staff app', async ({ page }) => {
  await page.goto(`${process.env.E2E_STAFF_URL ?? 'http://127.0.0.1:3300'}/sign-in`);
  await page.getByLabel('Work email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.context().storageState({ path: STAFF_STATE });
});

setup('authenticate as a guest', async ({ page }) => {
  await page.goto(`${process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3100'}/sign-in`);
  await page.getByLabel('Email address').fill(GUEST_EMAIL);
  await page.getByLabel('Password').fill(GUEST_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/bookings/);
  await page.context().storageState({ path: GUEST_STATE });
});
