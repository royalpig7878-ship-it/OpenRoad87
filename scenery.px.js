// OPEN ROAD '87 roadside scenery, backgrounds and highway infrastructure.
// Shared rules: sun from the upper left; world objects at S = 16 px per metre; road signs and the
// mile marker at SIGN = 64 px per metre so lettering stays readable; distant props say their own scale.
// Objects stand on the bottom row of their canvas (anchor = bottom centre). See META at the end.

const S = 16, SIGN = 64
const META = {}

// ---------------- palette ----------------
const BASE = {
  k: "#0c0a10", w: "#f6f4ec", x: "#121216", y: "#f2c418", z: "#a8800c", r: "#d8242a", q: "#7a1016",
  b: "#1e4fa8", c: "#123270", g: "#1e7a3c", h: "#0f4a24", s: "#d4d8de", t: "#9aa0aa", u: "#5c626e",
  v: "#0e1420", e: "#3a5470", l: "#fff2b0", o: "#e87a20", n: "#2a1a10", Z: "#ff00ff",
}
const GRAY = ["#2a2a30", "#4a4a52", "#6e6e76", "#96969c", "#c4c4c8"]
const R = {
  pine: ["#0e2418", "#183a24", "#245230", "#36703c", "#5a9450"],
  bark: ["#2a160c", "#4a2a16", "#6e4224", "#946036", "#b88456"],
  rock: ["#26262e", "#44464f", "#686a72", "#8e9096", "#b8b8bc"],
  granite: ["#2e2a30", "#4e4850", "#726a6e", "#9a9090", "#c4bcb4"],
  sand: ["#3a2050", "#7a3a2a", "#b45a32", "#d8804a", "#f0aa6a"],
  sand2: ["#33204a", "#6a3424", "#a04c2a", "#c86c3c", "#e4945a"],
  cactus: ["#16303a", "#2a5a3a", "#3e7a44", "#5e9a52", "#8cbc6a"],
  dry: ["#3a3040", "#6a5a3a", "#8a7a4a", "#aa9a62", "#cabb84"],
  palm: ["#0e2a2a", "#1c4a30", "#2e6a34", "#4a8a3a", "#7ab04a"],
  palmTrunk: ["#3a2a2a", "#5e4430", "#806040", "#a08054", "#c4a272"],
  leaf: ["#142a14", "#22421c", "#365e24", "#52802e", "#80a840"],
  wood: ["#2a1a10", "#4a3020", "#6a4a30", "#8c6a46", "#b08c62"],
  barn: ["#3a0c0c", "#6a1614", "#962420", "#b83a2c", "#d86048"],
  paint: ["#5a5e6a", "#9aa0aa", "#c8ccd4", "#e6e8ee", "#ffffff"],
  roof: ["#1e2028", "#363a44", "#50545e", "#6c707a", "#8c909a"],
  steel: ["#2c3038", "#4c5260", "#7a808c", "#a8aeb8", "#d8dce2"],
  concrete: ["#4a4a4c", "#6e6e70", "#929290", "#b4b4ae", "#d4d2ca"],
  rust: ["#2a1810", "#5a2e18", "#8a4a24", "#aa6a38", "#c88c58"],
  grass: ["#1a3a1a", "#2c5a24", "#40782c", "#5e9838", "#8cbc50"],
  brick: ["#3a1410", "#5e2418", "#843424", "#a44a32", "#c46a4a"],
  farMtn: ["#2a2c58", "#3e4478", "#58609a", "#7c86b8", "#a8b4d8"],
  snow: ["#7880aa", "#a0a8cc", "#c8d0e8", "#e8ecf8", "#ffffff"],
  nearMtn: ["#1e2228", "#363a40", "#545852", "#767a6a", "#9ea08a"],
  ocean: ["#0a1e48", "#123470", "#1c4e98", "#3a74bc", "#7aaee0"],
  mesa: ["#3e3060", "#8a4636", "#b8643e", "#d88a56", "#f2b478"],
  orange: ["#5a1e08", "#a03a10", "#d85a18", "#f07e28", "#ffac50"],
  red: ["#3a080c", "#7a1016", "#b81c22", "#e0302c", "#ff6a50"],
}
function use(A = GRAY, B = GRAY, C = GRAY, D = GRAY) {
  const m = { ...BASE }
  ;[[A, "12345"], [B, "ABCDE"], [C, "FGHIJ"], [D, "LMNOP"]].forEach(([r, keys]) => r.forEach((hx, i) => (m[keys[i]] = hx)))
  pal(m); ramps("k12345", "kABCDE", "kFGHIJ", "kLMNOP")
}
const RA = "12345", RB = "ABCDE", RC = "FGHIJ", RD = "LMNOP"

// ---------------- core helpers ----------------
const rng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const P = (c, x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, k) }
const poly = (c, pts, k) => c.poly(pts.map(Math.round), k)
const light = (nx, ny) => { const d = Math.min(1, nx * nx + ny * ny); return -0.55 * nx - 0.62 * ny + 0.56 * Math.sqrt(1 - d) }
const lvl = (l, x, y) => { const v = Math.max(0, Math.min(4, (l + 0.55) * 2.6)); const i = Math.floor(v), f = v - i; return Math.min(4, f > 0.72 ? i + 1 : f > 0.45 && (x + y) & 1 ? i + 1 : i) }
// recolour every temp-key pixel with ramp shading from a normal function
function shadeFill(c, ramp, nfn, key = "Z") {
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (!c.is(x, y, key)) continue
    const [nx, ny, add = 0] = nfn(x, y)
    c.px(x, y, ramp[lvl(light(nx, ny) + add, x, y)])
  }
}
function outline(c, col = "k") {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, "*")) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.is(x + dx, y + dy, "*"))) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, col)
}
// bright rim on the sun side of a material's silhouette
function rim(c, keys, col) {
  const hits = []
  for (let y = 1; y < c.h; y++) for (let x = 1; x < c.w; x++) if (c.is(x, y, keys) && (!c.is(x, y - 1, "*") || !c.is(x - 1, y, "*"))) hits.push([x, y])
  for (const [x, y] of hits) c.px(x, y, col)
}
function obj(name, w, h, pxm, fn, kind = "object") { META[name] = { pxPerMetre: pxm, anchor: kind === "background" ? "tile-x" : "bottom-centre", kind, w, h }; sprite(name, { w, h }, fn) }

// faceted rock: jagged dome outline over a flat base, normals quantised into chunky planes
function rock(c, cx, by, rx, ry, seed, ramp, o = {}) {
  const Rn = rng(seed), n = o.n ?? 12, pts = []
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI, rr = 0.8 + Rn() * 0.28
    pts.push(cx + Math.cos(a) * rx * rr, by + Math.sin(a) * ry * rr * (o.squash?.(i / (n - 1)) ?? 1))
  }
  pts.push(cx + rx * 0.92, by, cx - rx * 0.92, by)
  poly(c, pts, "Z")
  const off = Rn() * 6.28, k = o.facets ?? 7, step = (2 * Math.PI) / k, cy = by - ry * 0.4
  shadeFill(c, ramp, (x, y) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry
    const a = Math.round((Math.atan2(dy, dx) - off) / step) * step + off, t = Math.min(1, Math.hypot(dx, dy))
    const tq = t < 0.3 ? 0.1 : t < 0.68 ? 0.62 : 0.92
    let add = 0
    if (o.strata) add += ((Math.floor((y + Math.sin(x * 0.2) * 2) / o.strata) & 1) ? -0.18 : 0.05)
    return [Math.cos(a) * tq, Math.sin(a) * tq, add]
  })
  for (let i = 0; i < (o.cracks ?? 3); i++) {           // cracks run down from the top edge
    let x = cx + (Rn() - 0.5) * rx * 1.2, y = by - ry * 0.9
    while (y < c.h && !c.is(Math.round(x), Math.round(y), ramp)) y++
    for (let j = 0; j < ry * 0.6; j++) { x += (Rn() - 0.5) * 1.6; y += 1; if (c.is(Math.round(x), Math.round(y), ramp)) c.px(Math.round(x), Math.round(y), ramp[0]) }
  }
}

// pine: overlapping sawtooth tiers, upper tiers cast a shadow on the ones below
function pine(c, cx, by, H, W, tiers, ramp = RA, trunk = RB) {
  const tw = Math.max(2, Math.round(W * 0.09))
  for (let y = Math.round(by - H * 0.3); y <= by; y++) for (let x = cx - tw; x <= cx + tw; x++) P(c, x, y, trunk[x < cx ? 3 : x === cx ? 2 : 1])
  const apex = by - H, span = H * 0.86
  const T = []
  for (let i = 0; i < tiers; i++) {
    const yt = apex + (i * span) / tiers * 0.82, yb = apex + ((i + 1) * span) / tiers + 4
    T.push({ yt, yb, hw: (W / 2) * (0.3 + (0.7 * (i + 1)) / tiers) })
  }
  const edge = (t, x, i) => { const dx = Math.abs(x - cx) / t.hw; return t.yb - 3 * dx * dx + (((x + i * 2) % 5) < 2 ? 2 : 0) }
  const inside = (t, x, y, i) => y >= t.yt && y <= edge(t, x, i) && Math.abs(x - cx) <= t.hw * ((y - t.yt) / (t.yb - t.yt)) + 1
  for (let i = tiers - 1; i >= 0; i--) {
    const t = T[i]
    for (let y = Math.floor(t.yt); y <= Math.ceil(t.yb + 2); y++) for (let x = Math.floor(cx - t.hw - 2); x <= cx + t.hw + 2; x++) {
      if (!inside(t, x, y, i)) continue
      const v = (y - t.yt) / (t.yb - t.yt), nx = (x - cx) / t.hw
      let l = -0.75 * nx + 0.25 - 0.55 * v * v * v + (v < 0.25 ? 0.15 : 0)
      if (((x * 3 + y * 5) % 7 === 0) && nx < 0.2) l += 0.25                      // needle tufts catching light
      P(c, x, y, ramp[lvl(l, x, y)])
    }
    if (i < tiers - 1) {                                                          // shadow on the tier below
      const lo = T[i + 1]
      c.shade((x, y) => y > edge(t, x, i) && y <= edge(t, x, i) + 3 && inside(lo, x, y, i + 1), 1)
    }
  }
}

// leafy canopy built from lit clumps (global dome light + local clump light)
function canopy(c, cx, cy, rx, ry, count, seed, ramp = RA, rmin = 8, rmax = 14) {
  const Rn = rng(seed), clumps = []
  for (let i = 0; i < count; i++) {
    const a = Rn() * Math.PI * 2, d = Math.sqrt(Rn())
    clumps.push({ x: cx + Math.cos(a) * rx * d * 0.78, y: cy + Math.sin(a) * ry * d * 0.78, r: rmin + Rn() * (rmax - rmin), p: Rn() * 6 })
  }
  clumps.sort((a, b) => a.y - b.y)
  for (const k of clumps) for (let y = Math.floor(k.y - k.r - 2); y <= k.y + k.r + 2; y++) for (let x = Math.floor(k.x - k.r - 2); x <= k.x + k.r + 2; x++) {
    const dx = x - k.x, dy = y - k.y, ang = Math.atan2(dy, dx)
    if (Math.hypot(dx, dy) > k.r + Math.sin(ang * 7 + k.p) * 1.3) continue
    const gl = light((x - cx) / rx, (y - cy) / ry), lo = light(dx / k.r, dy / k.r)
    let l = gl * 0.6 + lo * 0.5 - 0.22
    if (((x * 5 + y * 3) % 11 === 0) && lo > 0.3) l += 0.3                         // leaf glints
    P(c, x, y, ramp[lvl(l, x, y)])
  }
}

