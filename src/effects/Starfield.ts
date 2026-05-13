import Phaser from 'phaser';

const STAR_TEXTURE_KEY = '__star_glow';
const STAR_COUNT = 55;
const STAR_TINT = 0xc8b8ff;

interface StarPos {
  /** Normalized [0, 1] position relative to the viewport. */
  readonly u: number;
  readonly v: number;
  readonly star: Phaser.GameObjects.Image;
}

/** Sparse fuzzy lavender stars with slow random twinkle. */
export class Starfield {
  private readonly scene: Phaser.Scene;
  private readonly stars: StarPos[] = [];
  private readonly rng = new Phaser.Math.RandomDataGenerator(['constellation-stars']);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    Starfield.ensureTexture(scene);

    this.populate();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.reposition, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.reposition, this);
    });
  }

  private populate(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    for (let i = 0; i < STAR_COUNT; i++) {
      const u = this.rng.realInRange(0, 1);
      const v = this.rng.realInRange(0, 1);
      const baseScale = this.rng.realInRange(0.25, 0.75);
      const baseAlpha = this.rng.realInRange(0.3, 0.8);

      const star = this.scene.add.image(u * w, v * h, STAR_TEXTURE_KEY);
      star.setTint(STAR_TINT);
      star.setBlendMode(Phaser.BlendModes.ADD);
      star.setScale(baseScale);
      star.setAlpha(baseAlpha);
      star.setDepth(-900);

      this.scene.tweens.add({
        targets: star,
        alpha: baseAlpha * 0.35,
        duration: this.rng.between(1800, 3600),
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        delay: this.rng.between(0, 2000),
      });

      this.stars.push({ u, v, star });
    }
  }

  /**
   * Re-pin each star to its original normalized position in the new viewport.
   * Earlier this called `rng.between(0, w)` again — which advanced the same
   * RNG that `populate()` had already consumed, producing fresh coords every
   * resize so stars appeared to jump.
   */
  private reposition = (): void => {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    for (const s of this.stars) {
      s.star.setPosition(s.u * w, s.v * h);
    }
  };

  /** Build a 64x64 soft radial-gradient sprite once and reuse it for all stars. */
  private static ensureTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(STAR_TEXTURE_KEY)) return;
    const size = 64;
    const canvas = scene.textures.createCanvas(STAR_TEXTURE_KEY, size, size);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
  }
}
