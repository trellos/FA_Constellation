import Phaser from 'phaser';
import { BootScene } from './BootScene';

// Headless preview browsers report `document.hidden=true` at boot, which both
// makes Phaser auto-pause AND makes the browser throttle requestAnimationFrame.
// Detect that condition and apply workarounds; in a real browser the page is
// already visible at boot, so we leave Phaser's defaults alone.
const isHeadlessHidden = import.meta.env.DEV && document.hidden;
if (isHeadlessHidden) {
  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  } catch {
    // ignore
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#0a0a3a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // forceSetTimeOut keeps the loop ticking in headless preview where rAF is
  // throttled. Real browsers use rAF for smooth vsync-aligned rendering.
  fps: { target: 60, forceSetTimeOut: isHeadlessHidden },
  // preserveDrawingBuffer lets the headless preview snapshot the WebGL canvas;
  // disabled in production to let the compositor reuse the back-buffer.
  render: { antialias: true, pixelArt: false, roundPixels: false, preserveDrawingBuffer: isHeadlessHidden },
  input: { activePointers: 3 },
  scene: [BootScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

