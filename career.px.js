// OPEN ROAD '87 garage + career artwork. Props/characters are transparent; scale matches the
// 256px car sprites (~58 px per metre). Backgrounds are 960x540 with an uncluttered centre.

pal({ k: "#08080b" })
const K = "#08080b"

// ---------------- helpers ----------------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const pick = (ramp, v, x, y) => { const f = clamp(v, 0, 1) * (ramp.length - 1), i = Math.floor(f); return ramp[Math.min(ramp.length - 1, f - i > bay(x, y) ? i + 1 : i)] }
// translucent "#rrggbbaa" colours are blended over what is already there (pxl itself overwrites)
const P = (c, x, y, col) => {
  x = Math.round(x); y = Math.round(y); if (!col || x < 0 || y < 0 || x >= c.w || y >= c.h) return
  if (col.length === 9 && !col.endsWith("ff")) {
    const s = parseInt(col.slice(1), 16) >>> 0, a = (s & 255) / 255, d = c.get(x, y) >>> 0
    if (!(d & 255)) { c.px(x, y, col); return }
    const m = (k) => Math.round(((s >>> k) & 255) * a + ((d >>> k) & 255) * (1 - a)) << k
    c.px(x, y, (m(24) | m(16) | m(8) | (d & 255)) >>> 0); return
  }
  c.px(x, y, col)
}
function inPoly(x, y, pts) { let ins = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins } return ins }
function poly(c, pts, col) {
  const xs = pts.filter((_, i) => !(i & 1)), ys = pts.filter((_, i) => i & 1)
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inPoly(x + 0.5, y + 0.5, pts)) P(c, x, y, typeof col === "function" ? col(x, y, (x - x0) / Math.max(1, x1 - x0), (y - y0) / Math.max(1, y1 - y0)) : col)
}
function box(c, x, y, w, h, col) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) P(c, i, j, typeof col === "function" ? col(i, j, (i - x) / Math.max(1, w - 1), (j - y) / Math.max(1, h - 1)) : col) }
function ell(c, cx, cy, rx, ry, col) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny
    if (d <= 1) P(c, x, y, typeof col === "function" ? col(x, y, nx, ny, d) : col)
  }
}
function line(c, x0, y0, x1, y1, col, w = 1) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2); for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) P(c, x - (w >> 1) + a, y - (w >> 1) + b, col) } }
function outline(c, col = K) {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, "*")) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.is(x + dx, y + dy, "*"))) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, col)
}
// light from the upper-left: lit(ramp, base, u, v) where u,v = 0..1 position across the part
const lit = (ramp, base = 0.55, sx = 0.5, sy = 0.15) => (x, y, u, v) => pick(ramp, base - (u - 0.5) * sx - (v - 0.5) * sy, x, y)
const dome = (ramp, base = 0.5) => (x, y, nx, ny, d) => pick(ramp, base - nx * 0.4 - ny * 0.35 + (1 - d) * 0.2, x, y)
const inStar = (x, y, ox, oy, R, r) => { const dx = x + 0.5 - ox, dy = y + 0.5 - oy, a = Math.atan2(dy, dx) + Math.PI / 2, seg = Math.PI / 5, t = Math.abs(((a % (2 * seg)) + 2 * seg) % (2 * seg) - seg) / seg; return Math.hypot(dx, dy) <= r + (R - r) * t ** 1.4 }

// ---------------- palette ramps ----------------
const SKIN = ["#4a2a1a", "#7a4a2e", "#a86a44", "#cc8c60", "#e8b086", "#f6cca4"]
const NAVY = ["#0e1424", "#18223c", "#24345a", "#32487c", "#46629e", "#6684bc"]
const RED = ["#2e0606", "#5a0e0c", "#8e1814", "#c42820", "#e8483a", "#ff7a62"]
const STEEL = ["#24272e", "#3a3e46", "#555a64", "#767b86", "#9ca1ab", "#c4c8cf", "#eceef2"]
const GOLD = ["#3a2004", "#6a4208", "#a4700e", "#d4a020", "#f2cc40", "#fff08a", "#fffbe0"]
const SILVER = ["#2e3036", "#50545c", "#7a7e88", "#a4a9b2", "#cdd1d8", "#eef0f4", "#ffffff"]
const BRONZE = ["#2a1206", "#52280e", "#7e4218", "#a85e26", "#cc8040", "#e8a868", "#f8d0a0"]
const WOOD = ["#2a160a", "#40220e", "#5a3216", "#76441e", "#94582a", "#b07038"]
const MAHOG = ["#140806", "#22100a", "#341a10", "#482416", "#5e301e", "#784028"]
const BLACK = ["#08080b", "#121216", "#1e1e24", "#2c2c34", "#40404a"]
const BLUE = ["#0a1832", "#122858", "#1c3c84", "#2c58b4", "#4c7ed8", "#86aeee"]
const SUIT = ["#3a4652", "#566676", "#74869a", "#94a6b8", "#b6c6d4", "#d6e2ea"]
const SHIRT = ["#9aa2aa", "#c4cad0", "#e2e6ea", "#f6f8fa"]
const HAIR = ["#0a0604", "#1a0e08", "#2c1a10", "#44281a"]
const BROWN = ["#1e0e06", "#3a1e0e", "#5a3018", "#7a4424", "#985a32"]
const AMBER = ["#5a2a06", "#9a4a0a", "#d87a14", "#f4a62a", "#ffd36a"]
const CREAM = ["#a8977a", "#cdbd9c", "#e8dcc0", "#f6eedb"]

