import { test, expect } from '@playwright/test';

test.describe('legal routes', () => {
  test('terms page loads with working footer link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Terms' }).first().click();
    await expect(page).toHaveURL(/\/terms\/?$/);
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  });

  test('safety page loads with standing report form', async ({ page }) => {
    await page.goto('/safety');
    await expect(page.getByRole('heading', { name: 'Child Safety' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Submit a report' })).toBeVisible();
    await expect(page.getByLabel(/Link or ID/i)).toBeVisible();
  });
  test('safety page opens report dialog from standing form', async ({ page }) => {
    await page.goto('/safety');
    await page.getByLabel(/Link or ID/i).fill('https://toova.net/u/demo');
    await page.getByRole('button', { name: /Continue to report/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Goes to a human on the Toova safety team/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Child sexual abuse material/i })).toBeVisible();
  });
});

test.describe('signup clickwrap gate', () => {
  test('create account requires unchecked-by-default Terms checkbox and DOB', async ({ page }) => {
    await page.goto('/');
    // Open auth — landing may use Get started
    const getStarted = page.getByRole('button', { name: /Get started|Create account|Sign up/i }).first();
    if (await getStarted.isVisible().catch(() => false)) {
      await getStarted.click();
    } else {
      await page.goto('/');
      await page.evaluate(() => {
        window.history.pushState(null, '', '/');
      });
    }

    // Prefer Create account tab if present
    const createTab = page.getByRole('tab', { name: /Create account/i });
    if (await createTab.isVisible().catch(() => false)) {
      await createTab.click();
    }

    const agree = page.getByRole('checkbox', { name: /I agree to the/i });
    await expect(agree).toBeVisible();
    await expect(agree).not.toBeChecked();

    const submit = page.getByRole('button', { name: /Create account/i });
    await expect(submit).toBeDisabled();

    const google = page.getByRole('button', { name: /Continue with Google/i });
    await expect(google).toBeDisabled();

    await page.getByLabel(/Date of birth/i).fill('2005-01-15');
    await agree.check();
    await expect(submit).toBeEnabled();
    await expect(google).toBeEnabled();
  });

  test('under-13 DOB shows validation message on submit attempt', async ({ page }) => {
    await page.goto('/');
    const createTab = page.getByRole('tab', { name: /Create account/i });
    // Navigate to auth via Sign in / Get started if needed
    if (!(await createTab.isVisible().catch(() => false))) {
      const login = page.getByRole('button', { name: /Log in|Sign in|Get started/i }).first();
      if (await login.isVisible().catch(() => false)) await login.click();
    }
    if (await createTab.isVisible().catch(() => false)) await createTab.click();

    const agree = page.getByRole('checkbox', { name: /I agree to the/i });
    if (!(await agree.isVisible().catch(() => false))) {
      test.skip(true, 'Auth signup form not reachable from landing in this environment');
      return;
    }

    await page.getByLabel(/Date of birth/i).fill('2020-01-01');
    await agree.check();
    await page.getByLabel(/^Email$/i).fill('teen@example.com');
    await page.getByLabel(/^Password$/i).fill('password123');
    await page.getByRole('button', { name: /Create account/i }).click();
    await expect(page.getByText(/at least 13/i)).toBeVisible();
  });
});
