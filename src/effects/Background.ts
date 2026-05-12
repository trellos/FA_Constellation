import Phaser from 'phaser';

/** Full-screen blue->purple vertical gradient. */
export class Background {
  private readonly scene: Phaser.Scene;
  private readonly gradient: Phaser.GameObjects.Graphics;

  private static readonly TOP = 0x1a1ab8;
  private static readonly BOTTOM = 0x2a0e58;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gradient = scene.add.graphics();
    this.gradient.setDepth(-1000);

    this.redraw();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.redraw, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.redraw, this);
    });
  }

  private redraw = (): void => {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    const top = Phaser.Display.Color.ValueToColor(Background.TOP);
    const bottom = Phaser.Display.Color.ValueToColor(Background.BOTTOM);

    const STEPS = 64;
    this.gradient.clear();
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, 1, t);
      const color = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
      const y0 = Math.floor((h * i) / STEPS);
      const y1 = Math.ceil((h * (i + 1)) / STEPS);
      this.gradient.fillStyle(color, 1);
      this.gradient.fillRect(0, y0, w, y1 - y0 + 1);
    }
  };
}
