import Phaser from 'phaser';
import type { ConstellationData, LoadedConstellation } from './types';
import { ConstellationDisplay } from './ConstellationDisplay';

const ASSETS_BASE = 'assets';

/**
 * Bootstraps the activity.
 *
 *   - probes constellation_01..NN.{json,png} until a pair is missing
 *   - picks a random available one
 *   - creates a fresh ConstellationDisplay scene with that data
 *   - re-runs when the display calls its onRestart callback
 *
 * Owns the singleton Phaser.Game instance. Does not participate in rendering.
 */
export class ConstellationManager {
  private readonly game: Phaser.Game;
  private available: number[] = [];
  private currentSceneKey: string | null = null;
  private launchCount = 0;

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  /** Probe filesystem (via fetch) for constellation_NN.{png,json} pairs. */
  static async discoverAvailable(maxProbe = 64): Promise<number[]> {
    const found: number[] = [];
    for (let i = 1; i <= maxProbe; i++) {
      const id = pad2(i);
      const [jsonOk, pngOk] = await Promise.all([
        probe(`${ASSETS_BASE}/constellation_${id}.json`, 'application/json'),
        probe(`${ASSETS_BASE}/constellation_${id}.png`, 'image/'),
      ]);
      if (!jsonOk || !pngOk) break;
      found.push(i);
    }
    return found;
  }

  /** Discover and launch the first random constellation. Throws if none. */
  async start(): Promise<void> {
    this.available = await ConstellationManager.discoverAvailable();
    if (this.available.length === 0) {
      throw new Error(
        'No constellation_NN.{json,png} pairs found in /assets. Run `npm run gen-assets`.'
      );
    }
    await this.showRandom();
  }

  /** Pick a random constellation and (re)start the display scene with it. */
  async showRandom(): Promise<void> {
    const id = this.available[Math.floor(Math.random() * this.available.length)]!;
    const loaded = await this.load(id);

    // Tear down any previous instance.
    if (this.currentSceneKey) {
      this.game.scene.remove(this.currentSceneKey);
      this.currentSceneKey = null;
    }

    this.launchCount += 1;
    const sceneKey = `display_${this.launchCount}`;
    this.currentSceneKey = sceneKey;

    this.game.scene.add(
      sceneKey,
      ConstellationDisplay,
      true,
      {
        data: loaded.data,
        textureKey: loaded.textureKey,
        onRestart: () => {
          // Defer so we don't tear down a scene from inside its own callback.
          window.setTimeout(() => {
            void this.showRandom();
          }, 0);
        },
      } satisfies ConstellationDisplay.InitData
    );
  }

  private async load(id: number): Promise<LoadedConstellation> {
    const idStr = pad2(id);
    const jsonUrl = `${ASSETS_BASE}/constellation_${idStr}.json`;
    const pngUrl = `${ASSETS_BASE}/constellation_${idStr}.png`;

    const dataResp = await fetch(jsonUrl);
    if (!dataResp.ok) throw new Error(`failed to load ${jsonUrl}`);
    const data = (await dataResp.json()) as ConstellationData;

    const textureKey = `constellation_${idStr}`;
    if (!this.game.textures.exists(textureKey)) {
      await loadTexture(this.game, textureKey, pngUrl);
    }
    return { id, data, textureKey };
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * HEAD an asset URL and return true iff the response is OK *and* the
 * Content-Type starts with `expectedType`. The content-type check is
 * essential under dev servers like Vite that return an HTML fallback
 * (with 200 OK) for missing static files instead of a real 404.
 */
async function probe(url: string, expectedType: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') ?? '';
    return ct.toLowerCase().startsWith(expectedType.toLowerCase());
  } catch {
    return false;
  }
}

/** Load a PNG into Phaser's texture manager and resolve when ready. */
function loadTexture(game: Phaser.Game, key: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      game.textures.addImage(key, img);
      resolve();
    };
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}
