import { test, expect } from '@playwright/test';
import path from 'node:path';
import { dragUntilAdvanced, readPoints, readState, tapPlay, waitForGameReady } from './helpers';

/**
 * Same playthrough as `playthrough.spec.ts`, but captures a screenshot before
 * each star connection (i.e. before each drag) and at the end screen. Useful
 * as a visual smoke artifact; not asserting visual equality.
 *
 * Screenshots are saved under `test-results/playthrough/` at the repo root.
 */
test('playthrough with per-segment screenshots', async ({ page }) => {
  test.setTimeout(90_000);

  const outDir = path.resolve(process.cwd(), 'test-results', 'playthrough');

  await page.goto('/');
  await waitForGameReady(page);

  // Screenshot 00: Intro screen with Play button visible.
  await page.screenshot({ path: path.join(outDir, '00-intro.png') });

  // Start tracing (retry-tolerant — single-click assertion lives in playthrough.spec.ts).
  await tapPlay(page);
  await expect.poll(async () => (await readState(page)).phase, { timeout: 5_000 }).toBe('Tracing');

  const points = await readPoints(page);
  expect(points.length).toBeGreaterThanOrEqual(2);
  const name = (await readState(page)).constellationName;

  // For each segment, screenshot BEFORE the drag, then perform the drag.
  for (let i = 0; i < points.length - 1; i++) {
    const idx = String(i + 1).padStart(2, '0');
    await page.screenshot({
      path: path.join(outDir, `${idx}-before-star-${i + 1}-to-${i + 2}.png`),
    });
    await dragUntilAdvanced(page, points[i]!, points[i + 1]!, i + 1);
  }

  // Wait for End phase and screenshot the end screen.
  await expect.poll(async () => (await readState(page)).phase, { timeout: 8_000 }).toBe('End');
  // Let the end-screen fade-in tween (400 ms) settle.
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, `99-end-screen.png`) });

  process.stdout.write(`Saved playthrough screenshots for "${name}" to ${outDir}\n`);
});
