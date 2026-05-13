import type { ConstellationData } from './types';

export interface OutlineRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface OutlineLayout {
  readonly rect: OutlineRect;
  readonly points: ScreenPoint[];
}

/**
 * Compute the screen layout of the outline image + the trace points, given
 * the viewport size, the texture's intrinsic dimensions, and the
 * constellation data. Pure: no Phaser objects touched.
 *
 *   - The PNG is fitted to `outlineFill` of the smaller viewport dimension,
 *     preserving aspect ratio, and centered.
 *   - Each `points[i]` is mapped from PNG-normalized space (origin lower-
 *     left, (1,1) upper-right) into screen space (origin upper-left).
 */
export function computeOutlineLayout(args: {
  viewportWidth: number;
  viewportHeight: number;
  textureWidth: number;
  textureHeight: number;
  data: ConstellationData;
  outlineFill: number;
}): OutlineLayout {
  const {
    viewportWidth: w,
    viewportHeight: h,
    textureWidth: texW,
    textureHeight: texH,
    data,
    outlineFill,
  } = args;

  const targetH = Math.min(h * outlineFill, (w * outlineFill * texH) / texW);
  const scale = targetH / texH;
  const drawW = texW * scale;
  const drawH = texH * scale;

  const cx = w / 2;
  const cy = h / 2;
  const left = cx - drawW / 2;
  const top = cy - drawH / 2;

  const points: ScreenPoint[] = data.points.map((p) => ({
    x: left + p[0] * drawW,
    // PNG-normalized origin is lower-left, screen Y grows downward.
    y: top + (1 - p[1]) * drawH,
  }));

  return {
    rect: { left, top, width: drawW, height: drawH, scale },
    points,
  };
}
