import Phaser from 'phaser';
import type { DebugPickerData } from '../ConstellationDisplay';
import { pad2 } from '../types';

const PANEL_FILL = 0x1b1a4a;
const PANEL_STROKE = 0x7e6fff;
const TEXT_COLOR = '#FFFFFF';
const BTN_TOP = 0x2a8ae0;
const BTN_BOTTOM = 0x1a60b0;
const DEBUG_BTN_TOP = 0x9c5be0;
const DEBUG_BTN_BOTTOM = 0x5a2da0;
const DIM_ALPHA = 0.55;

/** "CONNECT STARS" intro modal — full-screen blocker with a Play button. */
export class IntroModal {
  private readonly scene: Phaser.Scene;
  private readonly onPlay: () => void;
  private readonly debug: DebugPickerData | null;
  private readonly container: Phaser.GameObjects.Container;
  private readonly dimmer: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Container;
  private debugPanel: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, onPlay: () => void, debug: DebugPickerData | null = null) {
    this.scene = scene;
    this.onPlay = onPlay;
    this.debug = debug;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(1000);

    this.dimmer = scene.add.rectangle(0, 0, 10, 10, 0x000000, DIM_ALPHA);
    this.dimmer.setOrigin(0, 0);
    // Intentionally NOT interactive — we don't want it intercepting taps
    // on the Play button or absorbing pointerdown events.
    this.container.add(this.dimmer);

    this.panel = scene.add.container(0, 0);
    this.container.add(this.panel);

    this.build();
    if (this.debug) this.buildDebugPanel(this.debug);
    this.relayout();

    scene.scale.on(Phaser.Scale.Events.RESIZE, this.relayout);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.relayout);
    });
  }

  private build(): void {
    // The panel pieces are built around (0,0) and centered later via relayout.
    const W = 560;
    const H = 480;

    const panelBg = this.scene.add.graphics();
    panelBg.fillStyle(PANEL_FILL, 0.95);
    panelBg.fillRoundedRect(-W / 2, -H / 2, W, H, 28);
    // Dashed border: stroke a path with a Phaser line dash effect via repeated short segments.
    drawDashedRoundedRect(
      panelBg,
      -W / 2 + 8,
      -H / 2 + 8,
      W - 16,
      H - 16,
      22,
      14,
      10,
      PANEL_STROKE,
      3,
      1,
    );
    this.panel.add(panelBg);

    const title = this.scene.add.text(0, -H / 2 + 80, 'CONNECT\nSTARS', {
      fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
      fontSize: '56px',
      fontStyle: 'bold',
      color: TEXT_COLOR,
      align: 'center',
      lineSpacing: 4,
    });
    title.setOrigin(0.5, 0);
    this.panel.add(title);

    // Decorative icon: small constellation + finger sketch.
    const icon = this.scene.add.graphics();
    drawIntroIcon(icon, 0, 60);
    this.panel.add(icon);

    // Play button
    const btnY = H / 2 - 60;
    const btnContainer = makeButton(this.scene, 'Play', 220, 72, BTN_TOP, BTN_BOTTOM, () =>
      this.dismiss(),
    );
    btnContainer.setPosition(0, btnY);
    this.panel.add(btnContainer);
  }

  private relayout = (): void => {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.dimmer.setSize(w, h);
    this.panel.setPosition(w / 2, h / 2);
    if (this.debugPanel) {
      // Anchor the picker to the top-right corner with a small margin.
      const PANEL_W = 280;
      this.debugPanel.setPosition(w - PANEL_W / 2 - 20, 20);
    }
  };

  /**
   * Render a vertical list of constellation buttons in the top-right.
   * The current selection is rendered dimmed; tapping any other entry calls
   * `debug.onPick(id)` which triggers a scene swap higher up.
   */
  private buildDebugPanel(debug: DebugPickerData): void {
    const PANEL_W = 280;
    const ROW_H = 44;
    const ROW_GAP = 8;
    const PAD = 16;
    const rows = debug.ids.length;
    const panelH = PAD * 2 + 32 + rows * ROW_H + (rows - 1) * ROW_GAP;

    const c = this.scene.add.container(0, 0);
    // Sit ABOVE the modal dimmer so it's tappable on the title screen.
    this.container.add(c);
    this.debugPanel = c;

    const bg = this.scene.add.graphics();
    bg.fillStyle(PANEL_FILL, 0.92);
    bg.fillRoundedRect(-PANEL_W / 2, 0, PANEL_W, panelH, 16);
    bg.lineStyle(2, PANEL_STROKE, 0.9);
    bg.strokeRoundedRect(-PANEL_W / 2, 0, PANEL_W, panelH, 16);
    c.add(bg);

    const title = this.scene.add.text(0, PAD, 'DEBUG: pick', {
      fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: TEXT_COLOR,
    });
    title.setOrigin(0.5, 0);
    c.add(title);

    let y = PAD + 36;
    for (const id of debug.ids) {
      const label = debug.names[id] ?? `#${pad2(id)}`;
      const isCurrent = id === debug.current;
      const btn = makeButton(
        this.scene,
        isCurrent ? `${label} ✓` : label,
        PANEL_W - PAD * 2,
        ROW_H,
        DEBUG_BTN_TOP,
        DEBUG_BTN_BOTTOM,
        () => {
          if (isCurrent) return;
          debug.onPick(id);
        },
        c,
      );
      btn.setPosition(0, y + ROW_H / 2);
      if (isCurrent) btn.setAlpha(0.55);
      c.add(btn);
      y += ROW_H + ROW_GAP;
    }
  }

  private dismiss(): void {
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 220,
      ease: 'sine.out',
      onComplete: () => {
        this.container.destroy(true);
        this.onPlay();
      },
    });
  }
}

