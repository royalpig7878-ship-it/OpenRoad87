// Re-lays long horizontal spritesheets into a grid so no texture is wider than 4096 px
// (older phones cannot load wider textures). Run: node scripts/reslice-sheets.mjs
// Phaser spritesheets read a grid automatically from frameWidth/frameHeight, so no code changes are needed.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { encodePng } from 'file:///C:/Users/Owner/claude-pxl/src/index.ts';

const MAX = 4096;
const DIR = 'public/assets/effects/';

/** Decode an 8-bit PNG (greyscale, RGB, palette, grey+alpha or RGBA) into RGBA bytes. */
function decode(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], ctype = buf[25];
  if (depth !== 8 || buf[28] !== 0) throw new Error('only 8-bit non-interlaced PNGs are supported');
  let off = 8, idat = [], plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IDAT') idat.push(data); else if (type === 'PLTE') plte = data; else if (type === 'tRNS') trns = data;
    off += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= ch ? px[y * stride + x - ch] : 0, b = y > 0 ? px[(y - 1) * stride + x] : 0, c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * stride + x] = r & 255;
    }
  }
  const out = new Uint32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ctype === 6) { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    else if (ctype === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (ctype === 3) { const k = px[i]; r = plte[k * 3]; g = plte[k * 3 + 1]; b = plte[k * 3 + 2]; a = trns && k < trns.length ? trns[k] : 255; }
    else if (ctype === 4) { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    else { r = g = b = px[i]; }
    out[i] = (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
  }
  return { w, h, data: out };
}

const jobs = [
  ['fx_rain_overlay.png', 960, 540],
  ['fx_rain_splashes.png', 960, 540],
  ['anim_rain.png', 960, 540],
];
for (const [file, fw, fh] of jobs) {
  const img = decode(readFileSync(DIR + file));
  if (img.w <= MAX) { console.log(file, 'already fits', img.w + 'x' + img.h); continue; }
  const frames = img.w / fw;
  const cols = Math.floor(MAX / fw), rows = Math.ceil(frames / cols);
  const out = { w: cols * fw, h: rows * fh, data: new Uint32Array(cols * fw * rows * fh) };
  for (let f = 0; f < frames; f++) {
    const cx = (f % cols) * fw, cy = Math.floor(f / cols) * fh;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) out.data[(cy + y) * out.w + cx + x] = img.data[y * img.w + f * fw + x];
  }
  writeFileSync(DIR + file, encodePng(out));
  console.log(file, `${img.w}x${img.h} -> ${out.w}x${out.h} (${frames} frames in ${cols}x${rows})`);
}

// Note the new layout in the metadata files.
for (const [json, keys] of [['fx.json', ['fx_rain_overlay', 'fx_rain_splashes']], ['anims.json', ['anim_rain']]]) {
  const j = JSON.parse(readFileSync(DIR + json, 'utf8'));
  for (const k of keys) if (j[k]) { j[k].grid = [4, 2]; j[k].note = (j[k].note ? j[k].note + '; ' : '') + 're-gridded to 4x2 so the texture is <= 4096 px wide (scripts/reslice-sheets.mjs)'; }
  writeFileSync(DIR + json, JSON.stringify(j, null, 2));
}
