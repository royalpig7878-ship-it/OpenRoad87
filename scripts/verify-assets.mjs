// Verifies every file under public/assets, writes public/assets/manifest.json,
// and checks cockpit windshields are transparent. Run: npm run assets:verify
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { inflateSync } from 'node:zlib';

const ROOT = 'public/assets';
const errors = [];
const manifest = {};

/** Minimal PNG decoder (8-bit, non-interlaced, RGB/RGBA/palette) returning {w,h,alphaAt(x,y)}. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], ctype = buf[25], interlace = buf[28];
  let off = 8, idat = [], plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) return { w, h, alphaAt: null };
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= ch && y > 0 ? px[(y - 1) * stride + x - ch] : 0;
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * stride + x] = r & 255;
    }
  }
  const alphaAt = (x, y) => {
    const i = y * stride + x * ch;
    if (ctype === 6) return px[i + 3];
    if (ctype === 4) return px[i + 1];
    if (ctype === 3) return trns && px[i] < trns.length ? trns[px[i]] : 255;
    return 255;
  };
  void plte;
  return { w, h, alphaAt };
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (name === '.gitkeep') continue;
    const rel = p.replace(/\\/g, '/').slice(ROOT.length + 1);
    const size = statSync(p).size;
    if (size === 0) errors.push(`${rel}: empty file`);
    const ext = extname(name);
    const entry = { category: rel.split('/')[0], bytes: size };
    if (ext === '.png') {
      try {
        const img = decodePng(readFileSync(p));
        entry.w = img.w; entry.h = img.h;
        // Older phones cannot load textures wider/taller than 4096 px.
        if (img.w > 4096 || img.h > 4096) errors.push(`${rel}: ${img.w}x${img.h} exceeds the 4096 px mobile texture limit (see scripts/reslice-sheets.mjs)`);
        if (rel.startsWith('cockpits/cockpit_')) {
          if (!img.alphaAt) errors.push(`${rel}: cannot check alpha`);
          else {
            const glass = [[480, 150], [60, 100], [400, 250], [900, 250]];
            const dash = [[480, 520], [100, 450]];
            for (const [x, y] of glass) if (img.alphaAt(x, y) !== 0 && !(x > 670 && y < 110)) errors.push(`${rel}: windshield not transparent at ${x},${y}`);
            for (const [x, y] of dash) if (img.alphaAt(x, y) !== 255) errors.push(`${rel}: dashboard not opaque at ${x},${y}`);
            entry.windshieldTransparent = true;
          }
        }
      } catch (e) { errors.push(`${rel}: ${e.message}`); }
    } else if (ext === '.json') {
      try { JSON.parse(readFileSync(p, 'utf8')); } catch (e) { errors.push(`${rel}: invalid JSON`); }
    }
    manifest[rel] = entry;
  }
}
walk(ROOT);

// Every "file" referenced from the metadata JSONs must exist in the same folder.
for (const rel of Object.keys(manifest).filter((r) => r.endsWith('.json') && r !== 'manifest.json')) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  for (const m of text.matchAll(/"(?:file|same_as)":\s*"([^"]+\.png)"/g)) {
    const dir = rel.split('/')[0];
    if (!manifest[`${dir}/${m[1]}`] && !Object.keys(manifest).some((k) => k.endsWith('/' + m[1]))) errors.push(`${rel}: references missing ${m[1]}`);
  }
}

writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 1));
const counts = {};
for (const e of Object.values(manifest)) counts[e.category] = (counts[e.category] ?? 0) + 1;
console.log('Files per category:', counts, '\nTotal:', Object.keys(manifest).length);
if (errors.length) { console.error('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('All assets verified OK. Manifest written to public/assets/manifest.json');
