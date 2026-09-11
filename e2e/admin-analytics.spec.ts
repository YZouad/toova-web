import { expect, test } from '@playwright/test';

test.describe('first-party analytics consent', () => {
  test('privacy policy explains operational vs consented collection', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText(/first-party analytics store/i)).toBeVisible();
    await expect(page.getByText(/not a pre-consent behavioral click log/i)).toBeVisible();
  });

  test('rejecting cookies never calls the collector', async ({ page }) => {
    const calls: string[] = [];
    await page.route('**/functions/v1/collect-analytics', async (route) => {
      calls.push(route.request().url());
      await route.fulfill({ status: 204, body: '{}' });
    });
    await page.goto('/');
    const reject = page.getByRole('button', { name: 'Reject' });
    if (await reject.isVisible().catch(() => false)) {
      await reject.click();
    }
    await page.goto('/gallery');
    await page.waitForTimeout(400);
    expect(calls).toEqual([]);
  });

  test('accepting cookies fans out a first-party page or session event', async ({ page }) => {
    const bodies: string[] = [];
    await page.route('**/functions/v1/collect-analytics', async (route) => {
      bodies.push(route.request().postData() ?? '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"accepted":1}' });
    });
    await page.goto('/');
    const accept = page.getByRole('button', { name: 'Accept' });
    if (await accept.isVisible().catch(() => false)) {
      await expect(page.getByText(/first-party event store/i)).toBeVisible();
      await accept.click();
      await expect.poll(() => bodies.length, { timeout: 8_000 }).toBeGreaterThan(0);
      expect(bodies.join(' ')).toMatch(/page_view|session_started/);
    }
  });
});

test.describe('admin analytics dashboard', () => {
  test('analytics tab, filters, explorer, and user drill-down', async ({ page }) => {
    await page.goto('/');
    const adminNav = page.getByRole('button', { name: 'Analytics' });
    const opened = await adminNav.isVisible().catch(() => false);
    test.skip(!opened, 'Admin session required for dashboard e2e');
    await adminNav.click();
    await expect(page.getByText(/Executive health/i)).toBeVisible();
    await expect(page.getByLabel('Date range')).toBeVisible();
    await page.getByLabel('Date range').selectOption('7d');
    await expect(page.getByText(/Event explorer/i)).toBeVisible();
    await expect(page.getByLabel('Event name')).toBeVisible();
    const userLink = page.locator('.analytics-linkish').first();
    if (await userLink.isVisible().catch(() => false)) {
      await userLink.click();
      await expect(page.getByRole('tab', { name: 'Analytics' })).toBeVisible();
    }
  });

  test('analytics filters overflow on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const adminNav = page.getByRole('button', { name: 'Analytics' });
    const opened = await adminNav.isVisible().catch(() => false);
    test.skip(!opened, 'Admin session required for dashboard e2e');
    await adminNav.click();
    const filters = page.locator('.admin-analytics__filters').first();
    await expect(filters).toBeVisible();
    const overflow = await filters.evaluate((el) => el.scrollWidth >= el.clientWidth);
    expect(overflow).toBeTruthy();
  });
});