// =====================================================================================
// TROPHY (parametric, drawn per pixel so it can be stamped at any size)
// =====================================================================================
function trophyAt(u, v, M) {                 // u,v in 0..128 x 0..176 trophy space -> colour or null
  const cx = 64, s = (ramp, l, x, y) => pick(ramp, l, x, y)
  const metal = (nx, l0 = 0) => 0.58 - nx * 0.42 + (Math.abs(nx + 0.45) < 0.1 ? 0.35 : 0) + l0     // cylinder + specular streak
  // base tiers
  if (v >= 150 && v < 171 && u >= 22 && u < 106) {
    if (u >= 46 && u < 82 && v >= 158 && v < 166) return v === 158 ? M[5] : M[3]                   // blank plaque
    const vein = Math.sin(u * 0.21 + v * 0.6) + Math.sin(u * 0.07 - v * 0.3) > 1.4
    return v < 155 ? (u < 64 ? BLACK[4] : BLACK[3]) : vein ? BLACK[3] : BLACK[1 + ((u * 3 + v) % 7 === 0 ? 1 : 0)]
  }
  if (v >= 132 && v < 150 && u >= 32 && u < 96) return v < 136 ? BLACK[4] : (u - 32) / 64 < 0.25 ? BLACK[3] : BLACK[2]
  // stem + knop
  if (v >= 108 && v < 132) {
    const hw = v < 112 ? 12 : v > 126 ? 12 - (132 - v) * 0.4 : 7 + 5 * Math.exp(-(((v - 119) / 4) ** 2))
    const dx = u + 0.5 - cx; if (Math.abs(dx) <= hw) return [M, metal(dx / hw)]
  }
  // bowl
  if (v >= 40 && v < 108) {
    const t = (v - 40) / 68, hw = 7 + 33 * Math.pow(Math.max(0, Math.cos(t * Math.PI / 2)), 0.65), dx = u + 0.5 - cx
    if (Math.abs(dx) <= hw) {
      const nx = dx / hw
      if (v >= 56 && v < 68) { const a = Math.asin(clamp(nx, -1, 1)), sq = (Math.floor((a + 1.6) * 4.2) + Math.floor((v - 56) / 6)) & 1; return sq ? [BLACK, 0.25 - nx * 0.2] : [CREAM, 0.95 - nx * 0.4] }   // chequered band
      if (v === 55 || v === 68) return [M, metal(nx, 0.2)]
      return [M, metal(nx, -t * 0.12)]
    }
  }
  if (v >= 35 && v < 41 && Math.abs(u + 0.5 - cx) <= 43) return [M, v < 37 ? 0.95 : metal((u + 0.5 - cx) / 43, 0.1)]   // rim lip
  // handles (loops)
  for (const sgn of [-1, 1]) {
    const hx = cx + sgn * 44, hy = 62, nx = (u + 0.5 - hx) / 13, ny = (v + 0.5 - hy) / 18, d = Math.sqrt(nx * nx + ny * ny)
    if (d > 0.68 && d <= 1 && sgn * nx > -0.3) return [M, 0.6 - nx * 0.35 - ny * 0.3]
  }
  // lid + star finial
  if (v >= 18 && v < 36) { const nx = (u + 0.5 - cx) / 30, ny = (v + 0.5 - 36) / 18; if (nx * nx + ny * ny <= 1) return [M, 0.6 - nx * 0.4 - ny * 0.25] }
  if (v >= 2 && v < 20 && inStar(u, v, cx, 11, 9, 4)) return [M, inStar(u - 1, v - 1, cx, 11, 9, 4) ? 0.95 : 0.5]
  if (v >= 18 && v < 20 && Math.abs(u + 0.5 - cx) < 3) return [M, 0.4]
  return null
}
function trophy(c, ox, oy, scale, M) {      // draws a trophy, top-left (ox,oy), 128*scale wide
  for (let y = 0; y < Math.ceil(176 * scale); y++) for (let x = 0; x < Math.ceil(128 * scale); x++) {
    const r = trophyAt(Math.floor(x / scale), Math.floor(y / scale), M)
    if (!r) continue
    P(c, ox + x, oy + y, typeof r === "string" ? r : pick(r[0], r[1], ox + x, oy + y))
  }
}
sprite("career_trophy", { w: 128, h: 176 }, (c) => { trophy(c, 0, 0, 1, GOLD); outline(c) })

// =====================================================================================
// MEDAL
// =====================================================================================
sprite("career_medal", { w: 96, h: 128 }, (c) => {
  const strap = (pts, flip) => poly(c, pts, (x, y, u, v) => {
    const k = Math.floor((flip ? 1 - u : u) * 5), base = [AMBER, BLACK, CREAM, BLACK, AMBER][Math.min(4, k)]
    return pick(base, 0.75 - v * 0.35 - (flip ? 0.1 : 0), x, y)
  })
  strap([12, 0, 36, 0, 56, 60, 40, 64], false)
  strap([60, 0, 84, 0, 58, 64, 42, 60], true)
  box(c, 12, 0, 72, 2, BLACK[2])                                                              // fold shadow at the top
  ell(c, 48, 66, 6, 5, (x, y, nx, ny, d) => d < 0.35 ? null : pick(GOLD, 0.65 - nx * 0.4 - ny * 0.3, x, y))   // jump ring
  ell(c, 48, 96, 30, 30, (x, y, nx, ny, d) => {
    const r = Math.sqrt(d)
    if (r > 0.86) return pick(GOLD, 0.62 - nx * 0.45 - ny * 0.45, x, y)                          // bevelled rim
    if (r > 0.8) return pick(GOLD, 0.3 + nx * 0.3 + ny * 0.3, x, y)                              // inner bevel (reversed)
    let l = 0.5 - nx * 0.15 - ny * 0.15
    const a = Math.atan2(ny, nx), rr = r * 30
    // laurel: leaves along both lower sides
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {                                       // laurel sprigs (rotated leaf ellipses)
      const la = Math.PI / 2 + side * (0.45 + k * 0.33), lcx = Math.cos(la) * 20.5, lcy = Math.sin(la) * 20.5, off = (k & 1 ? 1 : -1) * 2.2
      const tx = -Math.sin(la), ty = Math.cos(la), px = nx * 30 - (lcx + Math.cos(la) * off), py = ny * 30 - (lcy + Math.sin(la) * off)
      const along = px * tx + py * ty, across = px * Math.cos(la) + py * Math.sin(la)
      if ((along / 3.4) ** 2 + (across / 1.5) ** 2 <= 1) return across < -0.4 ? GOLD[6] : across < 0.5 ? GOLD[5] : GOLD[2]
    }
    if (rr > 19.8 && rr < 21.2 && ny > -0.35) return GOLD[1]                               // laurel stem
    // steering-wheel emblem
    if (rr > 9.5 && rr < 13) return pick(GOLD, 0.85 - (nx + ny) * 0.3, x, y)
    if (rr < 3.6) return pick(GOLD, 0.9 - (nx + ny) * 0.3, x, y)
    if (rr < 10 && (Math.abs(ny * 30) < 1.4 || (Math.abs(nx * 30) < 1.4 && ny > 0))) return pick(GOLD, 0.8, x, y)
    if (rr > 13 && rr < 14.2 && nx + ny > 0) l -= 0.25                                          // emboss shadow
    return pick(GOLD, l, x, y)
  })
  P(c, 30, 80, GOLD[6]); P(c, 31, 79, GOLD[6]); P(c, 29, 82, GOLD[5])
  outline(c)
})

