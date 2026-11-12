// Headless checks of rendering helpers: the pixel-art upscaler used for close-up scenery, and its memory budget.
import { readFileSync } from 'node:fs';
import { scale2x, scale2xRows, scale4x } from '../src/road/PixelUpscale';
import { ENVIRONMENTS } from '../src/road/environments/Environments';
import { sceneryTexturesOf } from '../src/road/environments/Environments';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const img = (rows: number[][]): { d: Uint32Array; w: number; h: number } => ({ d: Uint32Array.from(rows.flat()), w: rows[0].length, h: rows.length });
const at = (d: Uint32Array, w: number, x: number, y: number) => d[y * w + x];

console.log('--- scale2x (EPX) ---');
{
  const s = img([[7, 7, 7], [7, 7, 7]]);
  const o = scale2x(s.d, s.w, s.h);
  check('output is twice as wide and twice as tall', o.length === 6 * 4);
  check('a flat colour stays flat', o.every((v) => v === 7));

  const dot = img([[0, 0, 0], [0, 5, 0], [0, 0, 0]]);
  const od = scale2x(dot.d, 3, 3);
  check('an isolated pixel becomes a clean 2x2 block', at(od, 6, 2, 2) === 5 && at(od, 6, 3, 2) === 5 && at(od, 6, 2, 3) === 5 && at(od, 6, 3, 3) === 5 && od.filter((v) => v === 5).length === 4);

  const line = img([[0, 0, 0, 0], [3, 3, 3, 3], [0, 0, 0, 0]]);
  const ol = scale2x(line.d, 4, 3);
  let straight = true;
  for (let x = 0; x < 8; x++) if (at(ol, 8, x, 2) !== 3 || at(ol, 8, x, 3) !== 3 || at(ol, 8, x, 0) !== 0 || at(ol, 8, x, 5) !== 0) straight = false;
  check('a straight line stays straight and exactly 2 px thick', straight);

  // A staircase edge: the outer corner of the middle step is rounded off (the whole point of the algorithm).
  const stairs = img([[1, 0, 0], [1, 1, 0], [1, 1, 1]]);
  const os = scale2x(stairs.d, 3, 3);
  const block = [at(os, 6, 2, 2), at(os, 6, 3, 2), at(os, 6, 2, 3), at(os, 6, 3, 3)];
  check('a stair-step corner is rounded: the exposed sub-pixel is cut off', block[0] === 1 && block[1] === 0 && block[2] === 1 && block[3] === 1, `(${block.join(',')})`);
  check('it creates no new colours', new Set(os).size <= new Set(stairs.d).size);

  // Random images: only source colours, and every 2x2 block keeps at least the centre colour or a neighbour colour.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let ok = true;
  for (let t = 0; t < 40; t++) {
    const w = 3 + Math.floor(rnd() * 12), h = 3 + Math.floor(rnd() * 12);
    const src = Uint32Array.from({ length: w * h }, () => Math.floor(rnd() * 4));
    const pal = new Set(src);
    const out = scale2x(src, w, h);
    if (out.length !== w * h * 4 || [...out].some((v) => !pal.has(v))) ok = false;
    // every block pixel is either the source pixel or one of its four neighbours
    for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
      const near = new Set([src[y * w + x], y > 0 ? src[(y - 1) * w + x] : 0, y < h - 1 ? src[(y + 1) * w + x] : 0, x > 0 ? src[y * w + x - 1] : 0, x < w - 1 ? src[y * w + x + 1] : 0]);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!near.has(out[(y * 2 + dy) * w * 2 + x * 2 + dx])) ok = false;
    }
  }
  check('random images: sizes are right, no new colours, every sub-pixel comes from the pixel or its neighbours', ok);
  check('deterministic', JSON.stringify([...scale2x(stairs.d, 3, 3)]) === JSON.stringify([...scale2x(stairs.d, 3, 3)]));
  // Doing the work in row slices (as the game does, a little per frame) gives exactly the same picture as doing it at once.
  let same = true;
  for (let t = 0; t < 25; t++) {
    const w = 4 + Math.floor(rnd() * 30), h = 4 + Math.floor(rnd() * 30);
    const src = Uint32Array.from({ length: w * h }, () => Math.floor(rnd() * 5));
    const whole = scale2x(src, w, h);
    const sliced = new Uint32Array(w * h * 4);
    for (let y = 0, step = 1 + Math.floor(rnd() * 7); y < h; ) y = scale2xRows(src, w, h, sliced, y, Math.min(h, y + step));
    if (whole.some((v, i) => v !== sliced[i])) same = false;
  }
  check('slice-by-slice scaling equals scaling all at once', same);
}

console.log('--- scale4x ---');
{
  const s = img([[1, 0, 0], [1, 1, 0], [1, 1, 1]]);
  const o = scale4x(s.d, 3, 3);
  check('output is four times as wide and tall', o.length === 12 * 12);
  const solid = [0, 1, 2, 3].every((i) => at(o, 12, 0, i) === 1) && at(o, 12, 11, 0) === 0;
  check('areas keep their shape: solid edge stays put, far corner stays empty', solid);
  // Where the filled area ends in each row. Plain 4x enlargement moves that edge only twice (three big steps);
  // the upscaler moves it in finer steps, which is what makes diagonals look smooth.
  const edge = (y: number) => { for (let x = 0; x < 12; x++) if (at(o, 12, x, y) === 0) return x; return 12; };
  let moves = 0;
  for (let y = 1; y < 12; y++) if (edge(y) !== edge(y - 1)) moves++;
  check('the diagonal edge moves in finer steps than plain 4x blocks (more than 2 changes)', moves > 2, `(${moves} changes)`);
}

console.log('--- close-up scenery budget ---');
{
  const meta = JSON.parse(readFileSync('public/assets/scenery/scenery.json', 'utf8')) as { assets: Record<string, { w: number; h: number; pxPerMetre: number | null }> };
  // Mirrors SceneryRenderer: art denser than 32 px/m (signs) is skipped; textures must stay within the 4096 px phone limit.
  const eligible = (k: string) => { const a = meta.assets[k]; return a && a.pxPerMetre !== null && a.pxPerMetre < 32; };
  // 4x version (16 pixels per art pixel) plus the 2x version (4 per art pixel), 4 bytes each
  const bytes = (keys: string[]) => keys.filter(eligible).reduce((s, k) => s + meta.assets[k].w * meta.assets[k].h * (16 + 4) * 4, 0);
  let tooBig = '';
  for (const e of ENVIRONMENTS) for (const k of sceneryTexturesOf([e])) if (eligible(k) && (meta.assets[k].w * 4 > 4096 || meta.assets[k].h * 4 > 4096)) tooBig += k + ' ';
  check('every smoothed texture fits the 4096 px limit', tooBig === '', tooBig);
  let worst = 0;
  for (const e of ENVIRONMENTS) {
    const mb = bytes(sceneryTexturesOf([e])) / 1048576;
    worst = Math.max(worst, mb);
    console.log(`      ${e.name.padEnd(20)} ${mb.toFixed(1)} MB of smoothed textures`);
  }
  const all = bytes(sceneryTexturesOf(ENVIRONMENTS)) / 1048576;
  console.log(`      all roads together   ${all.toFixed(1)} MB (the chained Journey)`);
  check('one road needs under 24 MB, even the whole Journey under 80 MB', worst < 24 && all < 80, `(worst ${worst.toFixed(1)} MB, all ${all.toFixed(1)} MB)`);
}

console.log(failures === 0 ? '\nALL RENDER CHECKS PASSED' : `\n${failures} RENDER CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
