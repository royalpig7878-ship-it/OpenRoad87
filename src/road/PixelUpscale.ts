/**
 * Pixel-art upscaling (the EPX / "Scale2x" algorithm) on plain RGBA data, free of browser APIs so it can be tested.
 *
 * Plain nearest-neighbour enlargement turns every art pixel into a big square, which looks chunky when scenery is
 * close to the camera. Scale2x doubles the resolution and only changes the pixels at corners and diagonal steps,
 * so edges get smoother while flat areas, colours and the pixel-art look are kept (no blur, no new colours).
 */

/**
 * Scale2x for source rows y0..y1-1 only, writing into `out` (a 2w x 2h image). Returns y1, so a long job can be done in
 * slices: call it repeatedly with the previous return value as the next y0.
 */
export function scale2xRows(src: Uint32Array, w: number, h: number, out: Uint32Array, y0: number, y1: number): number {
  const W = w * 2;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x];
      // Neighbours (edges repeat the centre pixel so borders stay clean).
      const a = y > 0 ? src[(y - 1) * w + x] : p; // up
      const b = x < w - 1 ? src[y * w + x + 1] : p; // right
      const c = x > 0 ? src[y * w + x - 1] : p; // left
      const d = y < h - 1 ? src[(y + 1) * w + x] : p; // down
      let e1 = p, e2 = p, e3 = p, e4 = p;
      if (c === a && c !== d && a !== b) e1 = a;
      if (a === b && a !== c && b !== d) e2 = b;
      if (d === c && d !== b && c !== a) e3 = c;
      if (b === d && b !== a && d !== c) e4 = d;
      const o = y * 2 * W + x * 2;
      out[o] = e1;
      out[o + 1] = e2;
      out[o + W] = e3;
      out[o + W + 1] = e4;
    }
  }
  return y1;
}

/** Doubles a w x h image of packed 32-bit pixels (any channel order). Returns a 2w x 2h image. */
export function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * 2 * h * 2);
  scale2xRows(src, w, h, out, 0, h);
  return out;
}

/** Quadruples the size by applying Scale2x twice. Returns a 4w x 4h image. */
export function scale4x(src: Uint32Array, w: number, h: number): Uint32Array {
  return scale2x(scale2x(src, w, h), w * 2, h * 2);
}