// =====================================================================================
// CHARACTERS (80x144, standing, facing the viewer)
// =====================================================================================
function head(c, skin, cx = 40, cy = 21) {
  ell(c, cx - 9, cy + 1, 2.2, 3.2, dome(skin, 0.45)); ell(c, cx + 9, cy + 1, 2.2, 3.2, dome(skin, 0.3))   // ears
  ell(c, cx, cy, 8.5, 10, dome(skin, 0.62))
  P(c, cx, cy + 3, skin[2]); P(c, cx + 1, cy + 4, skin[1])                                     // nose shadow
}
function legsAndBoots(c, ramp, shoe, crease) {
  poly(c, [29, 76, 39.5, 76, 39.5, 128, 28, 128], lit(ramp, 0.55))
  poly(c, [40.5, 76, 51, 76, 52, 128, 40.5, 128], lit(ramp, 0.42))
  if (crease) { line(c, 34, 82, 33, 127, ramp[Math.min(ramp.length - 1, 4)]); line(c, 46, 82, 46, 127, ramp[3]) }
  poly(c, [26, 128, 39, 128, 39, 136, 23, 136, 23, 132], lit(shoe, 0.5, 0.3, 0.6))
  poly(c, [41, 128, 54, 128, 57, 132, 57, 136, 41, 136], lit(shoe, 0.4, 0.3, 0.6))
  box(c, 23, 135, 16, 1, shoe[0]); box(c, 41, 135, 16, 1, shoe[0])
}

sprite("garage_mechanic", { w: 80, h: 144 }, (c) => {
  legsAndBoots(c, NAVY, BLACK, false)
  for (const [x, y] of [[32, 104], [33, 105], [31, 106], [46, 100], [47, 101], [44, 112]]) P(c, x, y, NAVY[1])   // grease
  poly(c, [27, 34, 53, 34, 53, 50, 52, 78, 28, 78, 27, 50], lit(NAVY, 0.55))                          // coverall torso
  box(c, 28, 71, 24, 2, NAVY[1])                                                                      // elastic waist
  ell(c, 27, 38, 6, 6, dome(NAVY, 0.6)); ell(c, 53, 38, 6, 6, dome(NAVY, 0.35))                        // shoulders
  poly(c, [19, 37, 27, 37, 27, 70, 25, 75, 20, 75, 19, 60], lit(NAVY, 0.62))                           // left arm
  poly(c, [53, 37, 61, 37, 62, 60, 61, 75, 55, 75, 53, 60], lit(NAVY, 0.36))                           // right arm
  box(c, 19, 73, 8, 2, NAVY[1]); box(c, 54, 73, 8, 2, NAVY[1])                                        // cuffs
  ell(c, 22.5, 79, 4, 5, dome(SKIN, 0.6)); ell(c, 58, 79, 4, 5, dome(SKIN, 0.45))                       // hands
  line(c, 59, 80, 65, 104, STEEL[3], 3); line(c, 58, 80, 64, 104, STEEL[5])                              // wrench
  ell(c, 65.5, 107, 4.5, 4.5, (x, y, nx, ny) => (ny > 0.15 && Math.abs(nx) < 0.4) ? null : pick(STEEL, 0.65 - nx * 0.4 - ny * 0.3, x, y))
  poly(c, [46, 74, 51, 73, 52, 82, 50, 90, 47, 88, 45, 81], (x, y) => ((x + y) % 4 < 2 ? RED[3] : RED[2])); box(c, 45, 72, 7, 2, NAVY[1])   // shop rag from hip pocket
  box(c, 36, 30, 9, 5, SKIN[2])                                                                       // neck
  poly(c, [35, 34, 40, 41, 45, 34], SHIRT[2]); line(c, 35, 34, 40, 41, SHIRT[0])                        // T-shirt V
  line(c, 40, 41, 40, 77, STEEL[4])                                                                    // zip
  ell(c, 32.5, 45, 4.5, 2.6, (x, y, nx, ny, d) => d > 0.6 ? RED[3] : CREAM[3])                           // blank name patch
  box(c, 44, 42, 7, 7, (x, y, u, v) => v < 0.25 ? NAVY[2] : NAVY[3]); box(c, 44, 44, 7, 1, NAVY[1])      // chest pocket
  head(c, SKIN)
  ell(c, 40, 13, 9.6, 6, (x, y, nx, ny) => y > 14 ? null : pick(RED, 0.65 - nx * 0.4 - ny * 0.2, x, y))  // cap crown
  poly(c, [30, 14, 50, 14, 54, 17, 50, 18, 30, 17], lit(RED, 0.4, 0.3, 0.5))                           // brim
  P(c, 40, 7, RED[4]); box(c, 31, 15, 2, 4, HAIR[2]); box(c, 47, 15, 2, 4, HAIR[2])                     // button, sideburns
  box(c, 35, 19, 3, 1, HAIR[2]); box(c, 43, 19, 3, 1, HAIR[2])                                          // brows
  box(c, 35, 21, 2, 1, K); box(c, 43, 21, 2, 1, K); P(c, 37, 21, SHIRT[3]); P(c, 45, 21, SHIRT[3])     // eyes
  box(c, 35, 25, 11, 2, HAIR[3]); box(c, 36, 27, 9, 1, HAIR[2])                                         // moustache
  box(c, 38, 29, 5, 1, SKIN[1])                                                                        // chin shade
  outline(c)
})

