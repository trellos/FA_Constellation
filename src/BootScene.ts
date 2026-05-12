import Phaser from 'phaser';
import { ConstellationManager } from './ConstellationManager';

/**
 * Minimal kickoff scene. Loads the persistent finger sprite, then hands
 * control to ConstellationManager which discovers data files and spawns
 * the first ConstellationDisplay.
 *
 * This scene itself draws nothing once create() finishes.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'boot' });
  }

  preload(): void {
    this.load.image('finger', 'assets/finger.png');
  }

  create(): void {
    const manager = new ConstellationManager(this.game);
    manager.start().catch((err: unknown) => {
      console.error('[constellation] failed to start:', err);
    });
  }
}