/** Draws a "dashed rounded rectangle" as a series of short stroked arcs/lines. */
function drawDashedRoundedRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  dashLen: number,
  gapLen: number,
  color: number,
  lineWidth: number,
  alpha: number,
): void {
  g.lineStyle(lineWidth, color, alpha);
  // Build a polyline approximation of the rounded rect, then walk it.
  const segs: Array<{ x: number; y: number }> = [];
  const STEPS = 16;
  // top edge: x+r .. x+w-r
  segs.push({ x: x + r, y });
  segs.push({ x: x + w - r, y });
  // top-right arc
  for (let i = 1; i <= STEPS; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / STEPS);
    segs.push({ x: x + w - r + Math.cos(a) * r, y: y + r + Math.sin(a) * r });
  }
  segs.push({ x: x + w, y: y + h - r });
  for (let i = 1; i <= STEPS; i++) {
    const a = 0 + (Math.PI / 2) * (i / STEPS);
    segs.push({ x: x + w - r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
  }
  segs.push({ x: x + r, y: y + h });
  for (let i = 1; i <= STEPS; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / STEPS);
    segs.push({ x: x + r + Math.cos(a) * r, y: y + h - r + Math.sin(a) * r });
  }
  segs.push({ x, y: y + r });
  for (let i = 1; i <= STEPS; i++) {
    const a = Math.PI + (Math.PI / 2) * (i / STEPS);
    segs.push({ x: x + r + Math.cos(a) * r, y: y + r + Math.sin(a) * r });
  }
  segs.push({ x: x + r, y });

  // walk segments dashing on/off
  let drawing = true;
  let remaining = dashLen;
  for (let i = 0; i < segs.length - 1; i++) {
    let ax = segs[i]!.x;
    let ay = segs[i]!.y;
    const bx = segs[i + 1]!.x;
    const by = segs[i + 1]!.y;
    let dx = bx - ax;
    let dy = by - ay;
    let segLen = Math.hypot(dx, dy);
    if (segLen < 0.001) continue;
    dx /= segLen;
    dy /= segLen;
    while (segLen > 0) {
      const take = Math.min(remaining, segLen);
      const nx = ax + dx * take;
      const ny = ay + dy * take;
      if (drawing) {
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(nx, ny);
        g.strokePath();
      }
      ax = nx;
      ay = ny;
      remaining -= take;
      segLen -= take;
      if (remaining <= 0) {
        drawing = !drawing;
        remaining = drawing ? dashLen : gapLen;
      }
    }
  }
}