sprite("dealer_salesman", { w: 80, h: 144 }, (c) => {
  legsAndBoots(c, SUIT, BROWN, true)
  poly(c, [24, 34, 56, 34, 55, 50, 53, 80, 27, 80, 25, 50], lit(SUIT, 0.55))                          // jacket (big shoulders)
  ell(c, 25, 38, 6.5, 6, dome(SUIT, 0.62)); ell(c, 55, 38, 6.5, 6, dome(SUIT, 0.38))
  poly(c, [35, 34, 45, 34, 43, 62, 40, 66, 37, 62], SHIRT[2])                                          // shirt
  poly(c, [38.5, 36, 41.5, 36, 42.5, 60, 40, 64, 37.5, 60], (x, y) => ((x + y) % 5 === 0 ? RED[4] : RED[3]))   // wide tie
  box(c, 38, 35, 4, 3, RED[2])                                                                        // knot
  poly(c, [33, 34, 36, 34, 38, 52, 35, 58, 31, 44], SUIT[1]); poly(c, [44, 34, 47, 34, 49, 44, 45, 58, 42, 52], SUIT[1])  // lapels
  line(c, 33, 35, 37, 52, SUIT[4]); line(c, 47, 35, 43, 52, SUIT[3])
  P(c, 40, 68, STEEL[5]); P(c, 40, 74, STEEL[5])                                                      // buttons
  poly(c, [27, 46, 33, 46, 32, 49], RED[4])                                                           // pocket square
  box(c, 27, 49, 7, 1, SUIT[1]); box(c, 46, 66, 7, 1, SUIT[1]); box(c, 28, 66, 7, 1, SUIT[1])         // pocket flaps
  poly(c, [17, 37, 25, 37, 25, 72, 23, 76, 18, 76, 17, 60], lit(SUIT, 0.62))                          // left arm hanging
  box(c, 18, 74, 6, 2, SHIRT[2]); ell(c, 21, 80, 4, 5, dome(SKIN, 0.6)); box(c, 18, 73, 6, 1, GOLD[4])   // cuff, hand, watch
  poly(c, [55, 37, 62, 37, 62, 58, 56, 60, 53, 50], lit(SUIT, 0.36))                                  // right upper arm
  poly(c, [42, 52, 62, 52, 62, 60, 42, 60], lit(SUIT, 0.42, 0.3, 0.6))                                // forearm across chest
  box(c, 42, 52, 3, 8, SHIRT[2]); ell(c, 39, 56, 4.5, 4.2, dome(SKIN, 0.6))                            // cuff + hand
  ell(c, 38, 63, 2.6, 2.6, (x, y, nx, ny, d) => d < 0.3 ? null : GOLD[4]); line(c, 38, 65, 38, 71, GOLD[3], 2); P(c, 37, 70, GOLD[5])   // car keys
  box(c, 36, 30, 9, 5, SKIN[2])
  head(c, SKIN)
  ell(c, 40, 13, 10.5, 7, (x, y, nx, ny) => y > 16 ? null : pick(HAIR, 0.75 - nx * 0.5 - ny * 0.3, x, y))   // slick pompadour
  box(c, 30, 14, 2, 8, HAIR[1]); box(c, 49, 14, 2, 8, HAIR[1])
  line(c, 33, 10, 45, 8, HAIR[3])                                                                       // shine
  poly(c, [33, 19, 39, 19, 38.5, 23, 34, 23], (x, y) => y === 19 ? STEEL[5] : BLACK[1])                  // aviators
  poly(c, [41, 19, 47, 19, 46.5, 23, 42, 23], (x, y) => y === 19 ? STEEL[5] : BLACK[1])
  box(c, 39, 19, 2, 1, STEEL[4]); P(c, 34, 20, SILVER[4]); P(c, 42, 20, SILVER[4])
  box(c, 36, 26, 9, 1, K); box(c, 37, 27, 7, 1, SHIRT[3]); box(c, 37, 28, 7, 1, SKIN[1])                 // big grin
  outline(c)
})

// =====================================================================================
// GARAGE PROPS
// =====================================================================================
sprite("garage_toolbox", { w: 128, h: 176 }, (c) => {
  const front = (x0, y0, w, h, rows) => {
    box(c, x0, y0, w, h, lit(RED, 0.6, 0.3, 0.3))
    let y = y0
    for (const rh of rows) {
      box(c, x0 + 2, y + 1, w - 4, 1, RED[1])                                                     // drawer gap
      box(c, x0 + 6, y + 4, w - 12, 2, (x) => x < x0 + w / 2 ? STEEL[6] : STEEL[5]); box(c, x0 + 6, y + 6, w - 12, 1, STEEL[1])   // chrome pull
      y += rh
    }
    box(c, x0, y0, 1, h, RED[5])
  }
  // top chest
  poly(c, [14, 30, 104, 30, 116, 22, 26, 22], lit(RED, 0.88, 0.2, 0.2))
  poly(c, [104, 30, 116, 22, 116, 70, 104, 76], lit(RED, 0.25, 0.1, 0.2))
  front(14, 30, 90, 46, [9, 9, 12, 16])
  box(c, 106, 40, 8, 2, STEEL[4])                                                                 // side handle
  // bottom cabinet
  poly(c, [8, 80, 108, 80, 120, 72, 20, 72], lit(BLACK, 0.55, 0.2, 0.3))                         // rubber mat top
  poly(c, [108, 80, 120, 72, 120, 152, 108, 160], lit(RED, 0.25, 0.1, 0.2))
  front(8, 80, 100, 80, [10, 10, 12, 14, 34])
  for (let y = 88; y < 150; y += 7) box(c, 111, y, 6, 1, RED[1])                                   // side vents
  line(c, 114, 96, 114, 140, STEEL[4], 2)
  // casters
  for (const x of [16, 98]) { box(c, x - 2, 160, 10, 4, STEEL[2]); ell(c, x + 3, 168, 5, 5, dome(BLACK, 0.5)); P(c, x + 3, 168, STEEL[4]) }
  ell(c, 116, 158, 3.5, 3.5, dome(BLACK, 0.4))
  outline(c)
})

