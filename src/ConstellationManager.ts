import Phaser from 'phaser';
import type { ConstellationData, LoadedConstellation } from './types';
import { validateConstellationData } from './types';
import { ConstellationDisplay, type ConstellationDisplayInitData } from './ConstellationDisplay';

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
  private restarting = false;

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  /**
   * Probe for `constellation_NN.{png,json}` pairs. Issues probes in parallel
   * batches and stops at the first missing index — so a typical 3-asset deploy
   * makes 4 batches of 2 HEAD requests instead of 64 serial round-trips.
   *
   * The probe is deliberately checking the response Content-Type, not just
   * 200 OK: Vite (and many SPAs) serve `index.html` as a fallback for
   * unknown paths, which would otherwise pass a naive "did it 200?" check.
   */
  static async discoverAvailable(maxProbe = 64, batchSize = 8): Promise<number[]> {
    const found: number[] = [];
    outer: for (let start = 1; start <= maxProbe; start += batchSize) {
      const end = Math.min(start + batchSize - 1, maxProbe);
      const batch = await Promise.all(
        range(start, end).map(async (i) => {
          const id = pad2(i);
          const [jsonOk, pngOk] = await Promise.all([
            probe(`${ASSETS_BASE}/constellation_${id}.json`, 'application/json'),
            probe(`${ASSETS_BASE}/constellation_${id}.png`, 'image/'),
          ]);
          return { i, ok: jsonOk && pngOk };
        }),
      );
      for (const r of batch) {
        if (!r.ok) break outer;
        found.push(r.i);
      }
    }
    return found;
  }

  /** Discover and launch the first random constellation. Throws if none. */
  async start(): Promise<void> {
    this.available = await ConstellationManager.discoverAvailable();
    if (this.available.length === 0) {
      throw new Error(
        'No constellation_NN.{json,png} pairs found in /assets. Run `npm run gen-assets`.',
      );
    }
    // TEMP: restrict to the Bunny constellation only.
    if (this.available.includes(4)) this.available = [4];
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

    const initData: ConstellationDisplayInitData = {
      data: loaded.data,
      textureKey: loaded.textureKey,
      pngUrl: loaded.pngUrl,
      onRestart: () => {
        // Defer so we don't tear down a scene from inside its own callback,
        // and guard against re-entry (double-tap on OK, etc.).
        if (this.restarting) return;
        this.restarting = true;
        window.setTimeout(() => {
          this.restarting = false;
          void this.showRandom();
        }, 0);
      },
    };
    this.game.scene.add(sceneKey, ConstellationDisplay, true, initData);
  }

  /**
   * Fetch + validate the JSON. The PNG is loaded by the display scene itself
   * via Phaser's loader (which handles CORS, retry, error events properly).
   */
  private async load(id: number): Promise<LoadedConstellation> {
    const idStr = pad2(id);
    const jsonUrl = `${ASSETS_BASE}/constellation_${idStr}.json`;
    const pngUrl = `${ASSETS_BASE}/constellation_${idStr}.png`;

    const dataResp = await fetch(jsonUrl);
    if (!dataResp.ok) throw new Error(`failed to load ${jsonUrl} (HTTP ${dataResp.status})`);
    let raw: unknown;
    try {
      raw = await dataResp.json();
    } catch (e) {
      throw new Error(`failed to parse ${jsonUrl} as JSON: ${(e as Error).message}`);
    }
    const data: ConstellationData = validateConstellationData(raw, jsonUrl);

    const textureKey = `constellation_${idStr}`;
    return { id, data, textureKey, pngUrl };
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/**
 * HEAD an asset URL and return true iff the response is OK *and* the
 * Content-Type starts with `expectedType`. The content-type check is
 * essential under dev servers like Vite that return an HTML fallback
 * (with 200 OK) for missing static files instead of a real 404.
 *
 * Exported only for test access; not part of the public manager API.
 */
export async function probeAssetForTest(url: string, expectedType: string): Promise<boolean> {
  return probe(url, expectedType);
}

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
