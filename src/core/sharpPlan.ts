/**
 * Decides when the "even pixel" scaler is needed. Pure logic (no browser APIs) so it can be unit-tested.
 *
 * The game draws a fixed 960x540 picture. When it is shown at a scale that is not a whole number of device pixels,
 * nearest-neighbour scaling makes some game pixels 1 device pixel wide and others 2 (or 2 and 3), which shows as lines of
 * uneven thickness and shimmer while things move. The fix ("sharp bilinear" scaling) first enlarges the picture by a whole
 * number with crisp pixels, then lets smooth filtering shrink it to the exact screen size, so every game pixel ends up the
 * same size with only a soft edge between neighbours.
 */

/** From this scale up, uneven pixels (3 vs 4 px and larger) are too small to notice, so the extra work is skipped. */
export const SHARP_MAX_SCALE = 3;
/** A scale this close to a whole number counts as whole (no uneven pixels worth fixing). */
export const WHOLE_TOLERANCE = 0.02;

/** Device pixels per game pixel for a canvas shown `cssWidth` CSS pixels wide on a screen with `dpr` device pixels per CSS pixel. */
export const deviceScale = (cssWidth: number, dpr: number, baseWidth: number): number => (cssWidth * dpr) / baseWidth;

export interface SharpPlan {
  /** Run the scaler at all? */
  active: boolean;
  /** Integer enlargement used for the crisp first step (>= scale, so the second step only shrinks). */
  factor: number;
}

/**
 * @param scale device pixels per game pixel
 * @param coarsePointer true on touch devices, where phones already sit at (or very near) 2x and the extra copy costs battery
 */
export function planSharpScale(scale: number, coarsePointer = false): SharpPlan {
  const off: SharpPlan = { active: false, factor: 1 };
  if (!Number.isFinite(scale) || scale < 1 || scale >= SHARP_MAX_SCALE) return off;
  if (Math.abs(scale - Math.round(scale)) <= WHOLE_TOLERANCE) return off;
  if (coarsePointer && scale >= 2) return off;
  return { active: true, factor: Math.ceil(scale) };
}

/**
 * How uneven the plain nearest-neighbour scaling is at this scale: the spread of game-pixel widths in device pixels.
 * 0 means every game pixel is the same width (whole-number scale); 1 means widths differ by a whole device pixel.
 * (For reports and tests; the scaler itself only needs `planSharpScale`.)
 */
export function nearestUnevenness(scale: number): number {
  const frac = scale - Math.floor(scale);
  return frac < 1e-6 || frac > 1 - 1e-6 ? 0 : 1;
}
