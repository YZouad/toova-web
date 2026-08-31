import { test, expect, type Page } from '@playwright/test';

async function dismissBlockingModals(page: Page) {
  const close = page.getByRole('button', { name: 'Not now' });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

async function enterGuestDesigner(page: Page) {
  await dismissBlockingModals(page);
  await page.getByRole('button', { name: /Start designing, free/i }).first().click();
  await expect(page.getByText(/Start with a room/i)).toBeVisible({ timeout: 15_000 });

  // Select first starter card, then confirm
  const firstStarter = page.locator('.room-preset-card-btn').first();
  await firstStarter.click();
  await page.getByRole('button', { name: 'Create room' }).click();

  await expect(page.locator('.dg-page')).toBeVisible({ timeout: 60_000 });
  // Dismiss tour if present so chrome is clickable
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

test.describe('designer overhaul chrome', () => {
  test('desktop shell shows rail, ticker, and command search', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await expect(page.locator('.dg-rail')).toBeVisible();
    await expect(page.locator('.dg-rail-stack')).toBeVisible();
    await expect(page.locator('.dg-camera-puck')).toBeVisible();
    await expect(page.locator('.dg-dock')).toHaveCount(0);
    await expect(page.locator('.dg-topbar-search')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.locator('.dg-rail-btn.is-primary').click();
    await expect(page.locator('.dg-sheet, .dg-mobile-sheet').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+KeyK');
    await expect(page.locator('.dg-cmdk')).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Present' }).click();
    await expect(page.locator('.dg-present-bar')).toBeVisible();
    await expect(page.locator('.dg-rail')).toHaveCount(0);
    await page.getByRole('button', { name: /Exit present/i }).click();
    await expect(page.locator('.dg-rail')).toBeVisible();
  });

  test('Room look vs Light panel IA', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.getByRole('button', { name: 'Room look' }).click();
    await expect(page.locator('.dg-sheet-header__title', { hasText: 'Room look' })).toBeVisible();
    await expect(page.getByText('Time of day')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await page.locator('.dg-rail-btn', { hasText: 'Light' }).click();
    await expect(page.locator('.dg-sheet-header__title', { hasText: 'Light & mood' })).toBeVisible();
    await expect(page.getByText('Time of day')).toBeVisible();
  });

  test('phone shell uses dock and floor-plan overflow', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await enterGuestDesigner(page);

    await expect(page.locator('.dg-page.is-phone')).toBeVisible();
    await expect(page.locator('.dgm-dock')).toBeVisible();
    await expect(page.locator('.dg-rail')).toHaveCount(0);
    await expect(page.locator('[class*="dgm-"]')).not.toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: /Edit floor plan/i })).toBeVisible();
  });

  test('desktop widths never mount dgm chrome', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await enterGuestDesigner(page);
    await expect(page.locator('.dg-page.is-phone')).toHaveCount(0);
    await expect(page.locator('[class*="dgm-"]')).toHaveCount(0);
    await expect(page.locator('.dg-rail')).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('.dg-page.is-phone')).toHaveCount(0);
    await expect(page.locator('[class*="dgm-"]')).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.dg-page.is-phone')).toHaveCount(0);
    await expect(page.locator('.dg-rail')).toBeVisible();
  });

  test('opening model card from library does not spawn an extra WebGL canvas', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await enterGuestDesigner(page);

    const canvasCountBefore = await page.locator('canvas').count();
    await page.locator('.dg-rail-btn.is-primary').click();
    await expect(page.locator('.dg-sheet, .dg-mobile-sheet').first()).toBeVisible();

    // Wait for catalog rows, then click the name button (onOpenModel), not "+".
    const addBtn = page.getByRole('button', { name: /^Add / }).first();
    await expect(addBtn).toBeVisible({ timeout: 30_000 });
    const nameBtn = addBtn.locator('xpath=preceding-sibling::button[1]');
    await nameBtn.click();

    await expect(page.locator('.md-card, .md-backdrop').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);

    const canvasCountAfter = await page.locator('canvas').count();
    expect(canvasCountAfter).toBe(canvasCountBefore);
    await expect(page.locator('.furniture-preview canvas')).toHaveCount(0);
  });
});
