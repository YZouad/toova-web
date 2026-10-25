import { test, expect, type Page } from '@playwright/test';

async function openHarness(page: Page) {
  await page.goto('/notifications-visual.html');
  await expect(page.getByTestId('notif-harness-status')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean(window.__TOOVA_NOTIF_HARNESS__));
}

async function openRailBell(page: Page) {
  const trigger = page.locator('.notif-bell--rail .notif-bell__trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator('.notif-dropdown')).toBeVisible();
  return trigger;
}

test.describe('notifications', () => {
  test('desktop rail mounts a single bell and keeps the panel anchored', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHarness(page);

    await expect(page.locator('.notif-bell')).toHaveCount(1);
    await expect(page.locator('.notif-bell--rail')).toHaveCount(1);

    const trigger = await openRailBell(page);
    const panel = page.locator('.notif-dropdown');

    const geometry = await page.evaluate(() => {
      const bell = document.querySelector('.notif-bell__trigger') as HTMLElement | null;
      const dropdown = document.querySelector('.notif-dropdown') as HTMLElement | null;
      if (!bell || !dropdown) return null;
      const b = bell.getBoundingClientRect();
      const p = dropdown.getBoundingClientRect();
      return {
        side: dropdown.getAttribute('data-side'),
        bellCenterY: b.top + b.height / 2,
        panelTop: p.top,
        panelBottom: p.bottom,
        panelLeft: p.left,
        bellRight: b.right,
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.side).toBe('right');
    expect(geometry!.panelLeft).toBeGreaterThan(geometry!.bellRight - 1);
    expect(geometry!.bellCenterY).toBeGreaterThan(geometry!.panelTop);
    expect(geometry!.bellCenterY).toBeLessThan(geometry!.panelBottom);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('mobile drawer bell opens above the trigger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHarness(page);

    await page.getByRole('button', { name: 'Open menu' }).click();
    const trigger = page.locator('.kit-app-shell__drawer--open .notif-bell__trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const panel = page.locator('.notif-dropdown');
    await expect(panel).toBeVisible();
    const side = await panel.getAttribute('data-side');
    expect(side === 'above' || side === 'right').toBeTruthy();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
  });

  test('mark all read, activate routing, and toast filtering', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHarness(page);

    await expect(page.getByTestId('notif-harness-status')).toHaveText('2 unread');

    await openRailBell(page);
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByTestId('notif-harness-status')).toHaveText('caught up', {
      timeout: 5_000,
    });

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__TOOVA_NOTIF_HARNESS__?.reloadFixture());
    await expect(page.getByTestId('notif-harness-status')).toHaveText('2 unread');

    await openRailBell(page);
    await page.locator('.notif-dropdown__item', { hasText: 'Someone copied your room' }).click();
    await expect(page.getByTestId('notif-harness-actions')).toContainText('designer');

    await page.evaluate(() =>
      window.__TOOVA_NOTIF_HARNESS__?.pushToast({
        kind: 'model_ready',
        title: 'Toast model ready',
      }),
    );
    await expect(page.getByText('Toast model ready')).toBeVisible();
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByTestId('notif-harness-actions')).toContainText('modelJob');

    await page.evaluate(() =>
      window.__TOOVA_NOTIF_HARNESS__?.pushToast({
        kind: 'room_liked',
        title: 'Should not toast social',
      }),
    );
    await expect(page.getByText('Should not toast social')).toHaveCount(0);
  });

  test('arrow keys move between items and preferences save', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHarness(page);

    const trigger = await openRailBell(page);
    const panel = page.locator('.notif-dropdown');
    await panel.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.notif-dropdown__item').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.notif-dropdown__item').nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('.notif-dropdown__item').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await page.getByRole('checkbox', { name: 'Send me Toova emails' }).click();
    await expect(page.locator('.notification-prefs__status')).toContainText(/saved|Saving/i);
  });
});