// simple 3D: profile in the x/y plane extruded along z; oblique view from upper left-front
const A3 = 0.35, B3 = 0.22
function scene3(prims, pad = 6, pxm = S) {
  let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9
  for (const p of prims) for (const [x, y] of p.prof) for (const z of [p.z0, p.z1]) {
    const u = x + z * A3, w = y + z * B3; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w)
  }
  const W = Math.ceil((u1 - u0) * pxm) + pad * 2, H = Math.ceil((w1 - w0) * pxm) + pad + 1
  const q = (x, y, z) => [pad + (x + z * A3 - u0) * pxm, H - 1 - (y + z * B3 - w0) * pxm]
  return { W, H, q }
}
function extrude(c, V, p) {
  const n = p.prof.length, faces = []
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p.prof[i], [x1, y1] = p.prof[(i + 1) % n], L = Math.hypot(x1 - x0, y1 - y0) || 1
    const nx = (y1 - y0) / L, ny = -(x1 - x0) / L
    if (nx > 0.01 || ny > 0.01) faces.push({ nx, ny, pts: [[x0, y0, p.z0], [x1, y1, p.z0], [x1, y1, p.z1], [x0, y0, p.z1]] })
  }
  faces.sort((a, b) => a.nx + a.ny - (b.nx + b.ny))
  for (const f of faces) {
    const roof = f.ny > 0.3, col = roof ? (f.nx < -0.1 ? p.roofLit : f.nx > 0.1 ? p.roofDark : p.top ?? p.roofLit) : p.side
    poly(c, f.pts.flatMap((pt) => V.q(...pt)), col)
  }
  poly(c, p.prof.flatMap(([x, y]) => V.q(x, y, p.z0)), p.near)
}
const prism = (prof, z0, z1, m) => ({ prof, z0, z1, ...m })
const boxP = (x0, x1, y0, y1, z0, z1, m) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, m)
// rectangle on the near (z) plane / side (x) plane, in metres
const nearRect = (c, V, x0, x1, y0, y1, z, k) => poly(c, [x0, y0, x1, y0, x1, y1, x0, y1].reduce((a, v, i) => (i % 2 ? a : a.concat(V.q(v, [y0, y0, y1, y1][i / 2], z))), []), k)
const sideRect = (c, V, x, z0, z1, y0, y1, k) => poly(c, [...V.q(x, y0, z0), ...V.q(x, y0, z1), ...V.q(x, y1, z1), ...V.q(x, y1, z0)], k)
const line3 = (c, V, a, b, k, w = 1) => { const p = V.q(...a), q = V.q(...b); c.line(Math.round(p[0]), Math.round(p[1]), Math.round(q[0]), Math.round(q[1]), k, w) }
function glassRect(c, V, x0, x1, y0, y1, z, side = false) {
  if (side) sideRect(c, V, x0, y0, y1, z, x1, "v"); else nearRect(c, V, x0, x1, y0, y1, z, "v")
}

// ======================= MOUNTAIN =======================
// periodic ridge heights so backgrounds tile horizontally
function ridgeH(x, W, layers) { let h = 0; for (const [f, a, p, e] of layers) h += a * Math.pow(1 - Math.abs(Math.sin((Math.PI * f * x) / W + p)), e ?? 1.4); return h }
function mountains(c, layers, base, ramp, o = {}) {
  const W = c.w, Hh = (x) => ridgeH(((x % W) + W) % W, W, layers) + base
  for (let x = 0; x < W; x++) {
    const top = Math.round(c.h - Hh(x))
    for (let y = Math.max(0, top); y < c.h; y++) {
      const depth = y - top, xr = x - depth * 0.55
      const slope = Hh(xr + 2) - Hh(xr - 2)
      let l = Math.max(-0.9, Math.min(0.9, slope * (o.gain ?? 0.22))) - (depth > 0 ? 0.05 : -0.2)
      if (o.haze) l += Math.max(0, (y - c.h * 0.55) / c.h) * o.haze
      let col = ramp[lvl(l, x, y)]
      if (o.snow) {
        const sd = (Hh(xr) - o.snow) * 0.7 + Math.sin((x * 2 * Math.PI * 107) / W) * 2 + Math.sin((x * 2 * Math.PI * 35) / W) * 3
        if (depth < sd) col = R.snow ? o.snowRamp[lvl(l + 0.25, x, y)] : col
      }
      c.px(x, y, col)
    }
  }
}

use(R.farMtn, R.snow)
obj("scenery_mountain_far", 960, 200, null, (c) => {
  mountains(c, [[2, 70, 0.3, 1.2], [3, 45, 1.1], [5, 30, 2.0], [9, 16, 0.7], [17, 8, 1.3], [31, 4, 0.2]], 18, RA, { snow: 120, snowRamp: RB, gain: 0.25, haze: 0.9 })
}, "background")

use(R.nearMtn, R.pine, R.snow)
obj("scenery_mountain_near", 960, 240, null, (c) => {
  mountains(c, [[3, 80, 0.9, 1.3], [4, 50, 0.2], [7, 30, 1.7], [13, 14, 0.4], [29, 6, 2.2]], 30, RA, { gain: 0.3, snow: 150, snowRamp: RC })
  // strata ledges on the rock faces
  for (let x = 0; x < c.w; x++) for (let y = 0; y < c.h; y++) if (c.is(x, y, "2345") && ((y + Math.round(Math.sin((x * 2 * Math.PI * 8) / 960) * 6)) % 11 === 0)) c.px(x, y, "1")
  // tileable pine treeline along the foot of the range
  for (let i = 0; i < 160; i++) {
    const x = (i * 6 + Math.round(Math.sin(i * 1.7) * 3) + 960) % 960, h = 14 + Math.round((Math.sin(i * 2.3) + 1) * 8)
    for (const dx of [0, -960, 960]) pine(c, x + dx, c.h - 1 - Math.round((Math.sin(i * 0.9) + 1) * 3), h, Math.round(h * 0.55), 3, RB, "11111")
  }
}, "background")

use(R.pine, R.bark)
obj("scenery_pine_tree", 112, 240, S, (c) => { pine(c, 56, 239, 226, 100, 7); outline(c) })
obj("scenery_pine_tree_small", 64, 112, S, (c) => { pine(c, 32, 111, 98, 54, 4); outline(c) })

use(R.granite, R.grass)
obj("scenery_rock_large", 176, 120, S, (c) => {
  rock(c, 104, 119, 70, 100, 11, RA, { facets: 8, cracks: 5 })
  rock(c, 46, 119, 40, 58, 23, RA, { facets: 6 })
  rock(c, 140, 119, 30, 30, 7, RA)
  rim(c, "345", "5"); outline(c)
})
obj("scenery_rock_small", 48, 32, S, (c) => {
  rock(c, 18, 31, 15, 18, 3, RA, { cracks: 1 }); rock(c, 34, 31, 11, 11, 9, RA, { cracks: 0 }); rock(c, 7, 31, 6, 6, 5, RA, { cracks: 0 })
  outline(c)
})

// frontal guardrail segment (tileable 128 px = 8 m, posts every 4 m)
function guardrail(c, beam, post, o = {}) {
  const gy = c.h - 1, top = gy - 13
  for (const px of [12, 76]) {
    if (o.woodPost) { c.rect(px - 3, top - 2, 7, 16, post[2]); c.vline(px - 3, top - 2, 16, post[3]); c.vline(px + 3, top - 2, 16, post[0]); c.hline(px - 3, top - 2, 7, post[4]) }
    else { c.rect(px - 2, top, 5, 14, post[2]); c.vline(px - 2, top, 14, post[3]); c.vline(px + 2, top, 14, post[0]) }
  }
  if (o.timber) {               // twin timber rails
    for (const [y0, hh] of [[top + 1, 4], [top + 7, 4]]) { c.rect(0, y0, 128, hh, beam[2]); c.hline(0, y0, 128, beam[4]); c.hline(0, y0 + hh - 1, 128, beam[0]); for (let x = 5; x < 128; x += 23) c.hline(x, y0 + 2, 9, beam[1]) }
    return
  }
  const rows = [4, 3, 2, 1, 2, 3]                // W-beam: lit upper ridge, dark groove, lower ridge
  rows.forEach((k, i) => c.hline(0, top + 1 + i, 128, beam[k]))
  for (const px of [12, 76]) { P(c, px, top + 3, beam[0]); P(c, px + 1, top + 3, beam[4]) }   // bolts
  if (o.rust) for (const px of [12, 76]) for (let i = 1; i < 6; i++) if (i % 2) P(c, px + (i % 3) - 1, top + 3 + i, o.rust)  // rust runs below bolts
  if (o.reflector) for (const px of [12, 76]) c.rect(px - 1, top - 3, 3, 2, o.reflector)
}
use(R.steel, R.wood, R.rust)
obj("scenery_guardrail", 128, 24, S, (c) => { guardrail(c, RA, RA, { rust: "C", woodPost: false }); outline(c) })

// mountain highway information sign (no lettering): green panel, blank route shield, arrow
use(R.steel)
obj("scenery_road_sign", 80, 80, S, (c) => {
  for (const x of [22, 56]) { c.rect(x, 40, 3, 40, "3"); c.vline(x, 40, 40, "4") }
  c.rect(6, 6, 68, 40, "h"); c.rect(7, 7, 66, 38, "g"); c.rect(9, 9, 62, 34, "w"); c.rect(10, 10, 60, 32, "g")
  poly(c, [18, 15, 34, 15, 34, 28, 26, 35, 18, 28], "w"); poly(c, [20, 17, 32, 17, 32, 27, 26, 32, 20, 27], "x")  // blank shield
  c.rect(23, 20, 7, 3, "w")
  c.line(44, 34, 60, 18, "w", 3); poly(c, [52, 16, 63, 15, 62, 26], "w")                                       // exit arrow
  c.hline(7, 45, 66, "h"); outline(c)
})

// tunnel portal helper: dark interior with receding ring and ceiling lights
function tunnelMouth(c, cx, gy, rx, ry, spring) {
  const inside = (x, y, s = 1) => { const dx = (x - cx) / (rx * s), top = gy - spring * s; return Math.abs(dx) <= 1 && y <= gy && (y >= top || ((y - top) / (ry * s)) ** 2 + dx * dx <= 1) }
  for (let y = 0; y <= gy; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    if (!inside(x, y)) continue
    const deep = inside(x, y, 0.5) ? 2 : inside(x, y, 0.75) ? 1 : 0
    c.px(x, y, deep === 2 ? "k" : deep === 1 ? (((x + y) & 1) ? "k" : "v") : "v")
  }
  for (let i = 0; i < 6; i++) { const s = 0.92 - i * 0.08, y = Math.round(gy - spring * s - ry * s * 0.9); P(c, cx - 1, y, "l"); P(c, cx, y, "l"); P(c, cx + 1, y, "o") }
  return inside
}
use(R.granite, R.concrete, R.pine, R.bark)
obj("scenery_tunnel", 352, 240, S, (c) => {
  poly(c, [0, 239, 0, 120, 30, 70, 70, 50, 110, 20, 160, 8, 210, 14, 250, 40, 300, 60, 330, 100, 351, 130, 351, 239], "Z")
  const off = 0.7
  shadeFill(c, RA, (x, y) => { const a = Math.round((Math.atan2(y - 150, x - 176) - off) / 0.9) * 0.9 + off, t = Math.min(1, Math.hypot((x - 176) / 176, (y - 180) / 170)); return [Math.cos(a) * t, Math.sin(a) * t, ((x * 7 + y * 3) % 23 === 0) ? -0.3 : 0] })
  for (let i = 0; i < 40; i++) { const x = (i * 37) % 340 + 6; { const y0 = 40 + (i * 13) % 150; for (let k = 0; k < 20; k++) { const xx = Math.round(x + (k * (4 - (i % 3) * 3)) / 20); if (c.is(xx, y0 + k, RA)) c.px(xx, y0 + k, "1") } } }  // rock seams
  // stone voussoir arch around the mouth
  const cx = 176, gy = 239, rx = 92, ry = 70, sp = 70
  for (let y = 0; y <= gy; y++) for (let x = cx - rx - 14; x <= cx + rx + 14; x++) {
    const dx = (x - cx) / (rx + 14), top = gy - sp
    const inRing = Math.abs(dx) <= 1 && (y >= top || ((y - top) / (ry + 14)) ** 2 + dx * dx <= 1)
    if (!inRing) continue
    const ang = Math.atan2(y - top, x - cx), block = Math.floor((ang + 4) * 6) + (y > top ? Math.floor(y / 12) : 0)
    c.px(x, y, (block % 2 ? "C" : "D"))
    if (Math.abs(((ang + 4) * 6) % 1) < 0.08 || (y > top && y % 12 === 0)) c.px(x, y, "A")
  }
  tunnelMouth(c, cx, gy, rx, ry, sp)
  for (const [x, h] of [[40, 54], [70, 40], [262, 60], [296, 46], [320, 38]]) { let gy = 0; while (gy < 239 && !c.is(x, gy, "*")) gy++; pine(c, x, gy + 6, h, h * 0.5, 4, RC, RD) }
  outline(c)
})

