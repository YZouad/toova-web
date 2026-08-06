import { test, expect, type Page } from '@playwright/test';

async function dismissBlockingModals(page: Page) {
  const close = page.getByRole('button', { name: 'Not now' });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  }
  const modalClose = page.locator('.kit-modal__close');
  if (await modalClose.first().isVisible().catch(() => false)) {
    await modalClose.first().click();
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `horizontal overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

test.describe('mobile responsive smoke', () => {
  test('landing shows CTA without section hamburger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissBlockingModals(page);

    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start designing, free' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('landing stacks key sections at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await dismissBlockingModals(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.landing-hero-visual')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('gallery loads on phone and tablet portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/gallery');
    await expect(page.locator('.kit-app-shell__title')).toHaveText('Gallery');
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/gallery?mode=rooms');
    await expect(page.getByRole('button', { name: 'Rooms' }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('home remains usable after dismissing checklist', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissBlockingModals(page);
    await expect(page.getByRole('button', { name: /Start designing/i }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('phone landscape marketing does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await dismissBlockingModals(page);
    await expect(page.locator('.kit-marketing-nav')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