sprite("garage_workbench", { w: 288, h: 160 }, (c) => {
  // frame + legs
  for (const x of [10, 268]) { box(c, x, 84, 10, 72, lit(STEEL, 0.5, 0.6, 0)); box(c, x - 2, 154, 14, 4, STEEL[1]) }
  box(c, 20, 128, 248, 6, lit(WOOD, 0.55, 0.2, 0.6)); box(c, 20, 134, 248, 3, WOOD[0])           // lower shelf
  box(c, 4, 70, 280, 6, (x, y, u) => pick(WOOD, 0.85 - u * 0.25 + ((x * 7 + y * 3) % 23 === 0 ? -0.2 : 0), x, y))   // worktop surface
  box(c, 4, 76, 280, 9, (x, y, u, v) => pick(WOOD, 0.55 - u * 0.2 - v * 0.2 + (Math.sin(x * 0.11 + y) > 0.92 ? -0.15 : 0), x, y))   // front edge
  box(c, 4, 85, 280, 2, WOOD[0])
  // shelf contents
  ;[[30, RED], [46, AMBER], [62, BLUE]].forEach(([x, R], i) => { box(c, x, 104 - i * 3, 13, 24 + i * 3, lit(R, 0.6, 0.6, 0.2)); box(c, x + 4, 100 - i * 3, 5, 4, STEEL[3]); box(c, x + 2, 112, 9, 6, CREAM[2]) })   // oil cans (blank labels)
  box(c, 96, 104, 46, 24, lit(BROWN, 0.6, 0.3, 0.3)); box(c, 96, 104, 46, 2, BROWN[4]); line(c, 96, 104, 141, 104, BROWN[4]); box(c, 112, 104, 14, 24, BROWN[2])   // parts box
  for (let i = 0; i < 3; i++) ell(c, 200 + i * 6, 120 - i * 7, 14, 6, (x, y, nx, ny, d) => d < 0.25 ? BLACK[0] : pick(BLACK, 0.55 - ny * 0.4, x, y))   // stacked brake rotors / tyres? (rubber discs)
  // vise (left end)
  box(c, 18, 52, 40, 18, lit(BLUE, 0.5, 0.4, 0.4)); box(c, 14, 46, 12, 24, lit(BLUE, 0.6, 0.4, 0.3)); box(c, 52, 46, 12, 24, lit(BLUE, 0.4, 0.4, 0.3))
  box(c, 24, 44, 2, 8, STEEL[5]); box(c, 54, 44, 2, 8, STEEL[4])                                   // jaws
  line(c, 64, 58, 80, 58, STEEL[4], 2); ell(c, 80, 58, 2.5, 2.5, STEEL[5]); ell(c, 64, 58, 2, 2, STEEL[5])
  // carburettor
  ell(c, 120, 56, 16, 6, dome(STEEL, 0.6)); box(c, 106, 56, 28, 12, lit(STEEL, 0.5, 0.5, 0.3)); ell(c, 120, 56, 9, 3.2, BLACK[1]); box(c, 132, 60, 8, 3, STEEL[2])
  // wrench + screwdriver lying on the bench
  line(c, 150, 68, 182, 66, STEEL[4], 2); ell(c, 184, 66, 3, 2.5, STEEL[5]); line(c, 190, 69, 210, 68, AMBER[3], 3); line(c, 210, 68, 224, 68, STEEL[5])
  // small red toolbox + mug
  box(c, 232, 46, 44, 24, lit(RED, 0.6, 0.4, 0.3)); box(c, 232, 46, 44, 3, RED[5]); box(c, 236, 55, 36, 1, RED[1]); line(c, 244, 42, 264, 42, STEEL[4], 2); line(c, 244, 42, 244, 46, STEEL[4], 2); line(c, 264, 42, 264, 46, STEEL[4], 2)
  box(c, 204, 56, 12, 14, lit(CREAM, 0.7, 0.6, 0.2)); box(c, 204, 56, 12, 2, BROWN[1]); ell(c, 218, 63, 3, 4, (x, y, nx, ny, d) => d < 0.35 ? null : CREAM[1])
  outline(c)
})

sprite("garage_lift", { w: 384, h: 256 }, (c) => {
  // overhead beam with hydraulic line
  box(c, 24, 10, 336, 16, lit(BLUE, 0.6, 0.1, 0.7)); box(c, 24, 10, 336, 2, BLUE[5]); box(c, 24, 24, 336, 2, BLUE[0])
  line(c, 40, 20, 344, 20, BLACK[2], 2)
  for (const [x0, sgn] of [[24, 1], [328, -1]]) {
    box(c, x0, 26, 32, 208, (x, y, u) => pick(BLUE, (sgn > 0 ? 0.65 - u * 0.5 : 0.35 - u * 0.25), x, y))   // post
    box(c, sgn > 0 ? x0 + 24 : x0, 26, 8, 208, BLUE[1])                                                      // inner channel
    for (let y = 214; y < 234; y++) for (let x = x0; x < x0 + 32; x++) if (((x + y) >> 2) & 1) P(c, x, y, BLACK[1]); else P(c, x, y, AMBER[3])   // safety stripes
    box(c, x0 - 10, 234, 52, 8, lit(STEEL, 0.5, 0.4, 0.5)); for (const bx of [x0 - 6, x0 + 36]) ell(c, bx, 238, 2, 2, STEEL[5])   // base plate
    // carriage + arms (front arm drawn last = nearer the viewer)
    const cx0 = sgn > 0 ? x0 + 28 : x0 - 14
    box(c, cx0, 180, 18, 30, lit(STEEL, 0.5, 0.5, 0.4))
    const ax = sgn > 0 ? cx0 + 18 : cx0
    poly(c, [ax, 186, ax + sgn * 70, 188, ax + sgn * 70, 194, ax, 194], lit(STEEL, 0.4, 0.2, 0.7))            // rear arm
    ell(c, ax + sgn * 70, 186, 9, 3, dome(BLACK, 0.5)); box(c, ax + sgn * 64, 186, 12, 3, BLACK[2])
    poly(c, [ax, 198, ax + sgn * 86, 206, ax + sgn * 86, 214, ax, 208], lit(STEEL, 0.6, 0.2, 0.7))           // front arm
    ell(c, ax + sgn * 86, 204, 11, 3.5, dome(BLACK, 0.55)); box(c, ax + sgn * (sgn > 0 ? 78 : 94), 204, 16, 4, BLACK[2])     // rubber pad
  }
  box(c, 6, 120, 18, 30, lit(STEEL, 0.55, 0.4, 0.4)); ell(c, 15, 130, 3, 3, "#3ac04a"); ell(c, 15, 141, 3, 3, RED[4])   // control box
  line(c, 15, 150, 30, 226, BLACK[2])                                                                        // cable
  outline(c)
})

// =====================================================================================
// BACKGROUNDS
// =====================================================================================
const W = 960, H = 540
function fluorescent(c, lx, ly, len, floorY, strength = 0.18) {
  line(c, lx - 8, 0, lx - 8, ly, STEEL[2]); line(c, lx + len - 8, 0, lx + len - 8, ly, STEEL[2])
  box(c, lx - 14, ly, len + 12, 7, (x, y) => y === ly ? STEEL[3] : y < ly + 3 ? STEEL[1] : "#f4f8ff")
  poly(c, [lx - 14, ly + 7, lx + len - 2, ly + 7, lx + len + 90, floorY + 120, lx - 106, floorY + 120], (x, y) => bay(x, y) < strength * (1 - (y - ly) / (floorY + 120 - ly)) ? "#fff8e440" : null)
}
function vignette(c, amt) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = ((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2; if (bay(x, y) < (e - 0.55) * amt) P(c, x, y, "#00000080") } }

