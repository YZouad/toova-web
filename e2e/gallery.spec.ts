import { test, expect } from '@playwright/test';

test.describe('gallery route', () => {
  test('loads /gallery discover shell', async ({ page }) => {
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Discover' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Rooms' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Models' })).toBeVisible();
  });

  test('models tab shows community filters', async ({ page }) => {
    await page.goto('/gallery?mode=models&source=toova');
    await expect(page.getByRole('tab', { name: 'Models' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Toova' })).toBeVisible();
    await expect(page.locator('.model-gallery')).toBeVisible();
  });

  test('rooms tab browse loads', async ({ page }) => {
    await page.goto('/gallery?mode=rooms');
    await expect(page.getByRole('tab', { name: 'Rooms' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.room-gallery')).toBeVisible();
    await expect(page.getByRole('button', { name: /Trending|Sort/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Community' })).toHaveCount(0);
  });

  test('see all from discover opens rooms browse', async ({ page }) => {
    await page.goto('/gallery');
    const seeAll = page.getByRole('button', { name: 'See all →' }).first();
    if (await seeAll.isVisible().catch(() => false)) {
      await seeAll.click();
      await expect(page).toHaveURL(/mode=rooms|mode=models/);
    }
  });
});
