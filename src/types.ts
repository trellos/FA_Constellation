export type NormalizedPoint = readonly [number, number];

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
  /** Phaser texture key under which the outline PNG was registered. */
  readonly textureKey: string;
}