// ---- garage interior ----
sprite("garage_background", { w: W, h: H }, (c) => {
  const FLOOR = 342
  // ceiling joists
  box(c, 0, 0, W, 40, (x, y) => (x % 120 < 10 ? STEEL[1] : y < 30 ? BLACK[1] : BLACK[2]))
  // walls: cream block upper, green painted dado, yellow divider
  box(c, 0, 40, W, FLOOR - 40, (x, y) => {
    const row = Math.floor((y - 40) / 22), bx = (x + (row & 1) * 22) % 44, mortar = (y - 40) % 22 === 21 || bx === 43
    const lamp = Math.max(...[180, 480, 780].map((lx) => Math.exp(-(((x - lx) / 200) ** 2)))) * clamp(1 - (y - 40) / 420, 0.2, 1)
    if (y > 250) return mortar ? "#1a2a22" : pick(["#1e3028", "#26392f", "#2e4438", "#385242"], 0.35 + lamp * 0.6, x, y)
    if (y >= 246) return AMBER[3]
    return mortar ? "#6a6858" : pick(["#5a5a4e", "#706e60", "#888574", "#a09c88", "#b4b09a"], 0.25 + lamp * 0.75, x, y)
  })
  // clerestory windows (daylight)
  for (let wx = 300; wx < 680; wx += 96) box(c, wx, 56, 84, 40, (x, y) => x < wx + 3 || x > wx + 80 || y < 59 || y > 92 ? STEEL[2] : (x - wx) === 42 ? STEEL[2] : pick(["#7aa4c8", "#a6c8e4", "#d0e4f4"], 0.9 - (y - 59) / 50 + (((x - y) % 23) < 3 ? 0.3 : 0), x, y))
  // poster: abstract wedge car silhouette + sunset stripes (no text)
  box(c, 120, 92, 92, 120, (x, y) => x < 123 || x > 208 || y < 95 || y > 208 ? CREAM[3] : y < 150 ? pick(["#2e2260", "#933a78", "#f28a55", "#fcd06a"], (y - 95) / 55, x, y) : "#1a1030")
  poly(c, [132, 170, 150, 160, 176, 156, 198, 162, 200, 172, 132, 176], RED[3]); poly(c, [152, 160, 174, 157, 182, 163, 156, 165], BLACK[2])
  ell(c, 145, 176, 5, 5, BLACK[0]); ell(c, 190, 176, 5, 5, BLACK[0])
  for (let i = 0; i < 3; i++) box(c, 130, 190 + i * 5, 70, 2, [AMBER[3], RED[3], "#933a78"][i])
  // wall clock (ticks only)
  ell(c, 810, 120, 22, 22, (x, y, nx, ny, d) => d > 0.82 ? BLACK[1] : d > 0.7 ? STEEL[4] : CREAM[3])
  for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; P(c, 810 + Math.cos(a) * 13, 120 + Math.sin(a) * 13, BLACK[1]) }
  line(c, 810, 120, 810, 109, BLACK[1]); line(c, 810, 120, 818, 124, BLACK[1])
  // hose reel + coiled air line on the right wall
  ell(c, 720, 150, 24, 24, (x, y, nx, ny, d) => d < 0.25 ? STEEL[3] : d > 0.85 ? STEEL[1] : (Math.floor(Math.sqrt(d) * 7) & 1) ? "#d4b020" : "#a88a14")
  line(c, 720, 174, 714, 300, "#d4b020", 2)
  // tyre rack on the left wall
  box(c, 20, 140, 6, 200, STEEL[2]); box(c, 92, 140, 6, 200, STEEL[2]); box(c, 20, 210, 78, 4, STEEL[3]); box(c, 20, 280, 78, 4, STEEL[3])
  for (const [ty, n] of [[166, 3], [236, 3], [302, 2]]) for (let i = 0; i < n; i++) ell(c, 37 + i * 22, ty, 12, 42 / 2, (x, y, nx, ny, d) => d < 0.3 ? BLACK[0] : d > 0.82 ? BLACK[1] : pick(BLACK, 0.55 - nx * 0.4, x, y))
  // props
  c.stamp("garage_workbench", 110, FLOOR - 154)
  c.stamp("garage_toolbox", 790, FLOOR - 172 + 10)
  // air compressor (tank + motor) and oil drum
  ell(c, 690, FLOOR - 16, 34, 16, (x, y, nx, ny) => pick(RED, 0.55 - nx * 0.4 - ny * 0.4, x, y)); box(c, 676, FLOOR - 52, 34, 22, lit(STEEL, 0.55, 0.5, 0.4)); ell(c, 693, FLOOR - 41, 7, 7, dome(STEEL, 0.6))
  for (const x of [664, 716]) ell(c, x, FLOOR + 2, 5, 5, dome(BLACK, 0.5))
  box(c, 920, FLOOR - 70, 36, 76, (x, y, u) => ((y - FLOOR + 70) % 24 < 3 ? BLUE[1] : pick(BLUE, 0.7 - u * 0.6, x, y))); ell(c, 938, FLOOR - 70, 18, 4, BLUE[4])
  // floor jack resting at the right edge
  poly(c, [700, FLOOR + 40, 770, FLOOR + 34, 776, FLOOR + 46, 702, FLOOR + 52], lit(RED, 0.55, 0.4, 0.5)); line(c, 702, FLOOR + 44, 650, FLOOR + 6, STEEL[3], 3)
  ell(c, 708, FLOOR + 54, 5, 5, dome(BLACK)); ell(c, 768, FLOOR + 50, 5, 5, dome(BLACK))
  // concrete floor with joints, stains and bay lines (centre kept clear)
  for (let y = FLOOR; y < H; y++) for (let x = 0; x < W; x++) {
    if (c.is(x, y, "*") && y < FLOOR + 60 && (x < 330 || x > 640)) continue
    const t = (y - FLOOR) / (H - FLOOR), lx = (x - 480) / (t + 0.14), z = 1 / (t + 0.06)
    const joint = Math.abs(((lx / 300) % 1 + 1) % 1 - 0.5) > 0.495 || Math.abs((z * 0.8) % 1 - 0.5) > 0.475
    const pool = Math.exp(-(((x - 480) / 300) ** 2) - (((y - 455) / 85) ** 2))
    let col = pick(["#202226", "#2a2c31", "#35383e", "#43464d", "#55585f"], 0.2 + pool * 0.75 + t * 0.1 + (Math.sin(x * 0.05 + y * 0.31) * Math.sin(x * 0.013 - y * 0.07) > 0.7 ? -0.12 : 0), x, y)
    if (joint) col = "#17191c"
    P(c, x, y, col)
  }
  for (const s of [-1, 1]) poly(c, [480 + s * 190, FLOOR + 32, 480 + s * 197, FLOOR + 32, 480 + s * 262, H, 480 + s * 250, H], AMBER[2])
  ell(c, 236, 488, 46, 9, (x, y, nx, ny, d) => bay(x, y) < 0.85 - d ? "#121316" : null); ell(c, 770, 430, 30, 6, (x, y, nx, ny, d) => bay(x, y) < 0.8 - d ? "#141518" : null)
  // re-stamp props that touch the floor so the floor pass doesn't cover them
  c.stamp("garage_toolbox", 790, FLOOR - 172 + 10)
  for (const lx of [160, 460, 760]) fluorescent(c, lx, 44, 64, FLOOR, 0.16)
  vignette(c, 1.4)
})

