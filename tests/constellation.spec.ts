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

  test('a tap directly on the next target does NOT advance — dragging is required', async ({
    page,
  }) => {
    await tapPlay(page);
    await expect.poll(async () => (await readState(page)).phase).toBe('Tracing');
    const points = await readPoints(page);
    const target = await gameToClient(page, points[1]!);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.up();
    // Give the scene a tick to process — the segment must NOT have advanced.
    await page.waitForTimeout(400);
    const s = await readState(page);
    expect(s.currentIndex).toBe(0);
    expect(s.phase).toBe('Tracing');
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

test.describe('Debug picker (?debug=1)', () => {
  test('shows a constellation picker on the title screen and switches on tap', async ({ page }) => {
    await page.goto('/?debug=1');
    await waitForGameReady(page);

    // The picker renders a button for every available constellation. Each
    // button is a Phaser Text node whose label is either the constellation
    // name or "${name} ✓" for the currently-mounted one.
    const before = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          scene: { scenes: Array<{ scene: { key: string }; children: { list: unknown[] } }> };
        };
      };
      const display = w.__game.scene.scenes.find((s) => s.scene.key.startsWith('display_'))!;
      function collectText(o: unknown, acc: string[]): void {
        const node = o as { type?: string; text?: string; list?: unknown[] };
        if (node.type === 'Text' && typeof node.text === 'string') acc.push(node.text);
        if (node.list) for (const c of node.list) collectText(c, acc);
      }
      const labels: string[] = [];
      for (const c of display.children.list) collectText(c, labels);
      return labels;
    });
    // At least one debug label and one "currently selected" marker should be
    // present — there are at least 4 constellations in this build.
    expect(before.filter((t) => t.endsWith(' ✓')).length).toBe(1);
    expect(before.includes('DEBUG: pick')).toBe(true);
    await page.screenshot({ path: 'test-results/debug-picker-title.png' });
    const currentLabel = before.find((t) => t.endsWith(' ✓'))!.replace(/ ✓$/, '');

    // Pick a different constellation by clicking its button.
    const otherName = await page.evaluate((current) => {
      const w = window as unknown as {
        __game: {
          scene: {
            scenes: Array<{
              scene: { key: string };
              children: { list: unknown[] };
              input: { hitTestPointer: (...a: unknown[]) => unknown };
            }>;
          };
        };
      };
      const display = w.__game.scene.scenes.find((s) => s.scene.key.startsWith('display_'))!;
      function find(o: unknown, label: string): { x: number; y: number } | null {
        const node = o as {
          type?: string;
          text?: string;
          parentContainer?: { x: number; y: number; parentContainer?: { x: number; y: number } };
          list?: unknown[];
        };
        if (node.type === 'Text' && node.text === label) {
          // Walk up the container chain to compute world position.
          let x = 0;
          let y = 0;
          let p: { x: number; y: number; parentContainer?: { x: number; y: number } } | undefined =
            node.parentContainer;
          while (p) {
            x += p.x;
            y += p.y;
            p = p.parentContainer;
          }
          return { x, y };
        }
        if (node.list) {
          for (const c of node.list) {
            const r = find(c, label);
            if (r) return r;
          }
        }
        return null;
      }
      const labels = ['Volcano', 'Lavaling', 'Sleepy Stone', 'Bunny'].filter((n) => n !== current);
      for (const label of labels) {
        for (const c of display.children.list) {
          const pos = find(c, label);
          if (pos) return label;
        }
      }
      return null;
    }, currentLabel);

    expect(otherName).not.toBeNull();

    // Click the other constellation's button. We resolve its on-canvas position
    // and convert from game-coords to client-coords.
    const target = await page.evaluate((label) => {
      const w = window as unknown as {
        __game: {
          scene: { scenes: Array<{ scene: { key: string }; children: { list: unknown[] } }> };
        };
      };
      const display = w.__game.scene.scenes.find((s) => s.scene.key.startsWith('display_'))!;
      function find(o: unknown, l: string): { x: number; y: number } | null {
        const node = o as {
          type?: string;
          text?: string;
          parentContainer?: { x: number; y: number; parentContainer?: { x: number; y: number } };
          list?: unknown[];
        };
        if (node.type === 'Text' && node.text === l) {
          let x = 0;
          let y = 0;
          let p: { x: number; y: number; parentContainer?: { x: number; y: number } } | undefined =
            node.parentContainer;
          while (p) {
            x += p.x;
            y += p.y;
            p = p.parentContainer;
          }
          return { x, y };
        }
        if (node.list) {
          for (const c of node.list) {
            const r = find(c, l);
            if (r) return r;
          }
        }
        return null;
      }
      for (const c of display.children.list) {
        const r = find(c, label!);
        if (r) return r;
      }
      return null;
    }, otherName);

    expect(target).not.toBeNull();
    const client = await gameToClient(page, target!);
    await page.mouse.click(client.x, client.y);

    // After picking, the mounted constellation's name should equal the picked label.
    await expect
      .poll(async () => (await readState(page)).constellationName, { timeout: 5_000 })
      .toBe(otherName!);
  });
});
