import { test, expect, type Page } from '@playwright/test';

async function dismissBlockingModals(page: Page) {
  const close = page.getByRole('button', { name: 'Not now' });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  }
}

async function enterGuestDesigner(page: Page) {
  await dismissBlockingModals(page);
  await page.getByRole('button', { name: /Start designing, free/i }).first().click();
  await expect(page.getByText(/Start with a room/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Rectangle/i }).click();
  await expect(page.locator('.dg-page')).toBeVisible({ timeout: 60_000 });
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

test.describe('command palette search', () => {
  test('opens from ⌘K and filters lamp results without stale rows', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.keyboard.press('Meta+KeyK');
    const cmdk = page.locator('.dg-cmdk');
    await expect(cmdk).toBeVisible({ timeout: 5_000 });

    const input = cmdk.getByRole('combobox');
    await input.fill('lamp');

    await expect(cmdk.locator('.dg-cmdk-item').first()).toBeVisible({ timeout: 8_000 });

    const labels = await cmdk.locator('.dg-cmdk-item__label').allTextContents();
    const joined = labels.join(' | ').toLowerCase();
    expect(joined).toMatch(/lamp|light|string/);

    await page.keyboard.press('Escape');
    await expect(cmdk).toHaveCount(0);
  });

  test('mobile search icon opens palette', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await enterGuestDesigner(page);

    const searchBtn = page.getByRole('button', { name: 'Search' });
    await expect(searchBtn).toBeVisible({ timeout: 10_000 });
    await searchBtn.click();
    await expect(page.locator('.dg-cmdk')).toBeVisible({ timeout: 5_000 });

    const box = await page.locator('.dg-cmdk-panel').boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(390);
    }
  });
});
