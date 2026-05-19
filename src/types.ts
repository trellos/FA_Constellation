export type NormalizedPoint = readonly [number, number];

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ConstellationData {
  /** Display name shown on the end screen. */
  readonly name: string;
  /**
   * Trace points in normalized PNG coordinates.
   *   (0, 0) = lower-left of the outline image.
   *   (1, 1) = upper-right of the outline image.
   * Values may go negative or above 1 to draw below / above the image.
   * Connections run points[i] -> points[i+1].
   */
  readonly points: ReadonlyArray<NormalizedPoint>;
}

export interface LoadedConstellation {
  /** 1-based index from the file name (constellation_NN.json). */
  readonly id: number;
  readonly data: ConstellationData;
  /** Phaser texture key under which the outline PNG will be (or was) registered. */
  readonly textureKey: string;
  /** Source URL for the PNG — passed to ConstellationDisplay.preload(). */
  readonly pngUrl: string;
}

/**
 * Validate a parsed JSON blob against the {@link ConstellationData} shape and
 * return it narrowed. Throws a descriptive Error on failure — sufficient for
 * a top-level catch to surface a sensible message instead of a `TypeError:
 * cannot read property 'x' of undefined` from deep in the layout code.
 */
export function validateConstellationData(raw: unknown, source: string): ConstellationData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${source}: top-level value must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    throw new Error(`${source}: "name" must be a non-empty string`);
  }
  if (!Array.isArray(obj.points)) {
    throw new Error(`${source}: "points" must be an array`);
  }
  if (obj.points.length < 2) {
    throw new Error(`${source}: "points" must have at least 2 entries (got ${obj.points.length})`);
  }
  const points: NormalizedPoint[] = [];
  for (let i = 0; i < obj.points.length; i++) {
    const p = obj.points[i];
    if (!Array.isArray(p) || p.length !== 2) {
      throw new Error(`${source}: points[${i}] must be a [u, v] pair`);
    }
    const [u, v] = p as [unknown, unknown];
    if (
      typeof u !== 'number' ||
      typeof v !== 'number' ||
      !Number.isFinite(u) ||
      !Number.isFinite(v)
    ) {
      throw new Error(
        `${source}: points[${i}] must be two finite numbers (got ${JSON.stringify(p)})`,
      );
    }
    points.push([u, v]);
  }
  return { name: obj.name, points };
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
