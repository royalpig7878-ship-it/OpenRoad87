// OPEN ROAD '87 menu backgrounds (960x540). Composites the built sky / car / fx art with
// procedurally drawn pseudo-3D roads and menu scenes.  Run: node menus.mjs  -> out/menus/*.png
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import fs from "node:fs"

const W = 960, H = 540, HZ = 262
const sky = await loadProject("sky.px.js"), fx = await loadProject("fx.px.js"), traffic = await loadProject("traffic.px.js")

// ---------------- pixel helpers ----------------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const hex = (s) => { s = s.replace("#", ""); if (s.length === 6) s += "ff"; return parseInt(s, 16) >>> 0 }
const img = (w = W, h = H, fill = 0) => ({ w, h, data: new Uint32Array(w * h).fill(fill) })
const copy = (src) => ({ w: src.w, h: src.h, data: new Uint32Array(src.data) })
function put(im, x, y, c) {
  x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= im.w || y >= im.h) return
  if (typeof c === "string") c = hex(c)
  const a = c & 255; if (!a) return
  const i = y * im.w + x
  if (a === 255) { im.data[i] = c; return }
  const d = im.data[i], f = a / 255, ch = (v, k) => (v >>> k) & 255
  const da = d & 255, oa = Math.round(255 * (f + (da / 255) * (1 - f)))
  im.data[i] = ([24, 16, 8].reduce((o, k) => o | (Math.round(ch(c, k) * f + ch(d, k) * (1 - f)) << k), 0) | oa) >>> 0
}
function blit(dst, src, ox, oy, o = {}) {
  const s = o.scale ?? 1, map = o.map && new Map(Object.entries(o.map).map(([a, b]) => [hex(a), hex(b)]))
  for (let y = 0; y < src.h * s; y++) for (let x = 0; x < src.w * s; x++) {
    const sx = o.flip ? src.w - 1 - Math.floor(x / s) : Math.floor(x / s)
    let v = src.data[Math.floor(y / s) * src.w + sx]
    if (!(v & 255)) continue
    if (map?.has(v)) v = map.get(v)
    if (o.tint) v = o.tint(v, ox + x, oy + y)
    if (v) put(dst, ox + x, oy + y, v)
  }
}
const frame = (proj, name, i) => proj.frames(name)[i].img
function inPoly(x, y, pts) { let inside = false; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside } return inside }
function poly(im, pts, colAt) {
  const xs = pts.filter((_, i) => !(i & 1)), ys = pts.filter((_, i) => i & 1)
  for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++)
    if (inPoly(x + 0.5, y + 0.5, pts)) { const c = typeof colAt === "function" ? colAt(x, y) : colAt; if (c) put(im, x, y, c) }
}
const rect = (im, x, y, w, h, colAt) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const c = typeof colAt === "function" ? colAt(i, j) : colAt; if (c) put(im, i, j, c) } }
function line(im, x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) put(im, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c) }
function ellipse(im, cx, cy, rx, ry, colAt) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (d <= 1) { const c = colAt(x, y, d); if (c) put(im, x, y, c) } } }
const grad = (stops, t, x, y) => { const n = stops.length, f = clamp(t, 0, 1) * (n - 1), i = Math.floor(f), fr = f - i; return i >= n - 1 ? stops[n - 1] : fr > bay(x, y) ? stops[i + 1] : stops[i] }
function vignette(im, amt, col = "#000000") { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = ((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2; if (bay(x, y) < (e - 0.55) * amt) put(im, x, y, col + "90") } }

// ---------------- pseudo-3D road ----------------
// cx(t): road centre at screen row (t = 0 horizon .. 1 bottom); k: half-width per pixel below horizon
function road(im, R) {
  for (let y = HZ + 1; y < H; y++) {
    const d = y - HZ, t = d / (H - HZ), z = 2600 / d, seg = Math.floor(z / 7 + (R.phase ?? 0)) & 1
    const cx = R.cx(t), hw = d * R.k, haze = clamp(1 - d / R.hazeD, 0, 1)
    for (let x = 0; x < W; x++) {
      const ad = Math.abs(x - cx); let c = null
      if (ad < hw) {
        c = grad(R.asphalt, 0.5 + (seg ? 0.15 : -0.15) + (bay(x * 3, y) - 0.5) * 0.4, x, y)
        if (ad > hw * 0.86 && ad < hw * 0.9) c = R.edge                                                     // solid edge line
        if (ad < Math.max(0.6, hw * 0.022) && seg === 0 && d > 3) c = R.line                                 // dashed centre
      } else if (ad < hw * 1.13) c = seg ? R.rumble[0] : R.rumble[1]
      else if (R.grass) { c = seg ? R.grass[0] : R.grass[1]; if (((x * 5 + y * 3) % 17) === 0 && bay(x, y) < 0.5) c = R.grass[2] ?? c }
      if (!c) continue
      if (d < 10 && R.grass) c = R.grass[2] ?? R.grass[0]
      if (haze > 0 && bay(x, y) < haze * 0.85) c = R.haze
      put(im, x, y, c)
    }
  }
}
function posts(im, R, n = 9) {
  for (let i = 0; i < n; i++) {
    const z = 20 + i * 28 - (R.phase ?? 0) * 28, d = 2600 / z, y = Math.round(HZ + d)
    if (y >= H || d < 6) continue
    const t = d / (H - HZ), hw = d * R.k, ph = Math.max(4, Math.round(d * 0.2)), pw = Math.max(1, Math.round(d * 0.025))
    for (const s of [-1, 1]) {
      const x = Math.round(R.cx(t) + s * hw * 1.3)
      rect(im, x, y - ph, pw, ph, (i2, j) => (j - (y - ph)) < Math.max(1, ph * 0.18) ? R.reflector : i2 === x ? R.postLit : R.post)
    }
  }
}

// ---------------- scenes ----------------
const OUT = "out/menus"; fs.mkdirSync(OUT, { recursive: true })
const save = (name, im) => { writePng(`${OUT}/${name}.png`, im); console.log(name, im.w + "x" + im.h) }

// TITLE: sunset mountain highway, red exotic lower-right, open sky upper-left for the logo
{
  const im = copy(sky.image("sky_sunset"))
  const R = { cx: (t) => 560 + 250 * t ** 1.7, k: 1.32, hazeD: 46, haze: "#c2607a", asphalt: ["#2a1e34", "#33263f", "#3e2f4a"], edge: "#e8d8c8", line: "#ffd060",
    rumble: ["#e83a30", "#f2e8dc"], grass: ["#3c1f3c", "#4a2848", "#5f3156"], post: "#c8b8c0", postLit: "#fff2e0", reflector: "#ff7a3a" }
  road(im, R); posts(im, R, 8)
  // sun glare on the asphalt
  for (let y = HZ + 2; y < H; y++) { const t = (y - HZ) / (H - HZ), cx = R.cx(t), hw = (y - HZ) * R.k * 0.5; for (let x = Math.round(cx - hw); x < cx + hw; x++) if (bay(x, y) < (1 - t) * 0.35 * (1 - Math.abs(x - cx) / hw)) put(im, x, y, "#ff9a5a80") }
  const car = traffic.image("traffic_sports_car"), S = 2, cx0 = 742, by = 528
  const RED = { "#0a3a38": "#3a0608", "#13675f": "#7a0e12", "#22968a": "#b8161c", "#46c4b4": "#ee3c30", "#a4f0e4": "#ffa088" }
  ellipse(im, cx0 + 6, by - 22, 190, 26, (x, y, d) => bay(x, y) < (1 - d) * 1.6 ? "#12081cc0" : null)                // contact shadow
  blit(im, car, Math.round(cx0 - (car.w * S) / 2), by - car.h * S + 8, { scale: S, flip: true, map: RED,
    tint: (v, x, y) => { const r = v >>> 24, g = (v >>> 16) & 255, b = (v >>> 8) & 255                                       // warm sunset rim on upward-facing light pixels
      return (r + g + b > 520 && bay(x, y) < 0.5) ? ((Math.min(255, r + 10) << 24 | Math.max(0, g - 30) << 16 | Math.max(0, b - 50) << 8 | 255) >>> 0) : v } })
  save("menu_title_background", im)
}

// ARCADE: bright daytime straight highway
{
  const im = copy(sky.image("sky_day"))
  const R = { cx: () => 480, k: 1.3, hazeD: 40, haze: "#bcd5ec", asphalt: ["#4a4e56", "#555a62", "#60656e"], edge: "#f4f4f0", line: "#f4f4f0",
    rumble: ["#d8281c", "#f4f4f0"], grass: ["#5c8a3c", "#6c9a48", "#7a9668"], post: "#d8d8d8", postLit: "#ffffff", reflector: "#ff4a2a" }
  road(im, R); posts(im, R)
  save("menu_arcade_background", im)
}

// CAREER: night highway under headlights, distant town lights
{
  const im = copy(sky.image("sky_night"))
  const R = { cx: () => 480, k: 1.25, hazeD: 30, haze: "#1a2236", asphalt: ["#14181f", "#1a1f28", "#212734"], edge: "#8a8e96", line: "#c8a040",
    rumble: ["#5a1414", "#6a6e76"], grass: ["#0b1210", "#0e1714", "#141b2a"], post: "#4a4e58", postLit: "#6a6e78", reflector: "#ffb040" }
  road(im, R); posts(im, R)
  blit(im, fx.image("fx_headlight_glow"), 0, 0)
  save("menu_career_background", im)
}

// GAME OVER: storm, empty wet road, skid marks veering off, smoke at the verge, rain
{
  const im = copy(sky.image("sky_storm"))
  const R = { cx: () => 480, k: 1.3, hazeD: 50, haze: "#646b6f", asphalt: ["#262b30", "#2c3237", "#343b41"], edge: "#9aa0a4", line: "#b8a868",
    rumble: ["#6a2a26", "#8a8e90"], grass: ["#2a3530", "#303c36", "#3a4640"], post: "#7a8084", postLit: "#a0a6aa", reflector: "#c04a2a" }
  road(im, R); posts(im, R)
  for (let y = HZ + 20; y < H; y++) for (let x = 0; x < W; x++) {                                                   // wet sheen: sky reflected
    const ad = Math.abs(x - 480), hw = (y - HZ) * R.k
    if (ad < hw * 0.85 && ((x * 7 + y * 13) % 23) < 2 && bay(x, y) < 0.5) put(im, x, y, "#5a626a")
  }
  for (const off of [-46, 46]) for (let y = H - 1; y > 330; y--) {                                                 // skid marks curving to the right verge
    const t = (H - y) / (H - 330), x = 420 + off * (1 - t * 0.5) + 330 * t * t
    for (let k = -4; k <= 4; k++) if (bay(Math.round(x + k), y) < 0.75 - Math.abs(k) / 8) put(im, x + k, y, "#101317d0")
  }
  const smoke = frame(fx, "fx_crash_smoke", 3)
  blit(im, smoke, 690, 236, { scale: 2 })
  blit(im, frame(fx, "fx_rain_overlay", 0), 0, 0)
  vignette(im, 1.1, "#1a0404")
  save("menu_game_over", im)
}

// RESULTS: sunset finish line with chequered gantry (no lettering)
{
  const im = copy(sky.image("sky_sunset"))
  const R = { cx: () => 480, k: 1.3, hazeD: 44, haze: "#c2607a", asphalt: ["#2a1e34", "#33263f", "#3e2f4a"], edge: "#e8d8c8", line: "#ffd060",
    rumble: ["#e83a30", "#f2e8dc"], grass: ["#3c1f3c", "#4a2848", "#5f3156"], post: "#c8b8c0", postLit: "#fff2e0", reflector: "#ff7a3a" }
  road(im, R); posts(im, R)
  const fy = 372, d = fy - HZ, hw = d * R.k                                                                      // chequered line across the road
  for (let y = fy; y < fy + 14; y++) { const dd = y - HZ, h2 = dd * R.k; for (let x = Math.round(480 - h2); x < 480 + h2; x++) put(im, x, y, (Math.floor(((x - 480) / h2) * 8 + 8) + Math.floor((y - fy) / 7)) & 1 ? "#f2eee6" : "#16121c") }
  const px0 = Math.round(480 - hw * 1.25), px1 = Math.round(480 + hw * 1.25), top = 150
  for (const px of [px0, px1]) rect(im, px - 6, top, 12, fy - top, (x) => x < px - 2 ? "#5a5868" : x < px + 2 ? "#8a8898" : "#3a3848")    // gantry legs
  rect(im, px0 - 8, top - 6, px1 - px0 + 16, 10, (x, y) => y < top - 2 ? "#a8a6b4" : "#4a4858")                                          // crossbeam
  rect(im, px0 + 18, top + 8, px1 - px0 - 36, 40, (x, y) => (Math.floor((x - px0) / 10) + Math.floor((y - top) / 10)) & 1 ? "#f2eee6" : "#16121c")   // chequered banner
  rect(im, px0 + 18, top + 4, px1 - px0 - 36, 4, "#2a2838")
  for (let x = px0 + 24; x < px1 - 20; x += 22) { rect(im, x, top - 1, 6, 4, "#ffd36a"); ellipse(im, x + 3, top + 1, 7, 5, (xx, yy, dd) => bay(xx, yy) < (1 - dd) * 0.6 ? "#ffb04090" : null) }
  save("menu_results", im)
}

// GARAGE: workshop interior, empty lit bay in the centre for the car
{
  const im = img(W, H, hex("#000000"))
  const FLOOR = 336
  rect(im, 0, 0, W, FLOOR, (x, y) => {                                                                            // block wall
    const row = Math.floor(y / 24), bx = (x + (row & 1) * 24) % 48, mortar = y % 24 === 23 || bx === 47
    const lamp = Math.max(...[240, 480, 720].map((lx) => Math.exp(-(((x - lx) / 170) ** 2)))) * clamp(1 - y / 420, 0, 1)
    return mortar ? grad(["#15171c", "#1f2229"], lamp, x, y) : grad(["#1f222a", "#2a2e37", "#363b46", "#454b57"], 0.15 + lamp * 0.9 - (y % 24 === 0 ? -0.15 : 0), x, y)
  })
  rect(im, 290, 96, 380, FLOOR - 96, (x, y) => {                                                                  // roller door
    if (x < 296 || x > 663 || y < 102) return x < 293 || x > 666 || y < 99 ? "#2c2f36" : "#6b7079"
    const s = (y - 102) % 9
    return s === 0 ? "#8f949d" : s === 8 ? "#25272d" : grad(["#3a3e46", "#4a4e57", "#5a5f69"], 0.75 - (y - 102) / 360 - (s / 18), x, y)
  })
  rect(im, 470, FLOOR - 26, 20, 6, "#25272d"); rect(im, 472, FLOOR - 25, 16, 2, "#8f949d")                     // door handle
  rect(im, 0, FLOOR - 10, W, 10, (x, y) => (Math.floor((x + y) / 12) & 1) ? "#f4b020" : "#18181c")              // hazard stripe skirting
  rect(im, 40, 112, 210, 150, (x, y) => (x < 43 || x > 246 || y < 115 || y > 258) ? "#3a2a1a" : ((x - 44) % 10 === 5 && (y - 116) % 10 === 5) ? "#2a1c10" : grad(["#5a3e24", "#6a4a2c", "#7a5834"], 0.6 - (y - 112) / 300, x, y))   // pegboard
  const tool = (pts, c) => poly(im, pts, (x, y) => (x + y) % 7 === 0 ? "#d4d8de" : c)
  tool([60, 130, 66, 130, 66, 210, 60, 210], "#8f949d"); poly(im, [56, 126, 70, 126, 70, 136, 56, 136], "#b8bcc4")                    // wrench-ish
  tool([90, 140, 96, 140, 96, 230, 90, 230], "#8f949d"); poly(im, [84, 132, 102, 132, 102, 144, 84, 144], "#6b7079")                 // hammer
  tool([118, 150, 122, 150, 122, 200, 118, 200], "#b8bcc4"); poly(im, [115, 200, 125, 200, 125, 240, 115, 240], "#d02a24")            // screwdriver
  tool([146, 150, 150, 150, 150, 200, 146, 200], "#b8bcc4"); poly(im, [143, 200, 153, 200, 153, 240, 143, 240], "#f4a62a")
  for (let i = 0; i < 4; i++) tool([174 + i * 16, 130, 180 + i * 16, 130, 180 + i * 16, 170 + i * 12, 174 + i * 16, 170 + i * 12], "#8f949d")   // spanner set
  rect(im, 700, 120, 220, 6, "#6b7079"); rect(im, 700, 190, 220, 6, "#6b7079"); rect(im, 704, 126, 4, 120, "#4a4e57"); rect(im, 912, 126, 4, 120, "#4a4e57")   // shelving
  ;[[712, "#d02a24"], [736, "#f4a62a"], [760, "#2e64d8"], [800, "#d02a24"], [824, "#e8dcc0"], [870, "#f4a62a"]].forEach(([x, c], i) => { rect(im, x, 96 - (i % 2) * 6 + 0, 18, 24 + (i % 2) * 6, (xx) => xx === x ? "#ffffff60" : c); rect(im, x + 5, 92 - (i % 2) * 6, 8, 4, "#25272d") })
  ;[[720, 168], [770, 168], [850, 172]].forEach(([x, y]) => { rect(im, x, y, 36, 22, "#3a2a1a"); rect(im, x, y, 36, 3, "#5a3e24") })   // boxes
  for (let i = 0; i < 4; i++) ellipse(im, 830, FLOOR - 14 - i * 22, 46, 13, (x, y, d) => d < 0.28 ? "#25272d" : d > 0.82 ? "#0e0e10" : grad(["#1c1c20", "#2c2c32", "#44444c"], 0.7 - (y - (FLOOR - 27 - i * 22)) / 30, x, y))   // tyre stack
  rect(im, 788, FLOOR - 14 - 3 * 22, 85, 3 * 22, (x, y) => x < 792 || x > 868 ? null : (x + y) % 9 === 0 ? "#2c2c32" : "#1c1c20")
  for (let i = 0; i < 4; i++) ellipse(im, 830, FLOOR - 14 - i * 22 - 11, 46, 13, (x, y, d) => d < 0.28 ? "#141416" : d > 0.85 ? "#0e0e10" : grad(["#2c2c32", "#44444c", "#5c5c66"], 0.6, x, y))
  rect(im, 0, FLOOR, W, H - FLOOR, (x, y) => {                                                                    // concrete floor
    const t = (y - FLOOR) / (H - FLOOR), z = 1 / (t + 0.05), lx = (x - 480) / (t + 0.12)
    const joint = Math.abs(((lx / 260) % 1 + 1) % 1 - 0.5) > 0.494 || Math.abs((z * 0.9) % 1 - 0.5) > 0.47
    const pool = Math.exp(-(((x - 480) / 330) ** 2) - (((y - 450) / 80) ** 2))
    const refl = [240, 480, 720].some((lx2) => Math.abs(x - lx2) < 10 * (1 - t * 0.5) && bay(x, y) < 0.3 * (1 - t) * (1 - Math.abs(x - lx2) / 10))
    let c = grad(["#16181c", "#1f2228", "#2a2d34", "#3a3e46", "#4c515a"], 0.18 + pool * 0.85 + t * 0.12, x, y)
    if (joint) c = "#121418"
    if (refl) c = "#5a5f69"
    return c
  })
  for (const s of [-1, 1]) poly(im, [480 + s * 175, 386, 480 + s * 181, 386, 480 + s * 236, 520, 480 + s * 226, 520], "#d8a020")       // bay lines
  ellipse(im, 760, 470, 40, 9, (x, y, d) => bay(x, y) < 0.8 - d ? "#0c0d10" : null)                                          // oil stain
  for (const lx of [240, 480, 720]) {                                                                              // fluorescent fixtures + light cones
    rect(im, lx - 60, 16, 120, 10, (x, y) => y === 16 ? "#6b7079" : y < 19 ? "#3a3e46" : "#f6f8ff")
    poly(im, [lx - 58, 26, lx + 58, 26, lx + 190, FLOOR + 140, lx - 190, FLOOR + 140], (x, y) => bay(x, y) < 0.22 * (1 - (y - 26) / 460) ? "#fff6dc50" : null)
  }
  vignette(im, 1.6)
  save("menu_garage_background", im)
}

// VEHICLE SELECT: neon showroom with a turntable for the car sprite
{
  const im = img(W, H, hex("#000000")), HZ2 = 300
  rect(im, 0, 0, W, HZ2, (x, y) => grad(["#07040f", "#0e0820", "#1a0e30", "#2a1442", "#43205a"], y / HZ2, x, y))
  const far = sky.image("sky_sunset_layer_far")                                                                   // mountain silhouettes, recoloured
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = far.data[y * W + x], yy = y + (HZ2 - HZ); if (!(v & 255) || yy >= HZ2) continue
    const above = y > 0 && (far.data[(y - 1) * W + x] & 255)
    put(im, x, yy, above ? grad(["#170a26", "#22103a"], 0.5 - (y - 150) / 200, x, yy) : "#ff4ab0")
  }
  for (let y = HZ2 - 3; y <= HZ2; y++) rect(im, 0, y, W, 1, y === HZ2 ? "#ffd0f0" : "#ff4ab080")
  rect(im, 0, HZ2 + 1, W, H - HZ2 - 1, (x, y) => {                                                                 // neon grid floor
    const d = y - HZ2 + 0.5, u = ((x + 0.5 - 480) / d) * 1.6, v = 1600 / d
    const lineX = Math.abs(u - Math.round(u)) * (d / 1.6) < 0.7
    const lineZ = (d * d) / 1600 > 3.5 && Math.abs(v - Math.round(v)) / (1600 / (d * d)) < 0.6
    const fade = clamp(d / 140, 0, 1)
    if (lineZ) return d > 110 ? "#ff6ad0" : d > 45 ? "#c02a9a" : d > 18 ? "#82206e" : "#55184a"
    if (d < 14 && bay(x, y) < (1 - d / 14) * 0.6) return "#6a1a5a"
    return grad(["#0c0616", "#120a20", "#1a0e2c"], 0.7 - d / 300, x, y)
  })
  for (let n = -100; n <= 100; n++) {                                                                               // receding grid lines
    const x0 = 480 + (n * 8) / 1.6, x1 = 480 + (n * (H - HZ2)) / 1.6, y0 = HZ2 + 8, steps = Math.ceil(Math.max(Math.abs(x1 - x0), H - y0) * 2)
    for (let i = 0; i <= steps; i++) { const y = y0 + ((H - y0) * i) / steps, d = y - HZ2, x = x0 + ((x1 - x0) * i) / steps
      if (x >= 0 && x < W) put(im, x, y, d > 110 ? "#ff6ad0" : d > 45 ? "#c02a9a" : d > 18 ? "#82206e" : "#55184a") }
  }
  for (const sx of [70, 890]) poly(im, [sx - 12, 0, sx + 12, 0, 480 + (sx - 480) * 0.18 + 160, 470, 480 + (sx - 480) * 0.18 - 160, 470], (x, y) => bay(x, y) < 0.16 * (y / 470) ? "#ffe8ff50" : null)  // spotlights
  const CX = 480, CY = 440, RX = 300, RY = 60
  ellipse(im, CX, CY + 20, RX, RY, (x, y) => y > CY + 2 ? grad(["#101016", "#1c1d24", "#2a2c34"], 0.6 - Math.abs(x - CX) / RX, x, y) : null)   // platform side
  for (let x = CX - RX + 20; x < CX + RX - 20; x += 20) { const yy = CY + 20 + RY * Math.sqrt(1 - ((x - CX) / RX) ** 2) - 10; rect(im, x - 2, yy - 1, 4, 2, "#ffb030"); ellipse(im, x, yy, 6, 4, (xx, y2, d) => bay(xx, y2) < (1 - d) * 0.5 ? "#ffb03080" : null) }
  ellipse(im, CX, CY, RX, RY, (x, y, d) => {                                                                       // turntable top
    const ring = Math.abs(Math.sqrt(d) * 9 % 1 - 0.5) > 0.44
    if (d > 0.96) return "#c8ccd4"
    return ring ? "#2a2c34" : grad(["#2a2c34", "#3a3d46", "#4c505a", "#686c78"], 0.2 + (1 - d) * 0.5 - (y - CY) / 200 + (bay(x, y) - 0.5) * 0.1, x, y)
  })
  ellipse(im, CX, CY - 4, RX * 0.7, RY * 0.55, (x, y, d) => bay(x, y) < (1 - d) * 0.3 ? "#fff0ff40" : null)       // spot pool
  vignette(im, 1.4)
  save("menu_vehicle_select", im)
}

// PAUSE: translucent dark overlay with CRT scanlines (sits over the frozen game frame)
{
  const im = img()
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = ((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2
    const a = (y & 1 ? 0xb0 : 0x90) + (bay(x, y) < (e - 0.5) * 0.8 ? 0x30 : 0)
    im.data[y * W + x] = (hex("#0a0a10") & 0xffffff00 | Math.min(0xe8, a)) >>> 0
  }
  for (const y of [40, H - 41]) for (let x = 40; x < W - 40; x++) im.data[y * W + x] = hex(x % 6 < 3 ? "#d87a14" : "#5a2a06")   // amber cue lines
  save("menu_pause", im)
}