// ======================= FOREST & COUNTRY =======================
use(R.pine, R.bark)
obj("forest_pine_cluster", 224, 240, S, (c) => {
  for (const [x, h, w, t] of [[150, 210, 92, 7], [60, 190, 84, 6], [110, 236, 104, 8], [190, 120, 60, 5], [24, 110, 50, 4], [86, 90, 46, 4], [168, 80, 40, 4]]) pine(c, x, 239, h, w, t)
  outline(c)
})

use(R.leaf, R.bark, R.grass)
obj("forest_deciduous_tree", 160, 192, S, (c) => {
  c.line(80, 191, 80, 90, "B", 9); c.line(78, 191, 79, 100, "D", 3); c.line(84, 191, 84, 96, "A", 2)
  c.line(80, 120, 50, 84, "B", 5); c.line(80, 112, 112, 80, "B", 5); c.line(80, 100, 76, 50, "B", 4)
  canopy(c, 80, 82, 72, 66, 34, 5, RA, 11, 20)
  for (let y = 184; y < 192; y++) for (let x = 70; x < 92; x++) if (c.is(x, y, "*") && ((x + y) & 1)) c.px(x, y, "A")
  outline(c)
})
obj("forest_bush", 64, 40, S, (c) => { canopy(c, 32, 26, 28, 14, 12, 8, RA, 6, 10); outline(c) })

use(R.wood)
obj("forest_wooden_fence", 128, 32, S, (c) => {
  for (const px of [6, 70]) { c.rect(px - 3, 8, 7, 24, "3"); c.vline(px - 3, 8, 24, "4"); c.vline(px + 3, 8, 24, "1"); poly(c, [px - 3, 8, px, 5, px + 4, 8], "4") }
  for (const y0 of [12, 21]) { c.rect(0, y0, 128, 4, "3"); c.hline(0, y0, 128, "5"); c.hline(0, y0 + 3, 128, "1"); for (let x = 9; x < 128; x += 29) c.hline(x, y0 + 1, 11, "2") }
  for (const px of [38, 102]) { c.rect(px - 2, 10, 5, 22, "3"); c.vline(px - 2, 10, 22, "4"); c.vline(px + 2, 10, 22, "1") }
  outline(c)
})

// barn with gambrel roof + silo
use(R.barn, R.roof, R.paint, R.concrete)
{
  const prims = [
    prism([[-5, 0], [5, 0], [5, 4], [3.4, 6.6], [0, 7.8], [-3.4, 6.6], [-5, 4]], 0, 8, { near: "3", side: "2", roofLit: "C", roofDark: "A", top: "B" }),
    boxP(-9.2, -5.9, 0, 12.6, 2, 2.1, {}),     // silo footprint for sizing only
  ]
  const V = scene3(prims)
  obj("country_barn", V.W, V.H, S, (c) => {
    // silo: lit cylinder with a dome cap and hoops
    const [sx, sy] = V.q(-7.55, 0, 3), r = 1.6 * S, top = sy - 11 * S
    for (let y = Math.round(top); y <= sy; y++) for (let x = Math.round(sx - r); x <= sx + r; x++) { const nx = (x - sx) / r; P(c, x, y, "FGHIJ"[lvl(light(nx, -0.1), x, y)]) }
    for (let y = Math.round(top - r * 0.8); y < top; y++) for (let x = Math.round(sx - r); x <= sx + r; x++) { const nx = (x - sx) / r, ny = (y - top) / (r * 0.8); if (nx * nx + ny * ny <= 1) P(c, x, y, "ABCDE"[lvl(light(nx, ny), x, y)]) }
    for (let y = Math.round(top) + 10; y < sy; y += 16) c.hline(Math.round(sx - r), y, Math.round(2 * r), "G")
    extrude(c, V, prims[0])
    for (let x = -4.75; x < 5; x += 0.5) line3(c, V, [x, 0, 0], [x, x < -3.4 || x > 3.4 ? 4 + (5 - Math.abs(x)) * 1.6 : 6.6 + (3.4 - Math.abs(x)) * 0.35, 0], "2")   // vertical boards
    for (let z = 0.5; z < 8; z += 0.5) line3(c, V, [5, 0, z], [5, 4, z], "1")
    // white trim, big sliding door with X brace, hayloft door
    nearRect(c, V, -1.9, 1.9, 0, 3.4, 0, "2"); line3(c, V, [-1.9, 0, 0], [1.9, 3.4, 0], "J", 2); line3(c, V, [1.9, 0, 0], [-1.9, 3.4, 0], "J", 2)
    for (const [a, b] of [[[-1.9, 0], [-1.9, 3.4]], [[1.9, 0], [1.9, 3.4]], [[-1.9, 3.4], [1.9, 3.4]], [[0, 0], [0, 3.4]]]) line3(c, V, [...a, 0], [...b, 0], "J", 2)
    nearRect(c, V, -0.9, 0.9, 4.6, 6.0, 0, "1"); for (const [a, b] of [[[-0.9, 4.6], [0.9, 4.6]], [[-0.9, 6], [0.9, 6]], [[-0.9, 4.6], [-0.9, 6]], [[0.9, 4.6], [0.9, 6]]]) line3(c, V, [...a, 0], [...b, 0], "J", 2)
    const prof = prims[0].prof; for (let i = 2; i < prof.length; i++) line3(c, V, [...prof[i], 0], [...prof[(i + 1) % prof.length], 0], "J", 2)
    for (const z of [2, 5]) { sideRect(c, V, 5, z, z + 1, 1.8, 2.8, "1"); }
    outline(c)
  })
}

// two-storey clapboard farmhouse with porch and chimney
use(R.paint, R.roof, R.brick, R.wood)
{
  const main = prism([[-4, 0], [4, 0], [4, 6], [0, 9], [-4, 6]], 0, 8, { near: "3", side: "2", roofLit: "C", roofDark: "A", top: "B" })
  const chimney = boxP(1.8, 2.6, 6, 10, 5, 5.8, { near: "H", side: "G", roofLit: "I", roofDark: "G", top: "I" })
  const porch = boxP(-4.3, 4.3, 2.8, 3.1, -2.2, 0, { near: "4", side: "3", roofLit: "C", roofDark: "B", top: "C" })
  const V = scene3([main, chimney, porch])
  obj("country_farmhouse", V.W, V.H, S, (c) => {
    extrude(c, V, main)
    for (let y = 0.25; y < 6; y += 0.25) line3(c, V, [-4, y, 0], [4, y, 0], "2")        // clapboard
    for (let y = 0.25; y < 6; y += 0.25) line3(c, V, [4, y, 0], [4, y, 8], "1")
    const win = (x, y) => { nearRect(c, V, x - 0.45, x + 0.45, y, y + 1.3, 0, "v"); nearRect(c, V, x - 0.4, x + 0.4, y + 0.75, y + 1.25, 0, "e"); line3(c, V, [x - 0.45, y + 0.65, 0], [x + 0.45, y + 0.65, 0], "5"); line3(c, V, [x, y, 0], [x, y + 1.3, 0], "5"); nearRect(c, V, x - 0.85, x - 0.5, y, y + 1.3, 0, "h"); nearRect(c, V, x + 0.5, x + 0.85, y, y + 1.3, 0, "h") }
    win(-2.4, 3.6); win(0, 3.6); win(2.4, 3.6); win(-2.4, 0.9); win(2.4, 0.9)
    nearRect(c, V, -0.5, 0.5, 0, 2.2, 0, "M"); nearRect(c, V, -0.3, 0.3, 1.3, 2.0, 0, "e")
    nearRect(c, V, -0.6, 0.6, 7.2, 8.0, 0, "v")                                          // attic window
    for (const z of [2, 5.5]) { sideRect(c, V, 4, z, z + 0.9, 3.6, 4.9, "v"); sideRect(c, V, 4, z, z + 0.9, 0.9, 2.2, "v") }
    extrude(c, V, chimney)
    extrude(c, V, porch)
    for (const x of [-4.1, -1.4, 1.4, 4.1]) { line3(c, V, [x, 0, -2.1], [x, 2.8, -2.1], "4", 2) }
    line3(c, V, [-4.3, 0.9, -2.1], [4.3, 0.9, -2.1], "4"); for (let x = -4.1; x < 4.2; x += 0.3) line3(c, V, [x, 0.1, -2.1], [x, 0.9, -2.1], "3")   // porch rail + balusters
    outline(c)
  })
}

// farm water-pumping windmill
use(R.steel, R.paint, R.red)
obj("country_windmill", 112, 224, S, (c) => {
  const gy = 223, ty = 66
  const legs = [[18, 50], [94, 62], [36, 54], [76, 58]]
  for (const [bx, tx] of legs) c.line(bx, gy, tx, ty, legs.indexOf([bx, tx]) > 1 ? "2" : "3", 2)
  for (let i = 0; i < 6; i++) {
    const y0 = gy - i * 26, y1 = y0 - 26, f0 = (gy - y0) / (gy - ty), f1 = (gy - y1) / (gy - ty)
    const L0 = 18 + (50 - 18) * f0, R0 = 94 + (62 - 94) * f0, L1 = 18 + (50 - 18) * f1, R1 = 94 + (62 - 94) * f1
    if (y1 < ty) break
    c.line(Math.round(L0), y0, Math.round(R1), y1, "2"); c.line(Math.round(R0), y0, Math.round(L1), y1, "2"); c.line(Math.round(L1), y1, Math.round(R1), y1, "3")
  }
  c.rect(46, ty - 6, 20, 6, "3"); c.hline(46, ty - 6, 20, "5")                              // platform
  c.vline(56, ty, gy - ty, "1")                                                               // pump rod
  poly(c, [62, 40, 104, 30, 106, 52, 64, 48], "C"); c.line(62, 40, 104, 30, "E"); c.line(60, 44, 66, 44, "3", 2)   // tail vane
  const cx = 52, cy = 42
  for (let i = 0; i < 18; i++) {                                                               // fan wheel
    const a = (i / 18) * Math.PI * 2, a2 = a + 0.13
    poly(c, [cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, cx + Math.cos(a2) * 34, cy + Math.sin(a2) * 34], i % 2 ? "4" : "3")
  }
  c.ring(cx, cy, 34, "2"); c.ring(cx, cy, 20, "2"); c.circ(cx, cy, 6, "H"); c.circ(cx - 1, cy - 1, 3, "J")
  outline(c)
})

