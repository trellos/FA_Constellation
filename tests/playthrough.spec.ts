import { test, expect } from '@playwright/test';
import {
  dragUntilAdvanced,
  gameToClient,
  readPoints,
  readState,
  waitForGameReady,
} from './helpers';

/**
 * Full playthrough: a single click on Start enters Tracing, every star is
 * reachable in sequence, and the EndScreen overlay actually renders.
 */
test('full constellation playthrough: start, connect every star, end screen', async ({ page }) => {
  // 7+ segments with retries can run close to the default 30 s budget on a
  // cold headless Chromium; mirror the existing completion test's timeout.
  test.setTimeout(60_000);

  await page.goto('/');
  await waitForGameReady(page);

  // 1. Start button responds to a SINGLE click (no retries).
  const playClient = await gameToClient(page, { x: 960, y: 720 });
  await page.mouse.click(playClient.x, playClient.y, { delay: 60 });
  await expect.poll(async () => (await readState(page)).phase, { timeout: 3_000 }).toBe('Tracing');
  expect((await readState(page)).currentIndex).toBe(0);

  // 2. Every star is connectable: walk the full sequence.
  const points = await readPoints(page);
  expect(points.length).toBeGreaterThanOrEqual(2);
  const name = (await readState(page)).constellationName;
  expect(name.length).toBeGreaterThan(0);

  for (let i = 0; i < points.length - 1; i++) {
    await dragUntilAdvanced(page, points[i]!, points[i + 1]!, i + 1);
    const s = await readState(page);
    // After each drag, the segment index must have advanced. On the final
    // segment the scene may have already left Tracing for Reveal/End, which
    // is also a success signal — treat that as "fully advanced".
    const reached = s.phase === 'Tracing' ? s.currentIndex : points.length - 1;
    expect(reached).toBeGreaterThanOrEqual(i + 1);
  }

  // 3. End screen shows correctly: phase reaches End, outline is revealed, and
  // the EndScreen overlay's title text (constellation name, uppercase) is
  // present in the scene's display list.
  await expect.poll(async () => (await readState(page)).phase, { timeout: 8_000 }).toBe('End');
  const final = await readState(page);
  expect(final.outlineAlpha).toBeGreaterThan(0.5);

  const endTitleVisible = await page.evaluate((expectedName: string) => {
    const w = window as unknown as {
      __game: {
        scene: {
          scenes: { scene: { key: string } }[];
          getScene: (k: string) => { children: { list: unknown[] } };
        };
      };
    };
    const entry = w.__game.scene.scenes.find((s) => s.scene.key.startsWith('display_'));
    if (!entry) return false;
    const display = w.__game.scene.getScene(entry.scene.key);
    const target = expectedName.toUpperCase();
    type Node = { type?: string; text?: string; list?: unknown[] };
    function find(o: Node): boolean {
      if (o.type === 'Text' && o.text === target) return true;
      if (o.list) {
        for (const c of o.list) {
          if (find(c as Node)) return true;
        }
      }
      return false;
    }
    return display.children.list.some((c) => find(c as Node));
  }, name);
  expect(endTitleVisible).toBe(true);
});
