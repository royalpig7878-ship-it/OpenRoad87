// Measures how much of each gauge the steering wheel covers, per car, at rest and at full steering lock.
// Uses the exported art (public/assets/cockpits) and placements.json, in 960x540 game space.
// Run: node scripts/wheel-gauge-overlap.mjs   (exit code 1 if any gauge is covered more than the limit)
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const DIR = 'public/assets/cockpits/';
const LIMIT = Number(process.env.LIMIT ?? 0.1); // worst allowed covered fraction of a gauge
const MAXROT = Number(process.env.MAXROT ?? 45); // steering lock in degrees (MAX_WHEEL_DEGREES in UI/gaugeMath.ts)
const BIG_LIMIT = Number(process.env.BIG_LIMIT ?? 0.06); // the two big gauges (speedo, rpm) must stay almost fully visible

function decode(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), ct = buf[25];
  let off = 8; const idat = []; let trns = null;
  while (off < buf.length) { const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8); if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len)); else if (type === 'tRNS') trns = buf.subarray(off + 8, off + 8 + len); off += 12 + len; }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * ch, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y > 0 ? px[(y - 1) * stride + x] : 0, c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
      let r; if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * stride + x] = r & 255;
    }
  }
  return { w, h, opaque: (x, y) => x >= 0 && y >= 0 && x < w && y < h && (ct === 6 ? px[(y * w + x) * 4 + 3] > 40 : ct === 3 ? (trns ? (trns[px[y * w + x]] ?? 255) > 40 : true) : ct === 4 ? px[(y * w + x) * 2 + 1] > 40 : true) };
}

const P = JSON.parse(readFileSync(DIR + 'placements.json', 'utf8'));
let worst = 0, failures = 0;
const rows = [];
for (const [cockpit, layout] of Object.entries(P.cockpits)) {
  const id = cockpit.replace('cockpit_', '');
  const wp = layout.wheel ?? P.wheel;
  const rim = decode(readFileSync(`${DIR}steering_wheel_${id}_rim.png`));
  const sheet = decode(readFileSync(`${DIR}steering_wheel_${id}_spokes.png`));
  const { frameWidth: fw, frameHeight: fh, degrees } = wp.spokes;
  const cols = Math.round(sheet.w / fw);
  const rx0 = Math.round(wp.x - rim.w / 2), ry0 = Math.round(wp.y - rim.h / 2);
  const covered = (frame, gx, gy) => {
    // rim pixel?
    if (rim.opaque(gx - rx0, gy - ry0)) return true;
    const col = frame % cols, row = Math.floor(frame / cols);
    const sx = gx - wp.spokes.x, sy = gy - wp.spokes.y;
    return sx >= 0 && sy >= 0 && sx < fw && sy < fh && sheet.opaque(col * fw + sx, row * fh + sy);
  };
  // frames to test: rest (0 degrees) and both locks
  // The wheel at rest (0 degrees) must keep off the gauges. While turning, spokes may cross them (reported for information only).
  const rest = degrees.indexOf(0), frames = [rest];
  const turned = degrees.map((d, i) => i).filter((i) => i !== rest && Math.abs(degrees[i]) <= MAXROT);
  for (const g of layout.gauges) {
    let worstHere = 0, which = rest;
    for (const f of frames) {
      let total = 0, hit = 0;
      for (let y = Math.floor(g.y - g.radius); y <= Math.ceil(g.y + g.radius); y++) for (let x = Math.floor(g.x - g.radius); x <= Math.ceil(g.x + g.radius); x++) {
        if (Math.hypot(x - g.x, y - g.y) > g.radius) continue;
        total++; if (covered(f, x, y)) hit++;
      }
      const frac = hit / total;
      if (frac > worstHere) { worstHere = frac; which = f; }
    }
    let turnedWorst = 0;
    for (const f of turned) { let total = 0, hit = 0; for (let y = Math.floor(g.y - g.radius); y <= Math.ceil(g.y + g.radius); y++) for (let x = Math.floor(g.x - g.radius); x <= Math.ceil(g.x + g.radius); x++) { if (Math.hypot(x - g.x, y - g.y) > g.radius) continue; total++; if (covered(f, x, y)) hit++; } turnedWorst = Math.max(turnedWorst, hit / total); }
    const big = g.kind === 'rpm' || g.kind === 'speedo';
    const limit = big ? BIG_LIMIT : LIMIT;
    const bad = worstHere > limit;
    if (bad) failures++;
    worst = Math.max(worst, worstHere);
    rows.push(`${bad ? 'FAIL' : 'ok  '} ${id.padEnd(17)} ${g.kind.padEnd(7)} covered ${(worstHere * 100).toFixed(1).padStart(5)}%  (limit ${(limit * 100).toFixed(0)}%, at rest; up to ${(turnedWorst * 100).toFixed(0)}% while turning, allowed)`);
  }
}
console.log(rows.join('\n'));
console.log(`\nworst covered fraction: ${(worst * 100).toFixed(1)}%   gauges over their limit: ${failures}`);
process.exit(failures ? 1 : 0);
