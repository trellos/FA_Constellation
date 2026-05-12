import Phaser from 'phaser';
import type { ConstellationData, NormalizedPoint } from './types';
import { Background } from './effects/Background';
import { Starfield } from './effects/Starfield';
import { IntroModal } from './ui/IntroModal';
import { EndScreen } from './ui/EndScreen';
import { FingerHint } from './ui/FingerHint';

enum Phase {
  Intro = 'Intro',
  Tracing = 'Tracing',
  Reveal = 'Reveal',
  End = 'End',
}

interface ScreenPoint {
  x: number;
  y: number;
}

const NODE_RADIUS = 22;
const TARGET_RADIUS = 26;
const TARGET_RING_WIDTH = 5;
// Snap when the pointer is over the visible pink ring (target). The ring is
// drawn at radius TARGET_RADIUS with a bright inner halo to ~1.6× and a
// dimmer outer halo to ~3.2×. 80 game-px (≈ 3 × TARGET_RADIUS) means the
// line completes only when the cursor is genuinely on the ring's glow.
const SNAP_DISTANCE = 80;
// Slightly more forgiving on release: catches small overshoots and a
// tap-and-release directly on the target.
const RELEASE_SNAP_DISTANCE = 110;
const LINE_WIDTH = 6;
const OUTLINE_FILL = 0.78; // fraction of the smaller screen dimension the outline is fitted to
const REVEAL_ZOOM = 0.86;
const HINT_DELAY_MS = 700;

/**
 * Self-contained Phaser.Scene that runs the whole connect-the-stars activity
 * for a single constellation: intro modal -> tracing loop -> outline reveal
 * -> end screen.
 *
 * Receives its data + restart callback via scene init data. Does not import
 * or depend on ConstellationManager.
 */
export class ConstellationDisplay extends Phaser.Scene {
  // init-time data
  private constellationData!: ConstellationData;
  private textureKey!: string;
  private onRestart!: () => void;

  // state
  private phase: Phase = Phase.Intro;
  private points: ScreenPoint[] = [];
  private currentIndex = 0; // segment we are currently drawing (from points[i] to points[i+1])
  private dragging = false;
  private lastPointer: ScreenPoint | null = null;

  // visuals
  private nodes: Phaser.GameObjects.Container[] = [];
  private targetRing: Phaser.GameObjects.Graphics | null = null;
  private targetHalo: Phaser.GameObjects.Graphics | null = null;
  private completedLines: Phaser.GameObjects.Graphics | null = null;
  private activeLine: Phaser.GameObjects.Graphics | null = null;
  private outlineImage: Phaser.GameObjects.Image | null = null;
  private fingerHint: FingerHint | null = null;
  private hintTimer: Phaser.Time.TimerEvent | null = null;

  init(initData: ConstellationDisplay.InitData): void {
    this.constellationData = initData.data;
    this.textureKey = initData.textureKey;
    this.onRestart = initData.onRestart;
    // reset per-scene-instance state (Phaser reuses scene instances on add())
    this.phase = Phase.Intro;
    this.points = [];
    this.currentIndex = 0;
    this.dragging = false;
    this.nodes = [];
  }