// ---- car dealership showroom ----
sprite("dealer_showroom", { w: W, h: H }, (c) => {
  const FLOOR = 352
  box(c, 0, 0, W, 34, (x, y) => (y === 33 ? STEEL[3] : (x % 80 === 0 ? "#c8ccd2" : y < 20 ? "#e4e8ec" : "#d8dce2")))     // ceiling panels
  for (let sx = 80; sx < W; sx += 160) ell(c, sx, 30, 8, 3, "#fffbe8")
  // outside view through floor-to-ceiling glass
  box(c, 0, 34, W, FLOOR - 34, (x, y) => {
    if (y < 210) return pick(["#3a7ad0", "#5a96dc", "#86b4e6", "#b4d2f0"], (y - 34) / 190, x, y)
    if (y < 240) { const b = Math.sin(x * 0.02) * 12 + Math.sin(x * 0.051) * 8; return y > 228 - b * 0.3 - ((Math.floor(x / 26) * 7) % 13) ? pick(["#9aa4b4", "#b8c0cc", "#d4d8e0"], 0.5 + Math.sin(x * 0.3) * 0.2, x, y) : pick(["#86b4e6", "#b4d2f0"], 0.9, x, y) }   // low buildings
    if (y < 262) return pick(["#6a8a5a", "#7a9a68"], 0.5, x, y)                                                                         // verge
    if (y < 300) return (y === 281 && x % 40 < 20) ? "#e8e4d8" : pick(["#4a4e56", "#555a62"], 0.5, x, y)                              // street
    return pick(["#9a9890", "#b4b2a8", "#c8c6bc"], 0.6 - (y - 300) / 120, x, y)                                                       // forecourt
  })
  for (const px of [60, 300, 640, 900]) {                                                                                                // palm trees outside
    line(c, px, 262, px + 10, 120, BROWN[2], 4); line(c, px + 1, 262, px + 11, 120, BROWN[3], 1)
    for (let k = 0; k < 7; k++) { const a = -Math.PI + (k / 6) * Math.PI, len = 34 + (k % 2) * 8; for (let t = 0; t < 1; t += 0.02) { const fx = px + 10 + Math.cos(a) * len * t, fy = 120 + Math.sin(a) * len * t * 0.5 + 26 * t * t; P(c, fx, fy, "#2e6a2a"); P(c, fx, fy + 1, "#1e4a1e") } }
  }
  // glass: reflections + mullions
  for (let y = 34; y < FLOOR; y++) for (let x = 0; x < W; x++) if ((((x - y * 0.8) % 140) + 140) % 140 < 18 && bay(x, y) < 0.35) P(c, x, y, "#ffffff60")
  for (let mx = 0; mx <= W; mx += 160) box(c, mx - 4, 34, 8, FLOOR - 34, (x) => x < mx - 1 ? STEEL[5] : x < mx + 2 ? STEEL[4] : STEEL[2])
  box(c, 0, FLOOR - 8, W, 8, (x, y) => y === FLOOR - 8 ? STEEL[5] : STEEL[2])
  // pennant string across the top
  for (const [x0, x1] of [[0, 480], [480, 960]]) for (let i = 0; i < 16; i++) {
    const t = i / 16, x = x0 + (x1 - x0) * t + 15, y = 44 + Math.sin(t * Math.PI) * 26
    poly(c, [x - 8, y, x + 8, y + 1, x, y + 16], [RED[3], AMBER[3], BLUE[3], CREAM[3]][i % 4])
  }
  // glossy chequer floor with window reflections
  for (let y = FLOOR; y < H; y++) for (let x = 0; x < W; x++) {
    const d = y - FLOOR + 20, u = ((x - 480) / d) * 1.4, v = 900 / d
    const sq = d < 34 ? (bay(x, y) < 0.5 ? 1 : 0) : (Math.floor(u) + Math.floor(v)) & 1                                    // far tiles blend
    let col = sq ? pick(["#c8c4bc", "#dcd8d0", "#ece8e0"], 0.7 - (y - FLOOR) / 400, x, y) : pick(["#1e1e24", "#2a2a32", "#36363e"], 0.5, x, y)
    const reflX = ((x % 160) + 160) % 160
    if ((reflX < 5 || reflX > 155) && bay(x, y) < 0.5 * (1 - (y - FLOOR) / 200)) col = sq ? "#b0aca4" : "#4a4a54"           // mullion reflections
    else if (bay(x, y) < 0.18 * (1 - (y - FLOOR) / 190)) col = sq ? "#f6f4ee" : "#4a5a7a"                                     // sky glow
    P(c, x, y, col)
  }
  // sales desk + chair (left), potted plants (corners)
  box(c, 30, FLOOR + 30, 150, 10, lit(WOOD, 0.8, 0.3, 0.3)); box(c, 34, FLOOR + 40, 142, 50, lit(WOOD, 0.5, 0.4, 0.3)); box(c, 40, FLOOR + 46, 130, 1, WOOD[1])
  box(c, 120, FLOOR + 16, 26, 14, lit(CREAM, 0.6)); box(c, 124, FLOOR + 18, 18, 8, "#1a2a1a"); box(c, 60, FLOOR + 22, 30, 4, CREAM[3])   // terminal, papers
  ell(c, 70, FLOOR + 14, 18, 22, (x, y, nx, ny) => y > FLOOR + 22 ? null : pick(BLACK, 0.5 - nx * 0.4, x, y))                             // chair back
  for (const [px, s] of [[900, 1], [215, 0.8]]) {
    box(c, px - 18 * s, FLOOR + 70 * s, 36 * s, 34 * s, lit(["#6a3a1e", "#8a4e2a", "#aa6a3a"], 0.6))                                    // pot
    for (let k = 0; k < 14; k++) { const a = -Math.PI * (0.1 + 0.8 * (k / 13)), len = (40 + (k % 3) * 14) * s; for (let t = 0; t < 1; t += 0.03) { const fx = px + Math.cos(a) * len * t, fy = FLOOR + 70 * s + Math.sin(a) * len * t * 1.3 + 18 * t * t * s; P(c, fx, fy, k % 2 ? "#2e7a32" : "#4a9a3e"); P(c, fx + 1, fy, "#1e5222") } }
  }
  for (let sx = 80; sx < W; sx += 160) poly(c, [sx - 6, 33, sx + 6, 33, sx + 60, FLOOR + 100, sx - 60, FLOOR + 100], (x, y) => bay(x, y) < 0.08 ? "#fffbe830" : null)   // spot cones
  vignette(c, 1.1)
})

