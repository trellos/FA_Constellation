import { test, expect } from '@playwright/test';
import {
  drag,
  dragUntilAdvanced,
  gameToClient,
  readPoints,
  readState,
  tapPlay,
  waitForGameReady,
} from './helpers';

test.describe('Constellation activity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
  });

  test('boots into the Intro phase with a constellation loaded', async ({ page }) => {
    const s = await readState(page);
    expect(s.phase).toBe('Intro');
    expect(s.totalPoints).toBeGreaterThanOrEqual(2);
    expect(s.constellationName.length).toBeGreaterThan(0);
  });

  test('Play button responds to a tap', async ({ page }) => {
    await tapPlay(page);
    await expect
      .poll(async () => (await readState(page)).phase, { timeout: 3_000 })
      .toBe('Tracing');
    const s = await readState(page);
    expect(s.currentIndex).toBe(0);
  });

  test('drag from current node to target advances the segment', async ({ page }) => {
    await tapPlay(page);
    await expect.poll(async () => (await readState(page)).phase).toBe('Tracing');
    const points = await readPoints(page);
    expect(points.length).toBeGreaterThanOrEqual(2);

    await drag(page, points[0]!, points[1]!);
    await expect.poll(async () => (await readState(page)).currentIndex, { timeout: 3_000 }).toBe(1);
  });

  test('completing every segment reaches Reveal then End', async ({ page }) => {
    // 7+ sequential real drags with retries can run close to the default
    // 30 s test budget — and beyond it under cold-cache headless Chromium.
    test.setTimeout(60_000);
    await tapPlay(page);
    await expect.poll(async () => (await readState(page)).phase).toBe('Tracing');
    const points = await readPoints(page);
    expect(points.length).toBeGreaterThanOrEqual(2);

    // Drive every segment with a real mouse drag through Phaser's full input
    // pipeline. dragUntilAdvanced retries up to 3 times if a single drag
    // didn't fire the snap, so this test isn't sensitive to losing one
    // pointer event in headless Chromium.
    for (let i = 0; i < points.length - 1; i++) {
      await dragUntilAdvanced(page, points[i]!, points[i + 1]!, i + 1);
    }

    // After the final segment, Tracing -> Reveal (camera+outline tween) -> End
    // (delayed 900 ms). Give the chain time to settle.
    await expect.poll(async () => (await readState(page)).phase, { timeout: 8_000 }).toBe('End');
    const s = await readState(page);
    expect(s.outlineAlpha).toBeGreaterThan(0.5);
    expect(s.constellationName.length).toBeGreaterThan(0);
  });

  test('a tap directly on the next target snaps without dragging', async ({ page }) => {
    await tapPlay(page);
    await expect.poll(async () => (await readState(page)).phase).toBe('Tracing');
    const points = await readPoints(page);
    const target = await gameToClient(page, points[1]!);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(async () => (await readState(page)).currentIndex, { timeout: 2_000 }).toBe(1);
  });

  test('releasing mid-drag without reaching target keeps the current segment', async ({ page }) => {
    await tapPlay(page);
    await expect.poll(async () => (await readState(page)).phase).toBe('Tracing');
    const points = await readPoints(page);
    // Drag in the opposite direction from the target so the release is
    // guaranteed to be outside the snap tolerance regardless of segment
    // length or randomly-picked constellation.
    const away = {
      x: points[0]!.x - (points[1]!.x - points[0]!.x) * 0.3,
      y: points[0]!.y - (points[1]!.y - points[0]!.y) * 0.3,
    };
    await drag(page, points[0]!, away);
    const s = await readState(page);
    expect(s.currentIndex).toBe(0);
    expect(s.phase).toBe('Tracing');
  });
});