// wooden telephone pole: crossarms, glass insulators, transformer, wire stubs
use(R.wood, R.steel)
obj("country_telephone_pole", 64, 192, S, (c) => {
  for (let y = 10; y < 192; y++) { const w = 2 + Math.floor((y / 192) * 2); for (let x = 32 - w; x <= 32 + w; x++) P(c, x, y, x < 31 ? "4" : x === 31 ? "3" : x > 33 ? "1" : "2") }
  for (let y = 60; y < 182; y += 9) P(c, y % 2 ? 29 : 35, y, "B")                            // climbing steps
  for (const [y, w] of [[22, 28], [38, 22]]) {
    c.rect(32 - w, y, 2 * w, 4, "3"); c.hline(32 - w, y, 2 * w, "5"); c.hline(32 - w, y + 3, 2 * w, "1")
    for (const dx of [-w + 3, -w / 2, w / 2, w - 3]) { const x = Math.round(32 + dx); c.rect(x - 1, y - 4, 3, 4, "e"); P(c, x - 1, y - 4, "s"); c.line(x, y - 3, dx < 0 ? 0 : 63, y + 2, "x") }
    c.line(30, y + 4, 22, y + 12, "2"); c.line(34, y + 4, 42, y + 12, "2")                   // braces
  }
  c.rect(37, 52, 9, 14, "C"); c.vline(37, 52, 14, "E"); c.vline(45, 52, 14, "A"); c.rect(36, 50, 11, 3, "B")   // transformer can
  outline(c)
})

// ======================= DESERT =======================
// saguaro: ribbed cylinders lit from the left, blue-shadowed right side, spine glints
function cactusLimb(c, x0, y0, x1, y1, r, ramp) {   // vertical capsule from (x0,y0) bottom to y1 top
  for (let y = Math.round(y1 - r); y <= y0; y++) for (let x = Math.round(x0 - r); x <= x0 + r; x++) {
    const dx = x - x0, dy = y < y1 ? y - y1 : 0
    if (dx * dx + dy * dy > r * r) continue
    const nx = dx / r, rib = ((Math.round(dx) + 30) % 3 === 0)
    let l = light(nx, (dy / r) * 0.8) - (rib ? 0.28 : 0)
    if (!rib && ((y * 5 + x) % 9 === 0) && nx < 0.3) l += 0.35
    P(c, x, y, ramp[lvl(l, x, y)])
  }
}
function cactusArm(c, tx, ty, ex, topY, r, ramp) {   // horizontal stub from the trunk, then up
  for (let x = Math.min(tx, ex); x <= Math.max(tx, ex); x++) for (let y = ty - r; y <= ty + r; y++) { const ny = (y - ty) / r; P(c, x, y, ramp[lvl(light(-0.2, ny) - (((y + 30) % 3 === 0) ? 0.25 : 0), x, y)]) }
  cactusLimb(c, ex, ty + r * 0.3, ex, topY, r, ramp)
}
use(R.cactus, R.sand, R.dry, R.red)
obj("desert_cactus_large", 80, 160, S, (c) => {
  cactusArm(c, 40, 90, 16, 50, 7, RA); cactusArm(c, 40, 74, 64, 40, 6, RA)
  cactusLimb(c, 40, 159, 40, 14, 10, RA)
  for (const [x, y] of [[38, 4], [42, 5], [16, 43], [64, 34]]) { c.rect(x - 1, y, 3, 2, "w"); P(c, x, y + 2, "y") }   // blossoms
  outline(c)
})
obj("desert_cactus_small", 40, 48, S, (c) => {   // prickly pear pads
  for (const [x, y, rx, ry] of [[20, 36, 10, 11], [10, 26, 7, 9], [29, 22, 7, 9], [20, 13, 6, 8]]) {
    for (let yy = y - ry; yy <= y + ry; yy++) for (let xx = x - rx; xx <= x + rx; xx++) { const nx = (xx - x) / rx, ny = (yy - y) / ry; if (nx * nx + ny * ny <= 1) P(c, xx, yy, RA[lvl(light(nx, ny) + (((xx * 3 + yy * 7) % 13 === 0) ? 0.5 : 0), xx, yy)]) }
  }
  for (const [x, y] of [[8, 17], [12, 17], [27, 13], [31, 14], [19, 5]]) { c.rect(x, y, 2, 2, "I"); P(c, x, y, "J") }   // fruit
  outline(c)
})
obj("desert_rock", 176, 112, S, (c) => {   // red sandstone formation with strata
  rock(c, 92, 111, 72, 96, 41, RB, { facets: 6, strata: 7, cracks: 4, squash: (t) => (t > 0.25 && t < 0.75 ? 1.05 : 0.8) })
  rock(c, 36, 111, 32, 46, 19, RB, { facets: 5, strata: 7, cracks: 1 })
  rock(c, 150, 111, 22, 24, 5, RB, { strata: 7, cracks: 0 })
  rim(c, "CDE", "E"); outline(c)
})
obj("desert_bush", 56, 32, S, (c) => {   // dry sagebrush: twigs and sparse grey-olive clumps
  for (const [x1, y1] of [[10, 10], [20, 4], [30, 2], [42, 8], [50, 14], [26, 12]]) c.line(28, 31, x1, y1 + 4, "G")
  canopy(c, 28, 19, 25, 11, 22, 13, RC, 4, 7)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 56; x++) if (c.is(x, y, RC) && ((x * 7 + y * 11) % 5 === 0)) c.px(x, y, "G")   // see-through gaps
  outline(c)
})

// distant mesas (tileable): flat caps, sheer cliffs, talus aprons, blue shadow faces, strata
use(R.mesa, R.sand)
obj("desert_mesa", 960, 160, null, (c) => {
  const W = 960, mesas = [[120, 70, 92], [330, 40, 64], [430, 22, 110], [610, 95, 80], [800, 30, 120], [880, 18, 70]]
  const H = (x) => {
    let h = 18 + Math.sin((x / W) * Math.PI * 6) * 3
    for (const [mx, hw, mh] of mesas) for (const o of [-W, 0, W]) {
      const d = Math.abs(x - mx - o)
      if (d < hw) h = Math.max(h, mh)
      else if (d < hw + 3) h = Math.max(h, mh - (d - hw) * 4)
      else if (d < hw + 3 + mh * 0.7) h = Math.max(h, (mh - 12) * 0.55 * (1 - (d - hw - 3) / (mh * 0.7)))
    }
    return h
  }
  for (let x = 0; x < W; x++) {
    const top = Math.round(c.h - H(x))
    for (let y = top; y < c.h; y++) {
      const slope = H(x + 1) - H(x - 1), depth = y - top
      let l = slope > 1 ? 0.6 : slope < -1 ? -0.7 : depth < 3 ? 0.7 : 0.15
      if (Math.abs(slope) <= 1 && depth >= 3) { const left = H(x - 6) < H(x) - 8, right = H(x + 6) < H(x) - 8; l = left ? 0.45 : right ? -0.6 : 0.1 }
      l += ((Math.floor((y + Math.sin((x * 2 * Math.PI * 6) / W) * 2) / 6) & 1) ? -0.15 : 0)
      l += Math.max(0, (y - (c.h - 26)) / 26) * 0.5
      c.px(x, y, RA[lvl(l, x, y)])
    }
  }
}, "background")

// billboard with abstract 80s sunset artwork (no lettering)
use(R.wood, R.steel, R.orange, R.red)
obj("desert_billboard", 224, 176, S, (c) => {
  for (const x of [40, 112, 184]) { c.rect(x - 3, 82, 7, 94, "3"); c.vline(x - 3, 82, 94, "4"); c.vline(x + 3, 82, 94, "1") }
  c.line(40, 150, 112, 100, "2", 2); c.line(112, 150, 184, 100, "2", 2)
  c.rect(10, 78, 204, 4, "C"); c.hline(10, 78, 204, "E")
  c.rect(14, 6, 196, 72, "B"); c.rect(16, 8, 192, 68, "x")
  const bands = ["#2a1450", "#5a1e6a", "#a02a6a", "#e0485a", "#f07a3a", "#ffb030"]
  for (let y = 8; y < 62; y++) { const t = (y - 8) / 54, i = Math.min(5, Math.floor(t * 6 + ((y & 1) ? 0.15 : 0))); c.hline(16, y, 192, bands[i]) }
  c.circ(150, 56, 22, "#ffd860"); for (let y = 42; y < 62; y += 4) c.hline(126, y, 48, bands[3])
  c.rect(16, 62, 192, 14, "#1a0c28")
  for (let x = 16; x < 208; x += 12) c.line(x, 62, 112 + (x - 112) * 1.6, 75, "#3a1a50")
  c.hline(16, 66, 192, "#3a1a50"); c.hline(16, 71, 192, "#3a1a50")
  poly(c, [40, 70, 56, 62, 86, 59, 100, 64, 112, 66, 112, 71, 40, 71], "x"); c.line(58, 62, 84, 60, "#ff6ad8")
  c.circ(52, 71, 4, "x"); c.circ(102, 71, 4, "x")
  for (const x of [40, 112, 184]) { c.rect(x - 4, 2, 8, 4, "B"); c.hline(x - 3, 5, 6, "l") }
  outline(c)
})

// retro gas station: service bays + office, canopy over pumps, tall pole sign (no lettering)
use(R.paint, R.orange, R.steel, R.concrete)
{
  const bld = boxP(-12, -3, 0, 3.6, 3, 10, { near: "3", side: "2", roofLit: "4", roofDark: "3", top: "4" })
  const band = boxP(-12.1, -2.9, 3.6, 4.4, 2.9, 10.1, { near: "D", side: "C", roofLit: "E", roofDark: "D", top: "E" })
  const canopyB = boxP(-1.5, 9, 4.4, 5.1, 0.5, 6.5, { near: "D", side: "C", roofLit: "4", roofDark: "3", top: "4" })
  const island = boxP(0, 8, 0, 0.2, 2.6, 4.2, { near: "M", side: "L", roofLit: "O", roofDark: "N", top: "O" })
  const pole = boxP(10, 12.4, 0, 11.2, 2, 2.4, {})
  const V = scene3([bld, band, canopyB, island, pole])
  obj("desert_gas_station", V.W, V.H, S, (c) => {
    extrude(c, V, bld); extrude(c, V, band)
    for (const x of [-11.4, -8.4]) { nearRect(c, V, x, x + 2.6, 0, 3.0, 3, "H"); for (let y = 0.5; y < 3; y += 0.5) line3(c, V, [x, y, 3], [x + 2.6, y, 3], "G"); nearRect(c, V, x + 0.3, x + 2.3, 1.9, 2.4, 3, "v") }
    nearRect(c, V, -5.5, -3.4, 0.9, 3.0, 3, "v"); nearRect(c, V, -5.3, -3.6, 2.3, 2.9, 3, "e"); nearRect(c, V, -5.4, -5.2, 0, 3, 3, "3")
    line3(c, V, [-12.1, 4.0, 2.9], [-2.9, 4.0, 2.9], "B", 2)
    extrude(c, V, island)
    for (const x of [-1.2, 8.7]) for (const z of [1.2, 5.8]) line3(c, V, [x, 0, z], [x, 4.4, z], "J", 2)
    for (const x of [1.5, 5.0]) {
      const p = boxP(x, x + 0.8, 0.2, 1.8, 3.1, 3.7, { near: "C", side: "B", roofLit: "D", roofDark: "C", top: "D" })
      extrude(c, V, p); nearRect(c, V, x + 0.15, x + 0.65, 1.1, 1.5, 3.1, "l"); line3(c, V, [x + 0.8, 1.2, 3.1], [x + 1.0, 0.4, 3.0], "x")
    }
    extrude(c, V, canopyB); line3(c, V, [-1.5, 4.7, 0.5], [9, 4.7, 0.5], "E")
    for (let x = -1.2; x < 9; x += 1.5) nearRect(c, V, x, x + 0.6, 4.25, 4.4, 0.5, "l")
    line3(c, V, [11.2, 0, 2.2], [11.2, 9.5, 2.2], "J", 3)
    const [sx, sy] = V.q(11.2, 9.6, 2.2), X = Math.round(sx), Y = Math.round(sy)
    c.circ(X, Y, 20, "x"); c.circ(X, Y, 18, "4"); c.circ(X, Y, 13, "D")
    c.rect(X - 18, Y - 3, 37, 6, "w"); c.hline(X - 18, Y, 37, "B")
    outline(c)
  })
}

