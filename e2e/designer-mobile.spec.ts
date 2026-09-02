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
  await page.getByRole('button', { name: /Rectangle/i }).click();
  await expect(page.locator('.dg-page.is-phone')).toBeVisible({ timeout: 60_000 });
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

async function assertMinTapTarget(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).toBeTruthy();
  expect(box!.height).toBeGreaterThanOrEqual(38);
  expect(box!.width).toBeGreaterThanOrEqual(38);
}

test.describe('mobile designer phone states', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('home: topbar, chips, dock', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await expect(page.locator('.dgm-topbar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(page.locator('.dgm-dock')).toBeVisible();
    await expect(page.locator('.dgm-dock-btn')).toHaveCount(4);
    await expect(page.locator('.dgm-pill').first()).toBeVisible();
    await assertMinTapTarget(page, '.dgm-icon-btn');
    await assertNoHorizontalOverflow(page);
  });

  test('add / look / light / pieces sheets', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('[data-tour-id="dock-add"]').click();
    await expect(page.locator('.dgm-sheet--add')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.dgm-sheet--add').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.dgm-sheet--add')).toHaveCount(0);

    await page.locator('.dgm-dock-btn', { hasText: 'Room look' }).click();
    await expect(page.locator('.dgm-sheet--look')).toBeVisible();
    await page.locator('.dgm-sheet--look').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.dgm-sheet--look')).toHaveCount(0);

    await page.locator('.dgm-dock-btn', { hasText: 'Light' }).click();
    await expect(page.locator('.dgm-sheet--light')).toBeVisible();
    await page.locator('.dgm-sheet--light').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.dgm-sheet--light')).toHaveCount(0);

    await page.locator('.dgm-dock-btn', { hasText: 'Pieces' }).click();
    await expect(page.locator('.dgm-sheet--pieces')).toBeVisible();
    await page.locator('.dgm-sheet--pieces').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.dgm-dock')).toBeVisible();
  });

  test('checklist budget pill opens sheet', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('[data-tour-id="ticker"]').click();
    await expect(page.locator('.dgm-sheet--checklist')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set a budget' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('import camera-first routes', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('[data-tour-id="dock-add"]').click();
    await expect(page.locator('.dgm-sheet--add')).toBeVisible();
    const own = page.getByRole('button', { name: /Bring in your own piece/i });
    await expect(own).toBeVisible();
    await own.click();
    await expect(page.getByRole('dialog', { name: /Sign up to bring in your own pieces/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create free account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Log in/i })).toBeVisible();
    await page.getByRole('button', { name: /Not now/i }).click();
    await expect(page.getByRole('dialog', { name: /Sign up to bring in your own pieces/i })).toHaveCount(0);
  });

  test('draw chrome from light sheet', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('.dgm-dock-btn', { hasText: 'Light' }).click();
    await expect(page.locator('.dgm-sheet--light')).toBeVisible();
    const draw = page.getByRole('button', { name: /String lights|Draw string|Leaves/i }).first();
    await expect(draw).toBeVisible();
    await draw.click();
    await expect(page.locator('.dgm-draw-card, .dgm-draw-bar').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.locator('.dgm-dock')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.dgm-dock')).toBeVisible({ timeout: 10_000 });
  });

  test('checklist opens and supports item drill-down when lines exist', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.locator('[data-tour-id="ticker"]').click();
    await expect(page.locator('.dgm-sheet--checklist')).toBeVisible();
    const line = page.locator('.dgm-checklist-item').first();
    if (await line.isVisible().catch(() => false)) {
      await line.click();
      await expect(page.locator('.dgm-checklist-detail-head')).toBeVisible({ timeout: 8_000 });
      await page.locator('.dgm-back-btn').click();
      await expect(page.locator('.dgm-checklist-detail-head')).toHaveCount(0);
    }
  });

  test('present bar + More → Edit floor plan', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Present' }).click();
    await expect(page.locator('.dgm-present-bar, .dgm-present-hint').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /Edit/i }).click();
    await expect(page.locator('.dgm-dock')).toBeVisible();

    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: /Edit floor plan/i })).toBeVisible();
  });

  test('search opens command palette and restores focus', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await enterGuestDesigner(page);

    const search = page.getByRole('button', { name: 'Search' });
    await search.click();
    await expect(page.locator('.dg-cmdk')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.dg-cmdk')).toHaveCount(0);
    await expect(search).toBeFocused();
  });
});

test.describe('mobile designer responsive smoke', () => {
  for (const size of [
    { width: 360, height: 800 },
    { width: 430, height: 932 },
  ]) {
    test(`${size.width}×${size.height} safe layout`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(size);
      await page.goto('/');
      await enterGuestDesigner(page);
      await expect(page.locator('.dgm-dock')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertMinTapTarget(page, '.dgm-dock-btn.is-primary');
      await page.getByRole('button', { name: 'Search' }).click();
      await expect(page.locator('.dg-cmdk')).toBeVisible();
    });
  }
});