  create(): void {
    new Background(this);
    new Starfield(this);

    this.completedLines = this.add.graphics();
    this.completedLines.setDepth(150);
    this.activeLine = this.add.graphics();
    this.activeLine.setDepth(160);

    this.fingerHint = new FingerHint(this);

    // Outline image — added now but transparent; revealed at the end.
    this.outlineImage = this.add.image(0, 0, this.textureKey);
    this.outlineImage.setOrigin(0.5);
    this.outlineImage.setAlpha(0);
    this.outlineImage.setDepth(50);
    this.layoutOutlineAndPoints();

    new IntroModal(this, () => this.startTracing());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.fingerHint?.destroy();
      if (this.hintTimer) {
        this.hintTimer.remove();
        this.hintTimer = null;
      }
    });
  }

  /**
   * Per-frame safety net: while a drag is in progress, redraw the active
   * line from the current node to wherever the *live* pointer is right now
   * and re-test the snap condition. This catches any case where a
   * pointermove event was dropped (which can happen if the pointer briefly
   * exits the canvas, on touch under heavy frame load, etc.) — the line
   * never freezes mid-air.
   */
  update(): void {
    if (this.phase !== Phase.Tracing || !this.dragging) return;
    const target = this.points[this.currentIndex + 1];
    if (!target) return;
    const p = this.input.activePointer;
    if (!p) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, target.x, target.y);
    if (d <= SNAP_DISTANCE) {
      this.advanceSegment();
      this.dragging = false;
      this.lastPointer = null;
      return;
    }
    this.drawActiveLine(p.x, p.y);
    this.lastPointer = { x: p.x, y: p.y };
  }

  // ---------- layout ----------

  private layoutOutlineAndPoints(): void {
    if (!this.outlineImage) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const tex = this.textures.get(this.textureKey).getSourceImage();
    const texW = (tex as HTMLImageElement | HTMLCanvasElement).width;
    const texH = (tex as HTMLImageElement | HTMLCanvasElement).height;

    const targetH = Math.min(h * OUTLINE_FILL, (w * OUTLINE_FILL * texH) / texW);
    const scale = targetH / texH;
    const drawW = texW * scale;
    const drawH = texH * scale;

    const cx = w / 2;
    const cy = h / 2;
    this.outlineImage.setPosition(cx, cy);
    this.outlineImage.setScale(scale);

    // Recompute screen points from the normalized constellation coords.
    const left = cx - drawW / 2;
    const top = cy - drawH / 2;
    this.points = this.constellationData.points.map((p: NormalizedPoint): ScreenPoint => ({
      x: left + p[0] * drawW,
      // PNG-normalized (0,0)=lower-left, screen Y grows down.
      y: top + (1 - p[1]) * drawH,
    }));

    // If nodes already exist, reposition them.
    for (let i = 0; i < this.nodes.length; i++) {
      const p = this.points[i];
      if (p) this.nodes[i]!.setPosition(p.x, p.y);
    }
    if (this.phase === Phase.Tracing) {
      this.redrawCompletedLines();
      this.redrawTarget();
    }
  }

  private onResize = (): void => {
    this.layoutOutlineAndPoints();
  };

  // ---------- phase transitions ----------

  private startTracing(): void {
    this.phase = Phase.Tracing;
    this.spawnNode(0, /*filled*/ true);
    this.showTarget(1);
    this.scheduleHint();
  }

  private scheduleHint(): void {
    if (this.hintTimer) {
      this.hintTimer.remove();
      this.hintTimer = null;
    }
    this.hintTimer = this.time.delayedCall(HINT_DELAY_MS, () => {
      if (this.phase !== Phase.Tracing || this.dragging) return;
      const from = this.points[this.currentIndex];
      const to = this.points[this.currentIndex + 1];
      if (!from || !to) return;
      this.fingerHint?.start(from, to);
    });
  }

  private advanceSegment(): void {
    // Lock in the completed line, promote the target node to a filled node, move on.
    this.fingerHint?.stop();
    if (this.hintTimer) {
      this.hintTimer.remove();
      this.hintTimer = null;
    }

    this.currentIndex += 1;
    this.spawnNode(this.currentIndex, /*filled*/ true);
    this.redrawCompletedLines();
    this.clearTarget();

    if (this.currentIndex >= this.points.length - 1) {
      this.beginReveal();
      return;
    }

    this.showTarget(this.currentIndex + 1);
    this.scheduleHint();
  }

  private beginReveal(): void {
    this.phase = Phase.Reveal;
    this.activeLine?.clear();
    this.fingerHint?.stop();

    // Zoom slightly out + fade the outline in.
    this.tweens.add({
      targets: this.cameras.main,
      zoom: REVEAL_ZOOM,
      duration: 700,
      ease: 'sine.inOut',
    });
    this.tweens.add({
      targets: this.outlineImage,
      alpha: 1,
      duration: 700,
      ease: 'sine.out',
      delay: 100,
    });

    this.time.delayedCall(900, () => {
      this.phase = Phase.End;
      new EndScreen(this, this.constellationData.name, () => this.onRestart());
    });
  }

  // ---------- input ----------

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== Phase.Tracing) return;
    const target = this.points[this.currentIndex + 1];
    if (!target) return;
    // Any pointer-down during Tracing begins the drag. The line always
    // anchors at the current node, so the user can start dragging from
    // anywhere on the screen — the activity remains forgiving.
    this.dragging = true;
    this.lastPointer = { x: pointer.x, y: pointer.y };
    this.fingerHint?.stop();
    // If the user tapped directly on the target (or inside its snap zone),
    // snap immediately rather than requiring a subsequent move.
    if (Phaser.Math.Distance.Between(pointer.x, pointer.y, target.x, target.y) <= SNAP_DISTANCE) {
      this.advanceSegment();
      this.dragging = false;
      this.lastPointer = null;
      return;
    }
    this.drawActiveLine(pointer.x, pointer.y);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== Phase.Tracing || !this.dragging) return;
    const target = this.points[this.currentIndex + 1];
    if (!target) return;

    // Snap if either the current point OR the *swept segment* from the prior
    // pointer position passes within SNAP_DISTANCE of the target. The swept
    // check catches fast drags that would otherwise jump straight over the
    // snap zone between two consecutive pointermove events.
    const prev = this.lastPointer ?? { x: pointer.x, y: pointer.y };
    const sweptDist = distancePointToSegment(target, prev, pointer);
    this.lastPointer = { x: pointer.x, y: pointer.y };

    if (sweptDist <= SNAP_DISTANCE) {
      this.advanceSegment();
      this.dragging = false;
      this.lastPointer = null;
      return;
    }
    this.drawActiveLine(pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== Phase.Tracing) return;
    // Touch users sometimes lift just short of the target, or release after
    // a quick fly-by that didn't trigger the move-snap. Use a *larger*
    // release tolerance and also check the final drag segment for crossing
    // proximity, so any reasonable attempt at reaching the target counts.
    const target = this.points[this.currentIndex + 1];
    if (this.dragging && target) {
      const prev = this.lastPointer ?? { x: pointer.x, y: pointer.y };
      const releaseDist = Math.min(
        Phaser.Math.Distance.Between(pointer.x, pointer.y, target.x, target.y),
        distancePointToSegment(target, prev, pointer)
      );
      if (releaseDist <= RELEASE_SNAP_DISTANCE) {
        this.advanceSegment();
        this.dragging = false;
        this.lastPointer = null;
        return;
      }
    }
    if (!this.dragging) return;
    this.dragging = false;
    this.lastPointer = null;
    this.activeLine?.clear();
    this.scheduleHint();
  }

  // ---------- drawing helpers ----------

  private spawnNode(i: number, filled: boolean): void {
    if (this.nodes[i]) return;
    const p = this.points[i];
    if (!p) return;
    const c = this.add.container(p.x, p.y);
    c.setDepth(200);
    const g = this.add.graphics();
    // Soft glow halo
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(0, 0, NODE_RADIUS * 1.9);
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(0, 0, NODE_RADIUS * 1.4);
    if (filled) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, 0, NODE_RADIUS);
    } else {
      g.lineStyle(4, 0xffffff, 1);
      g.strokeCircle(0, 0, NODE_RADIUS);
    }
    c.add(g);
    c.setScale(0.4);
    c.setAlpha(0);
    this.tweens.add({
      targets: c,
      scale: 1,
      alpha: 1,
      duration: 260,
      ease: 'back.out',
    });
    this.nodes[i] = c;
  }

  private showTarget(i: number): void {
    const p = this.points[i];
    if (!p) return;
    this.clearTarget();

    // Two-layer halo: a dim outer glow at the snap-zone edge, and a brighter
    // inner core. Sized so the visible halo IS the snap zone.
    const halo = this.add.graphics();
    halo.setPosition(p.x, p.y);
    halo.setDepth(180);
    halo.fillStyle(0xff1fb4, 0.15);
    halo.fillCircle(0, 0, TARGET_RADIUS * 2.4);
    halo.fillStyle(0xff1fb4, 0.25);
    halo.fillCircle(0, 0, TARGET_RADIUS * 1.6);
    this.targetHalo = halo;

    const ring = this.add.graphics();
    ring.setPosition(p.x, p.y);
    ring.setDepth(190);
    ring.lineStyle(TARGET_RING_WIDTH, 0xff1fb4, 1);
    ring.strokeCircle(0, 0, TARGET_RADIUS);
    this.targetRing = ring;

    // Pulse
    this.tweens.add({
      targets: [ring, halo],
      scale: { from: 0.7, to: 1.08 },
      alpha: { from: 0, to: 1 },
      duration: 600,
      ease: 'sine.out',
      onComplete: () => {
        this.tweens.add({
          targets: [ring, halo],
          scale: 0.92,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
      },
    });
  }

  private clearTarget(): void {
    if (this.targetRing) {
      this.tweens.killTweensOf(this.targetRing);
      this.targetRing.destroy();
      this.targetRing = null;
    }
    if (this.targetHalo) {
      this.tweens.killTweensOf(this.targetHalo);
      this.targetHalo.destroy();
      this.targetHalo = null;
    }
  }

  private redrawTarget(): void {
    if (this.targetRing && this.targetHalo) {
      const p = this.points[this.currentIndex + 1];
      if (!p) return;
      this.targetRing.setPosition(p.x, p.y);
      this.targetHalo.setPosition(p.x, p.y);
    }
  }

  private drawActiveLine(toX: number, toY: number): void {
    if (!this.activeLine) return;
    const from = this.points[this.currentIndex];
    if (!from) return;
    this.activeLine.clear();
    this.activeLine.lineStyle(LINE_WIDTH, 0xffffff, 1);
    this.activeLine.beginPath();
    this.activeLine.moveTo(from.x, from.y);
    this.activeLine.lineTo(toX, toY);
    this.activeLine.strokePath();
  }

  private redrawCompletedLines(): void {
    if (!this.completedLines) return;
    this.completedLines.clear();
    this.completedLines.lineStyle(LINE_WIDTH, 0xffffff, 1);
    for (let i = 0; i < this.currentIndex; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      if (!a || !b) continue;
      this.completedLines.beginPath();
      this.completedLines.moveTo(a.x, a.y);
      this.completedLines.lineTo(b.x, b.y);
      this.completedLines.strokePath();
    }
    this.activeLine?.clear();
  }
}

/**
 * Shortest distance from point `p` to the line segment from `a` to `b`.
 * Used so a fast drag that "skips over" the target between two consecutive
 * pointermove events still triggers a snap.
 */
function distancePointToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.5) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ConstellationDisplay {
  export interface InitData {
    data: ConstellationData;
    textureKey: string;
    onRestart: () => void;
  }
}