use(R.wood, R.rust)
obj("desert_guardrail", 128, 24, S, (c) => { guardrail(c, RB, RA, { woodPost: true, rust: "A" }); outline(c) })

// ======================= COASTAL =======================
// palm: curved ringed trunk, drooping feathered fronds, coconuts
use(R.palm, R.palmTrunk, R.wood)
function palm(c, bx, by, tx, ty, seed) {
  const N = 80
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = bx + (tx - bx) * t + Math.sin(t * Math.PI) * 14, y = by + (ty - by) * t, w = 5 - t * 2
    for (let dx = -w; dx <= w; dx++) { const nx = dx / w, ring = (Math.round(y) % 6 === 0); P(c, x + dx, y, RB[lvl(light(nx, 0) - (ring ? 0.2 : 0), Math.round(x + dx), Math.round(y))]) }
  }
  const Rn = rng(seed)
  const fronds = [-10, -160, -170, -150, -125, -100, -70, -45, -20, 0, 160, 195].map((a) => (a * Math.PI) / 180)
  fronds.forEach((a, j) => {
    const len = 66 + Rn() * 20, lift = a < -0.3 && a > -2.8 ? -0.6 : 0.15, dark = j < 2 ? 0.35 : 0
    let px = tx, py = ty
    for (let s = 1; s <= 30; s++) {
      const t = s / 30, x = tx + Math.cos(a) * len * t, y = ty + Math.sin(a) * len * t * 0.55 + (lift + t * 1.4) * len * t * 0.5
      const ll = (1 - t) * 13 + 3, perp = Math.atan2(y - py, x - px) + Math.PI / 2
      for (const sgn of [1, -1]) {
        const ex = x + Math.cos(perp) * ll * sgn * 0.6, ey = y + Math.abs(Math.sin(perp)) * ll * 0.4 + ll * 0.55
        c.line(Math.round(x), Math.round(y), Math.round(ex), Math.round(ey), RA[lvl((sgn < 0 ? 0.55 : 0.05) - dark + (t < 0.5 ? 0.15 : -0.1), s, j)])
      }
      c.line(Math.round(px), Math.round(py), Math.round(x), Math.round(y), RA[dark ? 1 : 2])
      px = x; py = y
    }
  })
  for (const [dx, dy] of [[-4, 4], [2, 6], [6, 3], [-1, 9]]) { c.circ(tx + dx, ty + dy, 3, "B"); P(c, tx + dx - 1, ty + dy - 1, "D") }
}
obj("coastal_palm_tree", 192, 224, S, (c) => { palm(c, 90, 223, 104, 48, 4); outline(c) })

// ocean layer (tileable): hazy horizon to deep blue foreground, wave strokes grow with distance, glints
use(R.ocean)
obj("coastal_ocean_background", 960, 160, null, (c) => {
  for (let y = 0; y < c.h; y++) {
    const t = y / (c.h - 1), base = 4 - t * 3.6
    for (let x = 0; x < c.w; x++) { const i = Math.floor(base + (((x + y) & 1) ? 0.5 : 0)); c.px(x, y, RA[Math.max(0, Math.min(4, i))]) }
  }
  for (let y = 2; y < c.h; y += 2 + Math.floor((y / c.h) * 6)) {
    const t = y / c.h, len = 3 + Math.round(t * 22), gap = 24 + Math.round(t * 40), n = Math.floor(c.w / gap)
    for (let i = 0; i < n; i++) {
      const x0 = Math.round(i * (c.w / n) + Math.sin(y * 1.7 + i * 2.1) * gap * 0.4)
      for (let k = 0; k < len; k++) { const x = (((x0 + k) % c.w) + c.w) % c.w; c.px(x, y, RA[Math.min(4, Math.round(4 - t * 3.6) + 1)]); if (y + 1 < c.h) c.px(x, y + 1, RA[Math.max(0, Math.round(4 - t * 3.6) - 1)]) }
    }
  }
  c.hline(0, 0, c.w, "5")
  for (let i = 0; i < 120; i++) { const x = (i * 8 + ((i * 37) % 8)) % c.w, y = 1 + ((i * 29) % 36); c.px(x, y, "w") }
}, "background")

use(R.granite, R.grass, R.ocean)
obj("coastal_cliff", 224, 160, S, (c) => {
  poly(c, [0, 159, 0, 40, 30, 22, 80, 14, 130, 20, 170, 40, 190, 70, 206, 110, 223, 140, 223, 159], "Z")
  shadeFill(c, RA, (x, y) => { const a = Math.round(Math.atan2(y - 120, x - 90) / 0.8) * 0.8, t = Math.min(1, Math.hypot((x - 90) / 130, (y - 120) / 110)); return [Math.cos(a) * t, Math.sin(a) * t, ((Math.floor((y + Math.sin(x * 0.08) * 4) / 9) & 1) ? -0.12 : 0)] })
  for (let x = 0; x < 224; x++) {
    let y = 0; while (y < 160 && !c.is(x, y, RA)) y++
    const d = 3 + ((x * 7) % 5)
    for (let k = 0; k < d && y + k < 160; k++) if (c.is(x, y + k, RA)) c.px(x, y + k, RB[k === 0 ? 4 : k < 2 ? 3 : 2])
    for (let k = d; k < d + 3 && y + k < 160; k++) if (c.is(x, y + k, RA) && ((x + k) % 3 === 0)) c.px(x, y + k, RB[1])
  }
  for (let x = 120; x < 224; x++) for (let y = 150; y < 160; y++) if (c.is(x, y, "*") && ((x * 3 + y * 5) % 4 === 0)) c.px(x, y, ((x + y) & 1) ? "w" : "s")
  outline(c)
})

use(R.steel, R.wood)
obj("coastal_guardrail", 128, 24, S, (c) => { guardrail(c, RB, RB, { timber: true, woodPost: true }); outline(c) })

// distant lighthouse (drawn at 8 px/m): banded tower, gallery, glowing lantern, cottage, rock base
use(R.paint, R.red, R.granite, R.roof)
obj("coastal_lighthouse", 96, 192, 8, (c) => {
  rock(c, 48, 191, 46, 26, 12, RC, { cracks: 1 })
  c.rect(58, 156, 30, 18, "3"); poly(c, [56, 157, 73, 146, 90, 157], "B"); c.rect(64, 162, 6, 6, "v"); c.rect(76, 162, 6, 6, "v")
  const top = 46, bot = 172
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / (bot - top), hw = 8 + t * 7, band = Math.floor(t * 6) % 2
    for (let x = Math.round(48 - hw); x <= 48 + hw; x++) P(c, x, y, (band ? RB : RA)[lvl(light((x - 48) / hw, 0), x, y)])
  }
  for (const y of [70, 100, 130]) c.rect(46, y, 4, 6, "v")
  c.rect(36, 40, 25, 4, "1"); c.hline(36, 40, 25, "3"); for (let x = 37; x < 60; x += 3) c.vline(x, 36, 4, "1")
  c.rect(41, 24, 15, 12, "v"); c.rect(43, 26, 11, 8, "l"); c.rect(46, 27, 5, 6, "w"); c.vline(48, 24, 12, "1")
  poly(c, [39, 24, 48, 14, 58, 24], "B"); c.line(48, 14, 48, 9, "1"); P(c, 48, 8, "C")
  outline(c)
})

// ======================= ROAD INFRASTRUCTURE (16 px/m) =======================
use(R.steel, R.steel)
obj("road_guardrail", 128, 24, S, (c) => { guardrail(c, RA, RA, { reflector: "y" }); outline(c) })

// jersey barrier seen along the road (end profile + length receding)
use(R.concrete)
{
  const prof = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.13, 0.33], [0.1, 0.81], [-0.1, 0.81], [-0.13, 0.33], [-0.3, 0.08]]
  const p = prism(prof, 0, 4, { near: "3", side: "2", roofLit: "4", roofDark: "2", top: "5" })
  const V = scene3([p])
  obj("road_concrete_barrier", V.W, V.H, S, (c) => {
    extrude(c, V, p)
    for (let i = 1; i < prof.length; i++) line3(c, V, [...prof[i], 0], [...prof[(i + 1) % prof.length], 0], "4")
    sideRect(c, V, 0.3, 0, 4, 0, 0.08, "1")                                          // road grime at the foot
    for (const z of [1.33, 2.66]) line3(c, V, [0.3, 0, z], [0.3, 0.08, z], "1")      // pour joints
    for (const z of [1.33, 2.66]) line3(c, V, [0.13, 0.33, z], [0.1, 0.81, z], "1")
    nearRect(c, V, -0.07, 0.07, 0.5, 0.6, 0, "y")                                    // reflector
    outline(c)
  })
}

// highway overpass seen head-on (single span; the road passes under the transparent gap)
use(R.concrete, R.steel)
obj("road_bridge", 512, 160, S, (c) => {
  for (const s of [1, -1]) {                                                         // abutments with sloped faces
    const X = (x) => (s > 0 ? x : 511 - x)
    poly(c, [X(0), 70, X(60), 70, X(44), 159, X(0), 159], "3")
    for (let y = 80; y < 159; y += 8) c.line(X(0), y, X(Math.round(60 - (y - 70) * 0.18)), y, "2")
    c.line(X(60), 70, X(44), 159, s > 0 ? "5" : "1")
  }
  c.rect(0, 50, 512, 22, "4"); c.hline(0, 50, 512, "5"); c.rect(0, 66, 512, 6, "3"); c.hline(0, 71, 512, "2")   // girder face
  for (let x = 0; x < 512; x += 128) c.vline(x, 50, 22, "2")                                                      // expansion joints
  c.rect(0, 72, 512, 7, "1"); for (let x = 0; x < 512; x += 2) P(c, x, 79, "1")                                  // soffit in shadow
  c.rect(0, 38, 512, 12, "4"); c.hline(0, 38, 512, "5"); c.hline(0, 49, 512, "2")                                // parapet
  c.hline(0, 30, 512, "D"); c.hline(0, 31, 512, "B"); for (let x = 4; x < 512; x += 16) c.rect(x, 30, 2, 8, "B")   // steel rail
  for (let x = 10; x < 512; x += 40) { c.rect(x, 54, 4, 2, "2") }                                                 // drain weeps
  for (let x = 6; x < 512; x += 3) if ((x * 7) % 11 < 4) c.vline(x, 56 + ((x * 3) % 6), 3 + ((x * 5) % 4), "2")   // rain-stain streaks under the drains
  outline(c)
})

// concrete tunnel portal with blank name panel and ceiling lights
use(R.concrete, R.steel)
obj("road_tunnel", 320, 208, S, (c) => {
  poly(c, [0, 207, 0, 40, 20, 16, 300, 16, 319, 40, 319, 207], "3")
  c.rect(20, 16, 280, 10, "4"); c.hline(20, 16, 280, "5"); c.hline(20, 25, 280, "2")
  for (let x = 40; x < 300; x += 40) c.vline(x, 26, 181, "2")
  for (const y of [70, 130]) c.hline(0, y, 320, "2")
  c.line(0, 40, 20, 16, "5"); c.line(300, 16, 319, 40, "1")
  for (let y = 26; y < 207; y++) for (let x = 0; x < 320; x++) if (c.is(x, y, "3") && y > 180 && ((x + y) & 1)) c.px(x, y, "2")   // splash grime at the base
  tunnelMouth(c, 160, 207, 112, 54, 120)
  for (let y = 0; y < 208; y++) for (let x = 40; x < 280; x++) {                     // portal ring
    const dx = (x - 160) / 118, top = 207 - 120, inRing = Math.abs(dx) <= 1 && (y >= top || ((y - top) / 60) ** 2 + dx * dx <= 1)
    const dx2 = (x - 160) / 112, inOpen = Math.abs(dx2) <= 1 && (y >= top || ((y - top) / 54) ** 2 + dx2 * dx2 <= 1)
    if (inRing && !inOpen) c.px(x, y, y < top ? "5" : "4")
  }
  c.rect(110, 30, 100, 16, "h"); c.rect(112, 32, 96, 12, "g"); c.hline(112, 32, 96, "w")     // blank name panel
  for (const x of [52, 268]) { c.rect(x - 4, 40, 8, 6, "B"); c.rect(x - 3, 45, 6, 2, "l") }   // portal lamps
  outline(c)
})

