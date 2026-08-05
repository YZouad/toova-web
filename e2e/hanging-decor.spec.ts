import { test, expect } from '@playwright/test';

test.describe('hanging decorations', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/hanging-visual.html');
    await page.waitForSelector('[data-testid="hanging-room"] canvas', {
      timeout: 30_000,
    });
    await page.waitForFunction(() => Boolean(window.__TOOVA_HANGING__), null, {
      timeout: 10_000,
    });
    // Let leaves/lights settle.
    await page.waitForTimeout(2000);
  });

  test('seeds leaf + LED hangings and exposes store helpers', async ({ page }) => {
    const summary = await page.evaluate(() => {
      const s = window.__TOOVA_HANGING__!.getState();
      const hangings = s.order
        .map((id) => s.items[id])
        .filter((it) => it?.kind === 'hanging');
      return {
        count: hangings.length,
        kinds: hangings.map((h) => h!.hanging!.kind).sort(),
        hasMultiPalette: hangings.some(
          (h) => (h!.hanging?.palette.length ?? 0) > 1,
        ),
      };
    });
    expect(summary.count).toBeGreaterThanOrEqual(2);
    expect(summary.kinds).toContain('leaves');
    expect(summary.kinds).toContain('lights');
    expect(summary.hasMultiPalette).toBe(true);
  });

  test('finishes a new multi-anchor draft and can cancel another', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const createdId = await page.evaluate(() => window.__TOOVA_HANGING__!.addLights());
    expect(createdId).toBeTruthy();

    const afterAdd = await page.evaluate((id) => {
      const s = window.__TOOVA_HANGING__!.getState();
      return {
        exists: Boolean(s.items[id]),
        kind: s.items[id]?.hanging?.kind,
        draft: s.hangingDraft,
        tool: s.designerTool,
      };
    }, createdId);
    expect(afterAdd.exists).toBe(true);
    expect(afterAdd.kind).toBe('lights');
    expect(afterAdd.draft).toBeNull();
    expect(afterAdd.tool).toBe('select');

    await page.evaluate(() => {
      window.__TOOVA_HANGING__!.getState().beginHangingDraft('leaves');
    });
    await page.waitForFunction(
      () => window.__TOOVA_HANGING__!.getState().hangingDraft?.kind === 'leaves',
      null,
      { timeout: 10_000 },
    );
    await page.evaluate(() => window.__TOOVA_HANGING__!.cancelDraft());
    await page.waitForFunction(
      () => window.__TOOVA_HANGING__!.getState().hangingDraft === null,
      null,
      { timeout: 10_000 },
    );
  });

  test('updates LED palette and removes decorations', async ({ page }) => {
    const lightId = await page.evaluate(() => {
      const s = window.__TOOVA_HANGING__!.getState();
      return s.order.find((id) => s.items[id]?.hanging?.kind === 'lights')!;
    });

    await page.evaluate((id) => {
      window.__TOOVA_HANGING__!.setPalette(id, ['#ffffff', '#00ffaa']);
    }, lightId);

    const palette = await page.evaluate((id) => {
      return window.__TOOVA_HANGING__!.getState().items[id]?.hanging?.palette;
    }, lightId);
    expect(palette).toEqual(['#ffffff', '#00ffaa']);

    await page.evaluate((id) => window.__TOOVA_HANGING__!.remove(id), lightId);
    const gone = await page.evaluate(
      (id) => !window.__TOOVA_HANGING__!.getState().items[id],
      lightId,
    );
    expect(gone).toBe(true);
  });

  test('furniture-attached hangings follow dresser moves', async ({ page }) => {
    const before = await page.evaluate(() => {
      const s = window.__TOOVA_HANGING__!.getState();
      const dresser = Object.values(s.items).find((i) => i.kind === 'dresser')!;
      const hanging = Object.values(s.items).find(
        (i) =>
          i.kind === 'hanging' &&
          i.hanging?.anchors.some(
            (a) => a.surface === 'furniture' && a.attachmentKey === dresser.attachmentKey,
          ),
      )!;
      return {
        dresserId: dresser.id,
        hangingId: hanging.id,
        dresserPos: [...dresser.position] as [number, number, number],
      };
    });

    await page.evaluate((dresserId) => {
      window.__TOOVA_HANGING__!.getState().updatePosition(dresserId, [80, 0, 60]);
    }, before.dresserId);

    // Wait a frame for hanging bounds sync
    await page.waitForTimeout(300);

    const stillLinked = await page.evaluate(({ hangingId, dresserId }) => {
      const s = window.__TOOVA_HANGING__!.getState();
      const dresser = s.items[dresserId]!;
      const hanging = s.items[hangingId]!;
      return hanging.hanging!.anchors.some(
        (a) =>
          a.surface === 'furniture' && a.attachmentKey === dresser.attachmentKey,
      );
    }, before);
    expect(stillLinked).toBe(true);
  });

  test('visual smoke: hanging room canvas screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const noop = () => 0;
      window.requestAnimationFrame = noop as typeof requestAnimationFrame;
    });
    await page.waitForTimeout(100);
    const shot = await page.locator('[data-testid="hanging-room"]').screenshot();
    expect(shot).toMatchSnapshot('hanging-room.png', {
      maxDiffPixelRatio: 0.12,
    });
  });
});
