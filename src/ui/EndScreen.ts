import Phaser from 'phaser';
import { makeButton } from './IntroModal';

const BTN_TOP = 0x2a8ae0;
const BTN_BOTTOM = 0x1a60b0;

/** End-of-activity overlay: constellation name + OK button. */
export class EndScreen {
  private readonly scene: Phaser.Scene;
  private readonly name: string;
  private readonly onOk: () => void;

  private readonly container: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly button: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, name: string, onOk: () => void) {
    this.scene = scene;
    this.name = name;
    this.onOk = onOk;

    this.container = scene.add.container(0, 0);
    this.container.setDepth(900);
    this.container.setAlpha(0);

    this.title = scene.add.text(0, 0, this.name.toUpperCase(), {
      fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
      fontSize: '88px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      stroke: '#1A1A4A',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 4, color: '#000', blur: 12, fill: true },
    });
    this.title.setOrigin(0.5, 0);

    this.button = this.makeButton('OK');

    this.container.add([this.title, this.button]);
    this.relayout();

    scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 400,
      ease: 'sine.out',
    });

    scene.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
    });
  }

  private makeButton(label: string): Phaser.GameObjects.Container {
    return makeButton(this.scene, label, 220, 72, BTN_TOP, BTN_BOTTOM, () => {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 220,
        ease: 'sine.in',
        onComplete: () => {
          this.container.destroy(true);
          this.onOk();
        },
      });
    });
  }

  private relayout = (): void => {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.title.setPosition(w / 2, Math.max(20, h * 0.06));
    this.button.setPosition(w / 2, h - Math.max(60, h * 0.1));
  };
}