// toll booth with canopy, hazard-striped island and barrier arm
use(R.paint, R.steel, R.concrete, R.orange)
{
  const island = boxP(-1.8, 1.8, 0, 0.25, -1.2, 4.2, { near: "y", side: "H", roofLit: "J", roofDark: "I", top: "J" })
  const booth = boxP(-1.1, 1.1, 0.25, 2.9, 0, 3, { near: "3", side: "2", roofLit: "4", roofDark: "3", top: "4" })
  const roof = boxP(-1.3, 1.3, 2.9, 3.1, -0.1, 3.1, { near: "B", side: "A", roofLit: "C", roofDark: "B", top: "C" })
  const canopyT = boxP(-4.2, 4.2, 4.2, 4.8, -0.8, 3.8, { near: "N", side: "M", roofLit: "4", roofDark: "3", top: "4" })
  const V = scene3([island, booth, roof, canopyT, boxP(1.1, 4.8, 0.9, 1.1, 0.1, 0.2, {})])
  obj("road_toll_booth", V.W, V.H, S, (c) => {
    for (const x of [-3.8, 3.8]) line3(c, V, [x, 0, 3.4], [x, 4.2, 3.4], "C", 3)
    extrude(c, V, island)
    for (let x = -1.8; x < 1.8; x += 0.4) poly(c, [...V.q(x, 0, -1.2), ...V.q(x + 0.2, 0, -1.2), ...V.q(x + 0.35, 0.25, -1.2), ...V.q(x + 0.15, 0.25, -1.2)], "x")   // hazard stripes
    extrude(c, V, booth)
    nearRect(c, V, -0.95, 0.95, 1.2, 2.5, 0, "v"); nearRect(c, V, -0.9, 0.2, 2.0, 2.45, 0, "e"); line3(c, V, [0, 1.2, 0], [0, 2.5, 0], "3")
    sideRect(c, V, 1.1, 0.4, 2.6, 1.2, 2.5, "v"); sideRect(c, V, 1.1, 0.5, 1.4, 2.0, 2.45, "e")
    nearRect(c, V, -1.1, 1.1, 0.25, 0.45, 0, "2")
    extrude(c, V, roof)
    for (let x = 1.1, i = 0; x < 4.8; x += 0.35, i++) nearRect(c, V, x, x + 0.35, 0.9, 1.1, 0.15, i % 2 ? "w" : "r")   // barrier arm
    nearRect(c, V, 1.0, 1.25, 0.6, 1.2, 0.15, "B")
    extrude(c, V, canopyT); line3(c, V, [-4.2, 4.5, -0.8], [4.2, 4.5, -0.8], "L", 2)
    nearRect(c, V, -0.3, 0.3, 4.25, 4.75, -0.8, "x"); nearRect(c, V, -0.2, 0.2, 4.35, 4.65, -0.8, "#3ddc6a")   // lane signal (green)
    outline(c)
  })
}

// cobra-head highway streetlight
use(R.steel)
obj("road_lamppost", 112, 192, S, (c) => {
  c.rect(8, 186, 14, 6, "2"); c.hline(8, 186, 14, "4")
  for (let y = 24; y < 187; y++) { const w = y > 120 ? 3 : 2; for (let x = 15 - w; x <= 15 + w; x++) P(c, x, y, x < 15 ? "4" : x === 15 ? "3" : "2") }
  let px = 15, py = 24
  for (let i = 1; i <= 30; i++) { const t = i / 30, x = 15 + t * 70, y = 24 - Math.sin(t * Math.PI * 0.5) * 12 + t * t * 2; c.line(Math.round(px), Math.round(py), Math.round(x), Math.round(y), "3", 3); c.line(Math.round(px), Math.round(py) - 1, Math.round(x), Math.round(y) - 1, "4"); px = x; py = y }
  poly(c, [78, 12, 100, 10, 108, 14, 104, 20, 84, 20, 78, 16], "3"); c.line(80, 12, 100, 10, "5"); c.line(84, 19, 104, 19, "1")
  c.rect(86, 20, 16, 2, "l"); c.hline(88, 22, 12, "w")
  outline(c)
})

// ======================= ROAD SIGNS (64 px/m, 128x192, sign face front-on) =======================
use(R.steel)
const post = (c, x, y0) => { c.rect(x, y0, 4, 192 - y0, "3"); c.vline(x, y0, 192 - y0, "4"); c.vline(x + 3, y0, 192 - y0, "2"); for (let y = y0 + 6; y < 190; y += 8) P(c, x + 1, y, "1") }   // perforated U-channel
function panel(c, x, y, w, h, bg, fg) {
  c.rect(x, y, w, h, fg); c.rect(x + 2, y + 2, w - 4, h - 4, bg)
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) c.px(cx, cy, "_")   // rounded corners
  c.rect(x + 3, y + 3, w - 6, h - 6, fg); c.rect(x + 4, y + 4, w - 8, h - 8, bg)                                  // inset border line
}
function diamond(c, cx, cy, r) { poly(c, [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], "x"); poly(c, [cx, cy - r + 2, cx + r - 2, cy, cx, cy + r - 2, cx - r + 2, cy], "y"); poly(c, [cx, cy - r + 4, cx + r - 4, cy, cx, cy + r - 4, cx - r + 4, cy], "x"); poly(c, [cx, cy - r + 5, cx + r - 5, cy, cx, cy + r - 5, cx - r + 5, cy], "y") }
const T = (c, x, y, s, col, scale = 1) => c.text(x, y, s, col, { scale, align: "c" })

for (const v of ["55", "65", "75"]) {
  obj(v === "55" ? "sign_speed_limit" : "sign_speed_limit_" + v, 128, 192, SIGN, (c) => {
    post(c, 62, 56)
    panel(c, 42, 6, 44, 54, "w", "x")
    T(c, 64, 13, "SPEED", "x"); T(c, 64, 21, "LIMIT", "x"); T(c, 64, 31, v, "x", 4)
    outline(c)
  })
}
obj("sign_warning_curve", 128, 192, SIGN, (c) => {
  post(c, 62, 70); diamond(c, 64, 40, 34)
  c.line(58, 60, 58, 33, "x", 5); c.line(58, 32, 70, 32, "x", 5); poly(c, [70, 24, 80, 32, 70, 40], "x")
  outline(c)
})
obj("sign_warning_grade", 128, 192, SIGN, (c) => {
  post(c, 62, 70); diamond(c, 64, 40, 34)
  poly(c, [44, 46, 84, 56, 44, 56], "x")                                                                  // incline
  poly(c, [47, 34, 61, 37, 60, 45, 46, 42], "x"); poly(c, [62, 37, 70, 39, 69, 47, 61, 45], "x"); poly(c, [64, 38, 68, 39, 67, 42, 63, 41], "y")   // truck
  for (const [x, y] of [[50, 45], [57, 47], [66, 49]]) { c.circ(x, y, 2, "y"); c.circ(x, y, 1, "x") }
  outline(c)
})
obj("sign_warning_mountain_pass", 128, 192, SIGN, (c) => {
  post(c, 62, 70); diamond(c, 64, 40, 34)
  poly(c, [48, 56, 58, 30, 65, 42, 73, 26, 80, 56], "x")
  poly(c, [55, 36, 58, 30, 61, 36], "y"); poly(c, [70, 32, 73, 26, 76, 32], "y")                         // snow caps
  c.line(62, 56, 70, 50, "y"); c.line(70, 50, 62, 46, "y"); c.line(62, 46, 68, 42, "y")                   // switchback road
  panel(c, 34, 78, 60, 24, "y", "x")
  T(c, 64, 83, "MOUNTAIN", "x"); T(c, 64, 92, "PASS", "x")
  outline(c)
})
obj("sign_exit", 128, 192, SIGN, (c) => {
  post(c, 28, 52); post(c, 96, 52)
  panel(c, 10, 6, 108, 50, "g", "w")
  T(c, 52, 21, "EXIT", "w", 4)
  c.line(86, 42, 104, 24, "w", 4); poly(c, [94, 20, 108, 18, 106, 32], "w")
  outline(c)
})
obj("sign_rest_area", 128, 192, SIGN, (c) => {
  post(c, 28, 56); post(c, 96, 56)
  panel(c, 10, 6, 108, 54, "b", "w")
  T(c, 50, 14, "REST", "w", 3); T(c, 50, 36, "AREA", "w", 3)
  c.rect(84, 30, 14, 5, "w"); poly(c, [96, 24, 108, 32, 96, 40], "w")
  outline(c)
})
obj("sign_fuel", 128, 192, SIGN, (c) => {
  post(c, 62, 56)
  panel(c, 38, 6, 52, 54, "b", "w")
  c.rect(52, 16, 16, 30, "w"); c.rect(54, 19, 12, 8, "b"); c.rect(49, 44, 22, 4, "w")                    // pump body, display, base
  c.line(68, 22, 76, 24, "w", 2); c.line(76, 24, 76, 40, "w", 2); c.line(76, 40, 72, 42, "w", 2); c.rect(73, 17, 4, 6, "w")   // hose + nozzle
  outline(c)
})
obj("coastal_road_sign", 128, 192, SIGN, (c) => {   // winding road warning
  post(c, 62, 70); diamond(c, 64, 40, 34)
  c.line(60, 60, 60, 52, "x", 4); c.line(60, 52, 70, 45, "x", 4); c.line(70, 45, 58, 36, "x", 4); c.line(58, 36, 64, 30, "x", 4)
  poly(c, [57, 30, 66, 20, 71, 31], "x")
  outline(c)
})
obj("road_mile_marker", 32, 112, SIGN, (c) => {
  c.rect(14, 46, 4, 66, "3"); c.vline(14, 46, 66, "4")
  panel(c, 4, 2, 24, 46, "g", "w")
  T(c, 16, 9, "MILE", "w"); T(c, 16, 22, "87", "w", 2)
  outline(c)
})

// ======================= ROADSIDE DETAIL (small ground cover and set dressing, 16 px/m) =======================
// Grass-like blades fanning from the bottom centre; `headKey` adds a seed head / flower on the longest ones.
function tuft(c, ramp, seed, blades, spread = 0.7, lenMin = 0.45, headKey = null) {
  const Rn = rng(seed)
  for (let i = 0; i < blades; i++) {
    const x0 = c.w / 2 + (Rn() - 0.5) * c.w * spread, ang = (Rn() - 0.5) * 1.3 * (0.4 + Math.abs(x0 - c.w / 2) / c.w)
    const len = c.h * (lenMin + Rn() * (0.95 - lenMin)), x1 = x0 + Math.sin(ang) * len, y1 = c.h - 1 - Math.cos(ang) * len
    c.line(Math.round(x0), c.h - 1, Math.round(x1), Math.round(y1), ramp[1 + Math.floor(Rn() * 4)])
    if (headKey && len > c.h * 0.7) { P(c, x1, y1, headKey); P(c, x1 + 1, y1, headKey); P(c, x1, y1 - 1, headKey) }
  }
}
// short cylinder lying on its side (log / bale) shaded top-lit across rows
function barrel(c, x0, x1, y0, y1, ramp, seed) {
  const Rn = rng(seed), cy = (y0 + y1) / 2, ry = (y1 - y0) / 2
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ny = (y - cy) / ry
    P(c, x, y, ramp[lvl(light(0.1, ny) + (Rn() < 0.12 ? -0.25 : 0), x, y)])
  }
}
// ellipse top of a stump / log end
function disc(c, cx, cy, rx, ry, key) {
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) P(c, x, y, key)
}

