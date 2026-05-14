import type { Page } from '@playwright/test';

/**
 * Helpers for driving the constellation activity end-to-end.
 * Everything is scoped through `window.__game`, which `src/main.ts` exposes
 * in DEV builds.
 */

interface GameWindow extends Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __game: any;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Wait until Phaser has constructed the game, the ConstellationDisplay
 * scene's create() has run, and the Intro modal's Play button is mounted.
 *
 * `phase === 'Intro'` is true even before create() runs (it's the class
 * field default), so we must also verify points were laid out and the
 * Play text node is present in the display tree.
 */
export async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as GameWindow;
      const g = w.__game;
      if (!g) return false;
      // Find the live display scene (display_1, display_2, ...).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sceneEntry = g.scene.scenes.find((s: any) => s.scene.key.startsWith('display_'));
      if (!sceneEntry) return false;
      const display = sceneEntry;
      if (display.phase !== 'Intro') return false;
      if (!display.points || display.points.length === 0) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function findText(o: any, text: string): boolean {
        if (o.type === 'Text' && o.text === text) return true;
        if (o.list) for (const c of o.list) if (findText(c, text)) return true;
        return false;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return display.children.list.some((c: any) => findText(c, 'Play'));
    },
    null,
    { timeout: 10_000 },
  );
}

/** Read the active display scene's current state. */
export async function readState(page: Page): Promise<{
  sceneKey: string;
  phase: 'Intro' | 'Tracing' | 'Reveal' | 'End';
  currentIndex: number;
  totalPoints: number;
  constellationName: string;
  outlineAlpha: number;
}> {
  return page.evaluate(() => {
    const w = window as unknown as GameWindow;
    const g = w.__game;
    const sceneKey = g.scene.scenes.find((s: { scene: { key: string } }) => s.scene.key !== 'boot')!
      .scene.key;
    const display = g.scene.getScene(sceneKey);
    return {
      sceneKey,
      phase: display.phase,
      currentIndex: display.currentIndex,
      totalPoints: display.points.length,
      constellationName: display.constellationData?.name ?? '',
      outlineAlpha: display.outlineImage?.alpha ?? 0,
    };
  });
}

/**
 * Read the screen positions (in game-pixel coords) of the constellation's
 * trace points from the running scene.
 */
export async function readPoints(page: Page): Promise<ScreenPoint[]> {
  return page.evaluate(() => {
    const w = window as unknown as GameWindow;
    const g = w.__game;
    const sceneKey = g.scene.scenes.find((s: { scene: { key: string } }) => s.scene.key !== 'boot')!
      .scene.key;
    const display = g.scene.getScene(sceneKey);
    return display.points.map((p: ScreenPoint) => ({ x: p.x, y: p.y }));
  });
}

/** Convert a game-pixel coordinate to a client-pixel coordinate on the canvas. */
export async function gameToClient(page: Page, p: ScreenPoint): Promise<ScreenPoint> {
  return page.evaluate(({ x: gx, y: gy }) => {
    const canvas = document.querySelector('canvas')!;
    const r = canvas.getBoundingClientRect();
    // Phaser game coordinate space is 1920×1080.
    const cx = r.left + (gx / 1920) * r.width;
    const cy = r.top + (gy / 1080) * r.height;
    return { x: cx, y: cy };
  }, p);
}

/**
 * Click the Play button. `page.mouse.click` with a small `delay` between
 * down/up is more reliable in headless than back-to-back `down()`+`up()`.
 * Retries a couple of times — Phaser's input plugin sometimes hasn't fully
 * indexed the newly-mounted interactive button on the very first frame after
 * `waitForGameReady` returns.
 */
export async function tapPlay(page: Page): Promise<void> {
  const playClient = await gameToClient(page, { x: 960, y: 720 });
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt < 3) {
      // Real OS-level click — reliable in headed and most headless envs.
      await page.mouse.click(playClient.x, playClient.y, { delay: 60 });
    } else {
      // Fallback: dispatch PointerEvents directly on the canvas so Phaser's
      // input plugin receives them even when OS-level mouse routing is
      // unreliable (headless Linux CI runners).
      await page.evaluate(
        ({ cx, cy }: { cx: number; cy: number }) => {
          const canvas = document.querySelector('canvas');
          if (!canvas) return;
          const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1 };
          canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
          canvas.dispatchEvent(new PointerEvent('pointerup', opts));
        },
        { cx: playClient.x, cy: playClient.y },
      );
    }
    // Give Phaser ~10 frames to process the input and advance phase.
    await page.waitForTimeout(200);
    const phase = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          scene: {
            scenes: { scene: { key: string } }[];
            getScene: (k: string) => { phase: string };
          };
        };
      };
      const entry = w.__game.scene.scenes.find((s) => s.scene.key.startsWith('display_'));
      return entry ? w.__game.scene.getScene(entry.scene.key).phase : null;
    });
    if (phase === 'Tracing') return;
  }
}

/**
 * Drag from `from` (game coords) to `to` (game coords) with a sequence of
 * mouse-move steps so Phaser's pointermove handler fires repeatedly.
 * The down-then-move-then-up sequence is paced with brief sleeps so each
 * event lands on its own animation frame.
 */
export async function drag(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
  steps = 12,
): Promise<void> {
  const a = await gameToClient(page, from);
  const b = await gameToClient(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.waitForTimeout(40);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

/**
 * Drag, and retry if the expected segment didn't advance. Headless Chromium
 * occasionally drops one of the pointer events, especially mid-drag.
 */
export async function dragUntilAdvanced(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
  expectedIndex: number,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await drag(page, from, to);
    await page.waitForTimeout(200);
    const s = await readState(page);
    if (s.phase !== 'Tracing' || s.currentIndex >= expectedIndex) return;
  }
}
