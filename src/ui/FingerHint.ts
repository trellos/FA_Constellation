import Phaser from 'phaser';

const FINGER_TEXTURE_KEY = 'finger';

/** Animated pointing-finger hint that tweens from node A -> B and loops. */
export class FingerHint {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.sprite = scene.add.image(0, 0, FINGER_TEXTURE_KEY);
    // Finger tip is near the top-center of the sprite; anchor there.
    this.sprite.setOrigin(0.55, 0.1);
    this.sprite.setDepth(300);
    this.sprite.setVisible(false);
  }

  /** Start looping from `from` toward `to`. Cancels any prior tween. */
  start(from: { x: number; y: number }, to: { x: number; y: number }): void {
    this.stop();
    this.sprite.setVisible(true);
    this.sprite.setPosition(from.x, from.y);
    this.sprite.setAlpha(0);

    // Fade in, pause, glide to target, pause, fade out, restart.
    const totalGlide = 900;
    this.scene.tweens.chain({
      targets: this.sprite,
      loop: -1,
      tweens: [
        { x: from.x, y: from.y, alpha: 1, duration: 250, ease: 'sine.out' },
        { x: from.x, y: from.y, duration: 200 },
        { x: to.x, y: to.y, duration: totalGlide, ease: 'sine.inOut' },
        { x: to.x, y: to.y, alpha: 0, duration: 250, ease: 'sine.in' },
        { x: from.x, y: from.y, alpha: 0, duration: 50 },
      ],
    });
  }

  stop(): void {
    // Phaser 3 `TweenChain.remove()` can throw if the chain's internal
    // parent ref has been cleared (e.g. between chain iterations on a
    // looping tween). `killTweensOf(target)` is the safer API — it kills
    // anything affecting the sprite without dereferencing a stale handle.
    if (this.sprite && this.sprite.active) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.sprite.setVisible(false);
    }
  }

  destroy(): void {
    this.stop();
    if (this.sprite && this.sprite.active) this.sprite.destroy();
  }
}