use(R.grass, R.wood, R.dry)
obj("scenery_grass_tuft", 40, 24, S, (c) => { tuft(c, RA, 3, 26); outline(c, "1") })
obj("scenery_wildflowers", 56, 30, S, (c) => {
  tuft(c, RA, 7, 22, 0.8, 0.4)
  const Rn = rng(11)
  for (let i = 0; i < 9; i++) {
    const x = Math.round(6 + Rn() * 44), y = Math.round(4 + Rn() * 18), k = ["w", "y", "r", "w"][i % 4]
    c.line(x, y + 3, x, 28, "2"); P(c, x, y, k); P(c, x - 1, y, k); P(c, x + 1, y, k); P(c, x, y - 1, k); P(c, x, y + 1, "y")
  }
  outline(c, "1")
})
obj("scenery_log", 104, 34, S, (c) => {
  barrel(c, 8, 98, 8, 31, RB, 5)
  for (let x = 14; x < 96; x += 7) c.vline(x + (x % 3), 10, 20, "B")                       // bark furrows
  for (let x = 20; x < 90; x += 17) c.rect(x, 7, 9, 3, "F")                               // moss patches
  disc(c, 8, 19, 5, 12, "E"); disc(c, 8, 19, 3, 8, "D"); disc(c, 8, 19, 1, 3, "C")       // cut end with rings
  outline(c)
})
obj("forest_fern", 64, 44, S, (c) => {
  const Rn = rng(9)
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.28, L = 28 + Rn() * 12, ex = 32 + Math.cos(a) * L, ey = 43 + Math.sin(a) * L * 0.95
    c.line(32, 43, Math.round(ex), Math.round(ey), "2")
    for (let t = 0.25; t < 1; t += 0.11) {
      const bx = 32 + (ex - 32) * t, by = 43 + (ey - 43) * t, w = 7 * (1 - t * 0.6), k = t > 0.6 ? "4" : "3"
      c.line(Math.round(bx), Math.round(by), Math.round(bx - w), Math.round(by + w * 0.4), k); c.line(Math.round(bx), Math.round(by), Math.round(bx + w), Math.round(by + w * 0.4), k)
    }
  }
  outline(c)
})
obj("forest_stump", 40, 36, S, (c) => {
  barrel(c, 6, 33, 12, 35, RB, 2)
  for (let x = 8; x < 32; x += 4) c.vline(x, 18, 15, "B")
  disc(c, 19, 12, 14, 6, "E"); disc(c, 19, 12, 10, 4, "D"); disc(c, 19, 12, 5, 2, "C"); disc(c, 19, 12, 2, 1, "B")
  outline(c)
})

use(R.dry, R.cactus, R.sand)
obj("desert_dry_grass", 44, 26, S, (c) => { tuft(c, RA, 4, 22, 0.7, 0.5, "5"); outline(c, "1") })
obj("desert_tumbleweed", 40, 36, S, (c) => {
  const Rn = rng(6)
  for (let i = 0; i < 22; i++) {
    const a = Rn() * 6.28, b = a + 2 + Rn() * 2
    c.line(Math.round(20 + Math.cos(a) * 15), Math.round(18 + Math.sin(a) * 14), Math.round(20 + Math.cos(b) * 15), Math.round(18 + Math.sin(b) * 14), RA[1 + (i % 4)])
  }
  outline(c)
})
obj("desert_joshua_tree", 96, 160, S, (c) => {
  const Rn = rng(12)
  const spike = (x, y, r) => {
    for (let k = 0; k < 14; k++) { const a = -Math.PI / 2 + (k - 6.5) * 0.4, L = r * (0.8 + Rn() * 0.5); c.line(x, y, Math.round(x + Math.cos(a) * L), Math.round(y + Math.sin(a) * L), "BCDE"[k % 4]) }
    c.rect(x - 2, y - 2, 5, 5, "C")
  }
  const limb = (x0, y0, x1, y1, w) => { c.line(x0, y0, x1, y1, "3", w); c.line(x0 - 1, y0, x1 - 1, y1, "4"); c.line(x0 + w - 1, y0, x1 + w - 1, y1, "2") }
  limb(46, 159, 46, 90, 6)
  limb(46, 100, 22, 66, 4); limb(46, 90, 70, 56, 4); limb(46, 90, 48, 52, 4); limb(22, 66, 12, 46, 3); limb(70, 56, 80, 36, 3)
  for (const [x, y, r] of [[12, 44, 12], [22, 62, 9], [80, 34, 12], [70, 52, 9], [48, 48, 13], [32, 80, 8]]) spike(x, y, r)
  outline(c)
})
obj("desert_rock_small", 72, 40, S, (c) => { rock(c, 36, 39, 33, 28, 21, RC, { strata: 6, cracks: 2 }); outline(c) })

use(R.dry, R.palm, R.sand, R.rock)
obj("coastal_dune_grass", 48, 42, S, (c) => { tuft(c, RA, 8, 30, 0.6, 0.55); tuft(c, RB, 9, 12, 0.5, 0.4); outline(c, "1") })
obj("coastal_beach_umbrella", 96, 104, S, (c) => {
  c.rect(47, 22, 3, 82, "3"); c.vline(47, 22, 82, "4")
  const cx = 48, cy = 30, R0 = 38
  for (let x = cx - R0; x <= cx + R0; x++) {
    const t = (x - cx) / R0, h = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 24)
    for (let y = cy - h; y <= cy + 2 + Math.round(Math.abs(t) * 4); y++) {
      const stripe = Math.floor((x - (cx - R0)) / 10) & 1, shade = y > cy - 3 ? 0 : y < cy - h + 4 ? 2 : 1
      P(c, x, y, stripe ? ["s", "w", "w"][shade] : ["q", "r", "o"][shade])
    }
  }
  c.rect(30, 98, 38, 6, "C"); c.hline(30, 98, 38, "E"); for (let x = 32; x < 66; x += 6) c.hline(x, 100, 3, "w")  // towel
  outline(c)
})
obj("coastal_beach_rocks", 80, 36, S, (c) => { rock(c, 20, 35, 18, 15, 31, RD, { cracks: 1 }); rock(c, 52, 35, 28, 24, 33, RD, { cracks: 2 }); outline(c) })

use(R.dry, R.wood, R.grass, R.barn)
obj("country_wheat", 56, 34, S, (c) => {
  tuft(c, RA, 14, 34, 0.9, 0.7, "5")
  const Rn = rng(15)
  for (let i = 0; i < 14; i++) { const x = Math.round(4 + Rn() * 48), y = Math.round(4 + Rn() * 12); c.line(x, y, x, y + 5, "5"); P(c, x - 1, y + 1, "4"); P(c, x + 1, y + 2, "4") }
  outline(c, "1")
})
obj("country_haybale", 60, 50, S, (c) => {
  const cx = 30, cy = 26, r = 22
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy)
    if (d > r) continue
    const ring = Math.floor(d / 3.2) & 1
    P(c, x, y, RA[lvl(light(dx / r, dy / r) * 0.9 + (ring ? -0.12 : 0.05) + (d < 3 ? -0.1 : 0), x, y)])
  }
  for (let a = 0; a < 6.28; a += 0.35) P(c, cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, "1")     // twine
  outline(c)
})
obj("country_corn", 72, 96, S, (c) => {
  const Rn = rng(17)
  for (let s = 0; s < 9; s++) {
    const x0 = Math.round(8 + s * 7 + Rn() * 3), top = Math.round(8 + Rn() * 20), lean = Math.round((Rn() - 0.5) * 6)
    c.line(x0, 95, x0 + lean, top, "C", 2)
    for (let y = top + 6; y < 88; y += 9) { const side = ((y / 9) | 0) & 1 ? 1 : -1, bx = Math.round(x0 + lean * (1 - y / 95)); c.line(bx, y, bx + side * 11, y + 6, "G"); c.line(bx, y, bx + side * 11, y + 5, "H") }
    c.rect(x0 + lean - 1, top + 22, 3, 7, "y")
    for (let k = 0; k < 4; k++) c.line(x0 + lean, top, x0 + lean + Math.round((k - 1.5) * 3), top - 7, "I")
  }
  outline(c)
})
use(R.steel, R.wood, R.red)
obj("country_mailbox", 28, 60, S, (c) => {
  c.rect(12, 20, 4, 40, "3"); c.vline(12, 20, 40, "5")
  c.rect(4, 8, 20, 12, "4"); c.hline(4, 8, 20, "5"); c.hline(4, 19, 20, "1"); c.rect(20, 10, 4, 10, "3")
  c.rect(22, 1, 2, 8, "H"); c.rect(22, 1, 5, 3, "H")      // red flag
  outline(c)
})

use(R.concrete, R.steel, R.brick)
// lit windows use the shared BASE keys: "l" warm light, "o" amber sill, "v" dark glass, "e" blue glass edge
function windows(c, x0, y0, x1, y1, cw, ch, gx, gy, seed, litChance = 0.45) {
  const Rn = rng(seed)
  for (let y = y0; y + ch <= y1; y += ch + gy) for (let x = x0; x + cw <= x1; x += cw + gx) {
    const lit = Rn() < litChance
    c.rect(x, y, cw, ch, lit ? "l" : "v"); if (lit) c.hline(x, y + ch - 1, cw, "o"); else c.hline(x, y, cw, "e")
  }
}
obj("night_building", 160, 176, S, (c) => {
  c.rect(10, 8, 140, 168, "2"); c.vline(10, 8, 168, "3"); c.vline(149, 8, 168, "1"); c.rect(10, 8, 140, 6, "4"); c.hline(10, 14, 140, "1")
  c.rect(26, 0, 14, 8, "3"); c.rect(110, 2, 22, 6, "3")                      // rooftop units
  windows(c, 18, 24, 142, 146, 9, 11, 7, 8, 24)
  c.rect(60, 150, 26, 26, "1"); c.rect(62, 152, 22, 24, "l"); c.hline(62, 152, 22, "o")   // lit doorway
  outline(c)
})
obj("night_warehouse", 192, 96, S, (c) => {
  c.rect(4, 20, 184, 76, "3"); c.hline(4, 20, 184, "5"); for (let x = 8; x < 186; x += 8) c.vline(x, 22, 74, x % 16 ? "2" : "4")     // corrugated wall
  c.rect(0, 12, 192, 9, "1"); c.hline(0, 12, 192, "3")
  for (const x of [28, 80, 132]) { c.rect(x, 52, 36, 44, "1"); c.rect(x + 2, 54, 32, 42, "2"); for (let y = 58; y < 96; y += 5) c.hline(x + 2, y, 32, "1") }
  for (const x of [20, 76, 128, 172]) { c.rect(x, 30, 8, 4, "l"); c.hline(x, 34, 8, "o") }   // lamps
  outline(c)
})
use(R.steel, R.red)
obj("night_billboard", 224, 176, S, (c) => {
  for (const x of [50, 168]) { c.rect(x, 96, 6, 80, "3"); c.vline(x, 96, 80, "4") }
  c.rect(8, 8, 208, 92, "1"); c.rect(11, 11, 202, 86, "v")
  c.rect(14, 14, 196, 80, "x"); c.hline(14, 14, 196, "r"); c.hline(14, 93, 196, "r"); c.vline(14, 14, 80, "r"); c.vline(209, 14, 80, "r")
  c.text(112, 24, "DINER", "l", { scale: 4, align: "c" }); c.text(112, 62, "OPEN 24 HRS", "y", { scale: 2, align: "c" })
  for (let x = 20; x < 206; x += 12) { P(c, x, 8, "y"); P(c, x, 100, "y") }
  for (const x of [20, 100, 180]) { c.rect(x, 0, 10, 8, "3"); c.rect(x + 1, 4, 8, 3, "l") }  // flood lights
  outline(c)
})

