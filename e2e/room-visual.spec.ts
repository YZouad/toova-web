import { test, expect } from '@playwright/test';

test.describe('IKEA-style room visual', () => {
  test('catalog cutaway harness is stable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/visual.html');
    await page.waitForSelector('[data-testid="visual-room"] canvas', { timeout: 30_000 });
    // Allow textures / first frames to settle.
    await page.waitForTimeout(3000);
    // Freeze rAF so continuous WebGL frames don't defeat screenshot stability checks.
    await page.evaluate(() => {
      const noop = () => 0;
      window.requestAnimationFrame = noop as typeof requestAnimationFrame;
    });
    await page.waitForTimeout(100);
    const shot = await page.locator('[data-testid="visual-room"]').screenshot();
    expect(shot).toMatchSnapshot('room-catalog.png', {
      maxDiffPixelRatio: 0.08,
    });
  });
});