/** Small "constellation + finger" sketch shown on the intro panel. */
function drawIntroIcon(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const pts = [
    { x: cx - 90, y: cy + 10 },
    { x: cx - 50, y: cy + 40 },
    { x: cx - 30, y: cy - 20 },
    { x: cx + 30, y: cy + 10 },
    { x: cx + 70, y: cy - 10 },
  ];
  g.lineStyle(3, 0xffffff, 0.9);
  for (let i = 0; i < pts.length - 1; i++) {
    g.beginPath();
    g.moveTo(pts[i]!.x, pts[i]!.y);
    g.lineTo(pts[i + 1]!.x, pts[i + 1]!.y);
    g.strokePath();
  }
  g.fillStyle(0xffffff, 1);
  for (const p of pts) {
    g.fillCircle(p.x, p.y, 7);
  }
  // Pink target ring near the right.
  g.lineStyle(3, 0xff1fb4, 0.95);
  g.strokeCircle(cx + 70, cy - 10, 11);
}

function drawButton(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  top: number,
  bottom: number,
): void {
  g.fillStyle(bottom, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
  // Brighter highlight on the upper half for cheap gradient impression.
  g.fillStyle(top, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h * 0.55, { tl: 18, tr: 18, bl: 0, br: 0 });
  g.lineStyle(3, 0xffffff, 0.25);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
}

/**
 * Build a reusable button. Fires `onTap` once when pointer-down is followed
 * by pointer-up on the button, OR pointer-up-outside while a press is in
 * progress (forgiving of small finger jitter on touch). Tracks a `fired`
 * flag internally so a single button can't double-fire.
 *
 * Returns the Container plus a `dispose()` that must be called when the
 * button is removed — it un-registers the scene-level pointerupoutside
 * listener that catches the "lifted off the hit area" case. Letting the
 * container die without dispose() leaks a closure per button until the
 * scene shuts down.
 *
 * Convenience: pass an optional `attachTo` Container and dispose will be
 * wired automatically to its DESTROY event.
 */
export function makeButton(
  scene: Phaser.Scene,
  label: string,
  w: number,
  h: number,
  top: number,
  bottom: number,
  onTap: () => void,
  attachTo?: Phaser.GameObjects.Container,
): Phaser.GameObjects.Container & { dispose(): void } {
  const c = scene.add.container(0, 0) as Phaser.GameObjects.Container & { dispose(): void };
  const gfx = scene.add.graphics();
  drawButton(gfx, w, h, top, bottom);
  const txt = scene.add.text(0, 0, label, {
    fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
    fontSize: '34px',
    fontStyle: 'bold',
    color: '#FFFFFF',
  });
  txt.setOrigin(0.5);
  c.add([gfx, txt]);
  c.setSize(w, h);
  // Phaser's hit-test adds the GameObject's displayOrigin to the local
  // pointer coords before testing against the hit-area rect. For a sized
  // Container that's (w/2, h/2), so the rect has to live at (0, 0, w, h)
  // — not (-w/2, -h/2, w, h) — or the hit area silently snaps to the
  // upper-left quadrant of the visible button.
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);

  let armed = false;
  let fired = false;
  const fire = (): void => {
    if (fired) return;
    fired = true;
    onTap();
  };

  c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.05, duration: 120 }));
  c.on('pointerout', () => {
    scene.tweens.add({ targets: c, scale: 1.0, duration: 120 });
    armed = false;
  });
  c.on('pointerdown', () => {
    armed = true;
    scene.tweens.add({ targets: c, scale: 0.95, duration: 80, yoyo: true });
  });
  c.on('pointerup', () => {
    if (armed) fire();
    armed = false;
  });

  // Scene-level fallback for pointer-up *outside* the button. We must own
  // its lifetime — letting it accumulate per button is a leak.
  const onUpOutside = (): void => {
    if (armed) fire();
    armed = false;
  };
  scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUpOutside);

  let disposed = false;
  c.dispose = (): void => {
    if (disposed) return;
    disposed = true;
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUpOutside);
    scene.tweens.killTweensOf(c);
  };

  c.once(Phaser.GameObjects.Events.DESTROY, () => c.dispose());
  if (attachTo) {
    attachTo.once(Phaser.GameObjects.Events.DESTROY, () => c.dispose());
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => c.dispose());

  return c;
}
