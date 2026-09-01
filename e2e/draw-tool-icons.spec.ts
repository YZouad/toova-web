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

test.describe('draw tool and rug icons', () => {
  test('desktop add panel shows draw-tool SVG icons', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('.dg-rail-btn.is-primary').click();
    await expect(page.getByText('Draw it in the room')).toBeVisible({ timeout: 10_000 });

    const drawRows = page.locator('.dg-row').filter({ hasText: /Draw hanging|Place a free light/ });
    await expect(drawRows).toHaveCount(3);

    for (const row of await drawRows.all()) {
      await expect(row.locator('svg')).toHaveCount(1);
    }
  });

  test('rug catalog row shows image thumbnail instead of letter fallback', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('.dg-rail-btn.is-primary').click();
    await expect(page.getByText('Draw it in the room')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Rug', { exact: true })).toBeVisible({ timeout: 15_000 });

    await expect(async () => {
      const rugImg = page.locator('img[alt=""]').filter({ has: page.locator('xpath=ancestor::*[contains(., "Rug")]') }).first();
      const count = await rugImg.count();
      if (count === 0) {
        const anyRugThumb = page.locator('button').filter({ hasText: 'Rug' }).locator('img').first();
        await expect(anyRugThumb).toBeVisible();
        return;
      }
      await expect(rugImg).toBeVisible();
    }).toPass({ timeout: 20_000 });
  });

  test('mobile add sheet shows draw-tool SVG icons in footer', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('.dgm-dock-btn.is-primary').click();
    await expect(page.getByText('Add to the room')).toBeVisible({ timeout: 10_000 });

    const footerButtons = page.locator('.dgm-action-btn.is-dashed');
    await expect(footerButtons).toHaveCount(2);
    for (const btn of await footerButtons.all()) {
      await expect(btn.locator('svg')).toHaveCount(1);
    }
  });
});
