import Phaser from 'phaser';
import { BootScene } from './BootScene';

// Headless preview browsers report `document.hidden=true` at boot, which both
// makes Phaser auto-pause AND makes the browser throttle requestAnimationFrame.
// Detect that condition and apply workarounds; in a real browser the page is
// already visible at boot, so we leave Phaser's defaults alone.
const isHeadlessHidden = import.meta.env.DEV && document.hidden;

// Playwright sets navigator.webdriver=true. In automated (CI) headless Chromium,
// requestAnimationFrame can be deprioritized even when document.hidden is false,
// causing the game loop to miss input events between pointerdown and pointerup.
// Force setTimeout-based ticking for all Playwright-driven sessions so the loop
// ticks reliably regardless of rAF scheduling policy.
const isAutomated = import.meta.env.DEV && !!navigator.webdriver;
if (isHeadlessHidden) {
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  } catch {
    // ignore
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Portrait 9:16 play area. The gradient + starfield are painted by
  // index.html across the whole viewport, so the canvas sits transparently
  // on top — on a landscape monitor the starfield bleeds beyond the
  // letterboxed canvas instead of leaving hard side-bars.
  width: 1080,
  height: 1920,
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // forceSetTimeOut keeps the loop ticking in headless preview where rAF is
  // throttled. Real browsers use rAF for smooth vsync-aligned rendering.
  fps: { target: 60, forceSetTimeOut: isHeadlessHidden || isAutomated },
  // preserveDrawingBuffer lets the headless preview snapshot the WebGL canvas;
  // disabled in production to let the compositor reuse the back-buffer.
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    preserveDrawingBuffer: isHeadlessHidden || isAutomated,
  },
  input: { activePointers: 3 },
  scene: [BootScene],
});

// Dev-only side door: the Playwright suite in tests/helpers.ts introspects
// `window.__game.scene.scenes` to drive and assert on scene state. Renaming,
// deleting, or guarding this differently will break the e2e tests.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