// ======================= NEON CITY (synthwave night level) =======================
// Backdrop layers (tileable, horizon on the bottom row) and neon roadside objects. Always drawn at full
// brightness: this level ignores the time-of-day tint.
R.synthSky = ["#0a0420", "#1a0a40", "#3a1060", "#7a1a78", "#c02a88"]
R.neonPink = ["#5a0a3c", "#a01470", "#e02a9a", "#ff5ac0", "#ffc0ea"]
R.neonCyan = ["#06384a", "#0e7a96", "#20c0e0", "#6cf0ff", "#d4fcff"]
R.navy = ["#05061a", "#0c1034", "#161c50", "#242d6c", "#38468e"]
R.teal = ["#06141e", "#0c2c3a", "#14506a", "#20809a", "#4cc8e0"]
R.violet = ["#120a2a", "#261448", "#3e2270", "#5a34a0", "#8452d0"]

{
  const W = 960, HZ = 262
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16
  const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s) }
  const mix = (a, b, f, x, y) => (bay(x, y) < f ? b : a)

  // sky: banded gradient to a hot horizon glow, stars, and a striped sun sitting on the horizon
  pal({ ...BASE, a: "#0a0420", b: "#14083a", c: "#240c52", d: "#3c1066", e: "#5e1474", f: "#8c1a80", g: "#c42a8e", h: "#ff4a9c", i: "#ff8a6a", j: "#ffc84a", l: "#fff0a0", m: "#ff2aa8", n: "#ff6a50", o: "#ffe060", w: "#ffffff", p: "#6a1670" })
  obj("synth_layer_sky", 960, 540, null, (c) => {
    const stops = ["a", "b", "c", "d", "e", "f", "g", "h"]
    for (let y = 0; y < 540; y++) for (let x = 0; x < W; x++) {
      const t = Math.min(1, y / HZ) ** 0.85, fpos = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(fpos)), fr = fpos - i
      c.px(x, y, y >= HZ ? "p" : mix(stops[i], stops[i + 1], fr, x, y))
    }
    for (let i = 0; i < 260; i++) {                                    // stars
      const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * 170), br = hash(i, 3)
      c.px(x, y, br > 0.85 ? "w" : br > 0.4 ? "c" : "e"); if (br > 0.93) { c.px(x + 1, y, "w"); c.px(x, y + 1, "w") }
    }
    const cx = 700, cy = 228, r = 98                                    // striped sun
    for (let y = cy - r; y <= HZ; y++) for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy)
      if (d > r + 14) continue
      if (d > r) { if (bay(x, y) < 0.5 * (1 - (d - r) / 14)) c.px(x, y, "g"); continue }       // halo
      const f = (y - (cy - r)) / (r * 2), row = y - (cy - r)
      if (f > 0.36 && (row % 12) >= 12 - Math.round((f - 0.3) * 16)) continue                   // cut-out stripes widen downward
      c.px(x, y, f < 0.3 ? "o" : f < 0.5 ? "j" : f < 0.72 ? "i" : f < 0.88 ? "n" : "m")
    }
  }, "background")

  // far wireframe mountains: dark purple solids outlined in neon with a faint grid
  pal({ ...BASE, a: "#0e0626", b: "#180a3a", c: "#26104e", d: "#20e8ff", e: "#ff3ca8", f: "#7a2a9a" })
  obj("synth_wire_peaks", 960, 120, null, (c) => {
    const ridge = (x) => 34 * Math.pow(1 - Math.abs(Math.sin((Math.PI * 4 * x) / W + 0.6)), 1.3) + 22 * Math.pow(1 - Math.abs(Math.sin((Math.PI * 9 * x) / W + 1.9)), 1.6) + 10
    for (let x = 0; x < W; x++) {
      const top = Math.round(120 - ridge(x))
      for (let y = top; y < 120; y++) {
        const d = y - top
        c.px(x, y, d <= 1 ? "d" : (d % 12 === 0 || x % 28 === 0) ? "e" : d < 40 ? "c" : d < 80 ? "b" : "a")
      }
    }
  }, "background")

  // city skyline: two rows of towers with lit windows and neon rim light
  pal({ ...BASE, a: "#0a0828", b: "#120e3a", c: "#1c1650", d: "#2c2470", w: "#ffffff", y: "#ffd860", p: "#ff4ab0", q: "#20e8ff", r: "#ff2a2a", s: "#5a2a8a", t: "#3a1a66", u: "#ff7ac8", v: "#7af4ff" })
  obj("synth_skyline", 960, 160, null, (c) => {
    const Rn = rng(87)
    const row = (base, hMin, hMax, body, rim, lit, litP, seed) => {
      const Rr = rng(seed)
      let x = 6
      while (x < W - 50) {
        const w = 18 + Math.floor(Rr() * 30), h = Math.floor(hMin + Rr() * (hMax - hMin)), top = base - h
        for (let xx = x; xx < x + w; xx++) for (let y = top; y < base; y++) c.px(xx, y, body)
        c.vline(x, top, h, rim); c.hline(x, top, w, rim === "p" ? "u" : "v")             // rim light left + roof edge
        if (lit) for (let yy = top + 6; yy < base - 4; yy += 7) for (let xx = x + 3; xx < x + w - 3; xx += 5) if (Rr() < litP) { const k = Rr(); c.rect(xx, yy, 2, 3, k < 0.45 ? "y" : k < 0.75 ? "q" : k < 0.92 ? "p" : "w") }
        if (Rr() < 0.4) { const ax = x + Math.floor(w / 2); c.vline(ax, top - 12, 12, "d"); c.px(ax, top - 13, "r") }   // antenna + beacon
        x += w + Math.floor(Rr() * 5)
      }
    }
    row(160, 36, 90, "t", "s", false, 0, 5)       // distant row, dim
    row(160, 24, 112, "a", "p", true, 0.34, 6)    // front row
    row(160, 14, 40, "b", "q", true, 0.28, 8)     // low blocks
    for (let y = 150; y < 160; y++) for (let x = 0; x < W; x++) if (bay(x, y) < (y - 150) / 10) c.px(x, y, "t")   // haze at the foot
  }, "background")
}

// ---- neon roadside objects (16 px/m) ----
use(R.navy, R.neonPink, R.neonCyan, R.violet)
const pylon = (c, tube, glow) => {
  c.rect(10, 186, 14, 6, "2"); c.hline(10, 186, 14, "4")
  for (let y = 36; y < 187; y++) for (let x = 14; x <= 20; x++) P(c, x, y, x < 16 ? "4" : x < 19 ? "3" : "2")
  c.rect(14, 28, 7, 10, "3"); c.rect(10, 24, 90, 5, "3"); c.hline(10, 24, 90, "5")      // cross arm
  for (let x = 24; x < 98; x++) { c.rect(x, 18, 1, 5, tube); c.px(x, 17, glow); c.px(x, 23, glow) }   // neon tube
  for (let i = 0; i < 40; i++) { const x = 20 + ((i * 37) % 80), y = 8 + ((i * 17) % 14); if ((x + y) % 3 === 0) P(c, x, y, glow) }       // glow dust
  outline(c)
}
obj("synth_pylon_pink", 112, 192, S, (c) => pylon(c, "D", "B"))
obj("synth_pylon_cyan", 112, 192, S, (c) => {
  c.rect(10, 186, 14, 6, "2"); c.hline(10, 186, 14, "4")
  for (let y = 36; y < 187; y++) for (let x = 14; x <= 20; x++) P(c, x, y, x < 16 ? "4" : x < 19 ? "3" : "2")
  c.rect(14, 28, 7, 10, "3"); c.rect(10, 24, 90, 5, "3"); c.hline(10, 24, 90, "5")
  for (let x = 24; x < 98; x++) { c.rect(x, 18, 1, 5, "I"); c.px(x, 17, "G"); c.px(x, 23, "G") }
  for (let i = 0; i < 40; i++) { const x = 20 + ((i * 37) % 80), y = 8 + ((i * 17) % 14); if ((x + y) % 3 === 0) P(c, x, y, "G") }
  outline(c)
})

use(R.navy, R.neonPink, R.neonCyan, R.violet)
const tower = (c, w, h, trim, trimGlow, seed) => {
  const Rn = rng(seed), x0 = Math.floor((c.w - w) / 2), top = c.h - h
  c.rect(x0, top, w, h, "2"); c.vline(x0, top, h, "3"); c.vline(x0 + w - 1, top, h, "1"); c.rect(x0, top, w, 4, "3")
  for (let y = top + 10; y < c.h - 22; y += 10) for (let x = x0 + 6; x < x0 + w - 8; x += 9) { const lit = Rn() < 0.5, k = Rn(); c.rect(x, y, 5, 6, lit ? (k < 0.5 ? "y" : k < 0.8 ? "I" : "D") : "v"); if (lit) c.hline(x, y + 5, 5, "o") }
  for (const x of [x0 + 2, x0 + w - 4]) { c.rect(x, top, 2, h, trim); c.vline(x + 2, top, h, trimGlow) }            // neon edge strips
  c.rect(x0 + 6, top + 10 + 10 * 3, w - 12, 3, trim)                                                       // neon band
  c.rect(x0 + Math.floor(w / 2) - 10, c.h - 20, 20, 20, "1"); c.rect(x0 + Math.floor(w / 2) - 8, c.h - 18, 16, 18, "l")  // lit entrance
  c.vline(c.w / 2, top - 22, 22, "4"); c.px(c.w / 2, top - 23, "r")
  outline(c)
}
obj("synth_tower_pink", 160, 288, S, (c) => tower(c, 112, 262, "D", "B", 31))
obj("synth_tower_cyan", 160, 288, S, (c) => tower(c, 96, 240, "I", "G", 32))

obj("synth_billboard", 224, 176, S, (c) => {
  for (const x of [50, 168]) { c.rect(x, 96, 6, 80, "3"); c.vline(x, 96, 80, "4") }
  c.rect(8, 8, 208, 92, "1"); c.rect(11, 11, 202, 86, "v"); c.rect(14, 14, 196, 80, "2")
  for (let x = 14; x < 210; x++) { c.px(x, 14, "D"); c.px(x, 93, "I") }
  for (let y = 14; y < 94; y++) { c.px(14, y, "D"); c.px(209, y, "I") }
  c.text(112, 24, "SYNTH", "D", { scale: 5, align: "c" }); c.text(112, 64, "FM 87.5", "I", { scale: 3, align: "c" })
  c.text(114, 26, "SYNTH", "B", { scale: 5, align: "c" })
  for (const x of [20, 100, 180]) { c.rect(x, 0, 10, 8, "3"); c.rect(x + 1, 4, 8, 3, "l") }
  outline(c)
})

// neon palm: teal fronds, violet trunk, pink rim light
use(R.teal, R.violet, R.neonPink)
obj("synth_palm", 192, 224, S, (c) => { palm(c, 90, 223, 104, 48, 11); outline(c, "I") })
// glowing crystal cluster / neon shrub for ground detail
use(R.neonCyan, R.neonPink, R.violet)
obj("synth_crystals", 64, 56, S, (c) => {
  for (const [x, w, h, ramp] of [[10, 12, 34, "12345"], [24, 14, 52, "ABCDE"], [40, 12, 40, "12345"], [52, 8, 24, "ABCDE"]]) {
    for (let y = 55 - h; y < 56; y++) { const t = (55 - y) / h, ww = Math.max(2, Math.round(w * (1 - t * 0.85) / 2)); for (let xx = -ww; xx <= ww; xx++) P(c, x + xx, y, ramp[xx < -ww / 3 ? 3 : xx < ww / 3 ? 2 : 1]) }
    c.vline(x - 1, 55 - h + 4, h - 10, ramp[4])
  }
  outline(c, "F")
})