// ---- trophy room ----
sprite("career_trophy_room", { w: W, h: H }, (c) => {
  const FLOOR = 380
  box(c, 0, 0, W, 24, (x, y) => (y > 18 ? WOOD[4] : y > 14 ? WOOD[2] : CREAM[1]))                                                        // crown moulding
  box(c, 0, 24, W, FLOOR - 24, (x, y) => {                                                                                               // mahogany panelling
    const board = x % 48, panel = y > 250
    let l = 0.45 + Math.sin(x * 0.9 + Math.sin(y * 0.05) * 3) * 0.06 - (board < 2 ? 0.3 : 0) + (board === 2 ? 0.15 : 0)
    if (panel && (y === 252 || y === 253)) return WOOD[4]
    const spot = Math.max(...[160, 480, 800].map((sx) => Math.exp(-(((x - sx) / 150) ** 2) - (((y - 120) / 160) ** 2))))
    return pick(MAHOG, l + spot * 0.4, x, y)
  })
  // built-in shelves left + right with trophies of all grades
  for (const sx of [24, 676]) {
    box(c, sx, 50, 260, 300, (x, y) => (x < sx + 8 || x > sx + 251 ? pick(WOOD, 0.5, x, y) : pick(MAHOG, 0.15, x, y)))
    for (const sy of [140, 240, 340]) { box(c, sx + 8, sy, 244, 8, lit(WOOD, 0.7, 0.2, 0.6)); box(c, sx + 8, sy + 8, 244, 2, WOOD[0]) }
    box(c, sx, 44, 260, 8, lit(WOOD, 0.8, 0.2, 0.5))
    const shelfItems = [[[GOLD, 0.42], [SILVER, 0.32], [BRONZE, 0.3], [GOLD, 0.36]], [[SILVER, 0.38], [GOLD, 0.48], [BRONZE, 0.34]], [[BRONZE, 0.32], [GOLD, 0.4], [SILVER, 0.3], [GOLD, 0.3]]]
    ;[140, 240, 340].forEach((sy, row) => {
      const items = shelfItems[(row + (sx > 400 ? 1 : 0)) % 3], gap = 244 / items.length
      items.forEach(([M, s], i) => trophy(c, Math.round(sx + 8 + gap * i + gap / 2 - 64 * s), Math.round(sy - 176 * s), s, M))
    })
  }
  // centre wall: crossed chequered flags + framed photos (no text)
  for (const [fx, fy, fw, fh] of [[340, 60, 110, 74], [510, 60, 110, 74]]) {
    box(c, fx, fy, fw, fh, (x, y) => x < fx + 4 || x > fx + fw - 5 || y < fy + 4 || y > fy + fh - 5 ? GOLD[2] : y < fy + 40 ? pick(["#f28a55", "#fcd06a"], (y - fy) / 40, x, y) : "#2a1e34")
    poly(c, [fx + 20, fy + 52, fx + 40, fy + 44, fx + 70, fy + 42, fx + 92, fy + 50, fx + 92, fy + 58, fx + 20, fy + 60], RED[3])
  }
  for (const [bx, tx, dir] of [[392, 522, 1], [568, 438, -1]]) {                                                         // crossed chequered flags
    line(c, bx, 300, tx, 166, STEEL[4], 2); line(c, bx + 1, 300, tx + 1, 166, STEEL[2])
    for (let y = 0; y < 32; y++) for (let x = 0; x < 52; x++) { const px = tx + dir * (x + 2), py = 166 + y + Math.round(Math.sin(x * 0.16) * 2 + x * 0.06); P(c, px, py, (Math.floor(x / 6.5) + Math.floor(y / 6.5)) & 1 ? BLACK[1] : (Math.sin(x * 0.16) > 0.4 ? CREAM[2] : CREAM[3])) }
    ell(c, tx, 164, 3, 3, dome(GOLD, 0.6))
  }
  // spotlights on rails
  box(c, 0, 26, W, 4, STEEL[1])
  for (const sx of [160, 480, 800]) { box(c, sx - 6, 28, 12, 10, STEEL[3]); poly(c, [sx - 6, 38, sx + 6, 38, sx + 110, 380, sx - 110, 380], (x, y) => bay(x, y) < 0.09 ? "#fff4d040" : null) }
  // patterned green carpet with a rug
  for (let y = FLOOR; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (y - FLOOR) / (H - FLOOR), lx = (x - 480) / (t + 0.3), z = 1 / (t + 0.1)
    const diamond = (Math.abs(((lx / 60) % 1 + 1) % 1 - 0.5) + Math.abs(((z * 2) % 1) - 0.5)) < 0.12
    const rug = Math.abs(x - 480) < 160 + t * 180 && t > 0.15 && t < 0.92
    const rugEdge = rug && (Math.abs(x - 480) > 150 + t * 180 || t < 0.19 || t > 0.88)
    P(c, x, y, rugEdge ? GOLD[3] : rug ? pick(RED, 0.35 + (diamond ? 0.2 : 0), x, y) : pick(["#0e2418", "#163222", "#1e402c"], 0.5 + (diamond ? 0.3 : 0) - t * 0.2, x, y))
  }
  box(c, 0, FLOOR - 10, W, 10, lit(WOOD, 0.6, 0, 0.8))                                                                                     // skirting
  vignette(c, 1.3)
})
