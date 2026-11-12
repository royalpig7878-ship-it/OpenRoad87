// OPEN ROAD '87 weather + visual effects. Transparent backgrounds; alpha uses a few fixed steps (crisp pixel art).
// Strips are horizontal: frame i occupies x = i*w .. i*w+w-1.

pal({ k: "#000000" })

const VW = 960, VH = 540, HZ = 262, VPX = 480                    // screen size + horizon / vanishing point (matches sky.json)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s) }
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const A = ["", "30", "50", "70", "90", "b0", "d0", "ff"]                     // alpha steps
const P = (c, x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, col) }
// alpha level 0..1 -> dithered between neighbouring alpha steps
const aStep = (v, x, y) => { const f = clamp(v, 0, 1) * (A.length - 1), i = Math.floor(f); return Math.min(A.length - 1, f - i > bay(x, y) ? i + 1 : i) }

// ---------------- rain ----------------
function streaks(c, R, n, seed, o) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const x0 = r() * (VW + 300), s0 = r(), len = o.len[0] + r() * (o.len[1] - o.len[0]), near = r() < o.near
    const p = (s0 + c.phase * o.speed) % 1, y = p * (VH + len) - len, x = x0 - (y + len) * o.slope
    for (let k = 0; k <= len; k++) {
      const yy = y + k, xx = x - k * o.slope, t = k / len                                  // tail (t=0) faint, head bright
      const col = t > 0.8 ? o.head : o.body
      const a = Math.max(1, Math.round((near ? 4 : 2) * (0.4 + 0.6 * t)))
      P(c, ((xx % VW) + VW) % VW, yy, col + A[a])
      if (near) P(c, ((xx + 1) % VW + VW) % VW, yy, o.body + A[Math.max(1, a - 2)])
    }
  }
}
function droplet(c, x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dy * 1.1) / (r + 0.3); if (d > 1) continue
    const l = -(dx + dy) / (r * 2)                                                          // light from upper-left
    const col = d > 0.75 && dx + dy > 0 ? "#2e4258" + A[4] : l > 0.35 && d < 0.6 ? "#ffffff" + A[6] : d > 0.75 ? "#c8d8ec" + A[3] : "#9ab4cc" + A[2]
    P(c, x + dx, y + dy, col)
  }
  if (r >= 2) P(c, x - Math.floor(r / 2), y - Math.floor(r / 2), "#ffffff" + A[7])
}
function beads(c, n, seed, life, maxR) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * VW), y = Math.floor(r() * VH), born = Math.floor(r() * 8), rr = 1 + Math.floor(r() * maxR)
    const age = (c.frame - born + 8) % 8
    if (age < life) droplet(c, x, y, age === 0 ? Math.max(1, rr - 1) : rr)                // pops in small, then holds
  }
}
anim("fx_rain_overlay", { w: VW, h: VH, frames: 8, fps: 16 }, (c) => {
  streaks(c, null, 170, 11, { len: [14, 30], slope: 0.32, speed: 1, near: 0.12, body: "#b4c6da", head: "#eef4ff" })
  streaks(c, null, 120, 12, { len: [6, 12], slope: 0.32, speed: 2, near: 0, body: "#8fa4bc", head: "#c8d6e6" })       // distant, faster loop
  beads(c, 90, 13, 5, 2)
})
// windshield water: settled beads + rivulets sliding down (slow, 8-frame loop)
anim("fx_rain_splashes", { w: VW, h: VH, frames: 8, fps: 8 }, (c) => {
  const r = rng(21)
  for (let i = 0; i < 260; i++) { const x = Math.floor(r() * VW), y = Math.floor(r() * VH), rr = r() < 0.15 ? 3 : r() < 0.5 ? 2 : 1; if (hash(i, c.frame >> 2) > 0.08) droplet(c, x, y, rr) }
  const q = rng(22)
  for (let i = 0; i < 16; i++) {
    const x0 = Math.floor(q() * VW), y0 = Math.floor(q() * (VH - 160)), run = 90 + q() * 70, s0 = q()
    const p = (s0 + c.phase) % 1, y = y0 + p * run, wob = (k) => Math.round(Math.sin((y0 + k) * 0.09 + i) * 1.5)
    for (let k = y0; k < y; k++) P(c, x0 + wob(k), k, "#a8c0d8" + A[(k & 1) ? 2 : 3])           // wet trail
    droplet(c, x0 + wob(y), Math.round(y) + 2, 3)
  }
})

// ---------------- fog ----------------
sprite("fx_fog_overlay", { w: VW, h: VH }, (c) => {
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const dy = y - (HZ + 8)
    const base = dy < 0 ? Math.exp(-((dy / 50) ** 2)) * 0.9 : 0.12 + 0.72 * Math.exp(-((dy / 120) ** 2))
    const n = 0.18 * Math.sin((2 * Math.PI * 3 * x) / VW + y * 0.03) + 0.12 * Math.sin((2 * Math.PI * 7 * x) / VW - y * 0.07) + 0.06 * Math.sin((2 * Math.PI * 19 * x) / VW + y * 0.2)
    const f = base * (1 + n)
    const a = aStep(f * 0.8, x, y)
    if (a > 0) c.px(x, y, (f > 0.75 ? "#dfe3e6" : f > 0.45 ? "#c9ced3" : "#b4bac1") + A[a])
  }
})

// ---------------- puffs (dust / smoke) ----------------
function puff(c, x, y, r, ramp, fade, seed) {
  for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
    const ang = Math.atan2(dy, dx), re = r * (0.82 + 0.12 * Math.sin(ang * 5 + seed) + 0.06 * Math.sin(ang * 11 + seed * 2))
    const d = Math.hypot(dx, dy) / re; if (d > 1) continue
    const px = Math.round(x + dx), py = Math.round(y + dy)
    if (bay(px, py) < fade) continue                                                       // dissolve
    const l = -(dx * 0.6 + dy * 0.8) / re + (1 - d) * 0.3
    const i = clamp(Math.floor((l + 0.9) * 1.6 + (bay(px + 1, py) - 0.5) * 0.6), 0, ramp.length - 1)
    P(c, px, py, ramp[i])
  }
}
function plume(c, o) {
  const r = rng(o.seed), ps = []
  for (let i = 0; i < o.n; i++) ps.push({ b: i / o.n + r() * 0.05, lat: r() * 2 - 1, wob: r() * 6, sz: 0.8 + r() * 0.4 })
  const live = ps.map((p) => ({ ...p, a: (c.phase + p.b) % 1 })).sort((u, v) => v.a - u.a)  // oldest (back) first
  for (const p of live) {
    const a = p.a, x = o.x + p.lat * o.spread * a + o.drift * a + Math.sin(a * 6 + p.wob) * 3, y = o.y - o.rise * a
    puff(c, x, y, Math.max(2, Math.round((o.r0 + o.r1 * a) * p.sz)), o.ramp, Math.max(0, (a - o.fadeAt) / (1 - o.fadeAt)), p.wob)
  }
  if (o.grit) { const g = rng(o.seed + 5); for (let i = 0; i < o.grit; i++) { const b = g(), a = (c.phase + b) % 1, vx = (g() * 2 - 1) * 50, vy = -30 - g() * 40
    const x = o.x + vx * a, y = o.y + vy * a + 90 * a * a; if (a < 0.8) P(c, x, y, o.gritCol[Math.floor(g() * o.gritCol.length)]) } }
}
const DUST = ["#5e4a32c0", "#7e6646c0", "#a08660c0", "#c4ac84c0", "#e0cca6c0"]
const TIRE = ["#7e838ab0", "#a2a7adb0", "#c4c8ccb0", "#e0e3e6b0", "#f6f7f8b0"]
const SMOKE = ["#141212d8", "#262321d8", "#3a3633d8", "#524d48d8", "#6e6862d8"]
anim("fx_dust", { w: 128, h: 96, frames: 8, fps: 12 }, (c) => plume(c, { seed: 31, n: 9, x: 52, y: 84, spread: 26, drift: 26, rise: 46, r0: 6, r1: 16, fadeAt: 0.45, ramp: DUST, grit: 14, gritCol: ["#4a3a26", "#8a7250"] }))
anim("anim_dust", { w: 128, h: 96, frames: 6, fps: 12 }, (c) => plume(c, { seed: 31, n: 9, x: 52, y: 84, spread: 26, drift: 26, rise: 46, r0: 6, r1: 16, fadeAt: 0.45, ramp: DUST, grit: 14, gritCol: ["#4a3a26", "#8a7250"] }))
anim("fx_tire_smoke", { w: 128, h: 96, frames: 8, fps: 12 }, (c) => plume(c, { seed: 41, n: 10, x: 40, y: 86, spread: 18, drift: 50, rise: 40, r0: 7, r1: 20, fadeAt: 0.5, ramp: TIRE }))
anim("fx_crash_smoke", { w: 128, h: 128, frames: 8, fps: 10 }, (c) => plume(c, { seed: 51, n: 10, x: 62, y: 112, spread: 16, drift: 14, rise: 84, r0: 8, r1: 22, fadeAt: 0.55, ramp: SMOKE, grit: 6, gritCol: ["#ff7a20", "#ffc040"] }))

// ---------------- sparks / impact ----------------
const SPARK = (t) => t < 0.2 ? "#ffffff" : t < 0.45 ? "#fff07a" : t < 0.7 ? "#ffb030" : "#ff5a20"
function sparks(c, t, n, scale, seed, cx = 64, cy = 64) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2, v = (30 + r() * 50) * scale, life = 0.6 + r() * 0.5, tt = t / life
    if (tt > 1 || tt <= 0) continue
    const pos = (u) => [cx + Math.cos(th) * v * u, cy + Math.sin(th) * v * u * 0.8 + 40 * u * u]
    const [x0, y0] = pos(Math.max(0, tt - 0.12)), [x1, y1] = pos(tt)
    c.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), SPARK(tt))
    P(c, x1, y1, tt < 0.5 ? "#ffffff" : "#fff07a")
  }
}
function flash(c, r, cx = 64, cy = 64) {
  for (let y = -r * 2; y <= r * 2; y++) for (let x = -r * 2; x <= r * 2; x++) {
    const ang = Math.atan2(y, x), star = r * (1 + 0.9 * Math.pow(Math.abs(Math.cos(ang * 4)), 8)), d = Math.hypot(x, y)
    if (d > star * 1.4) continue
    const col = d < r * 0.55 ? "#ffffff" : d < r * 0.9 ? "#fff6c0" : d < star ? "#ffd040" : bay(cx + x, cy + y) < 0.5 ? "#ff8a20" + A[5] : null
    if (col) P(c, cx + x, cy + y, col)
  }
}
function ring(c, r, w, cx = 64, cy = 64) {
  for (let y = -r - w; y <= r + w; y++) for (let x = -r - w; x <= r + w; x++) {
    const d = Math.hypot(x, y * 1.2) - r
    if (Math.abs(d) <= w) P(c, cx + x, cy + y, Math.abs(d) < w * 0.4 ? "#fff6c0" : bay(cx + x, cy + y) < 0.5 ? "#ffb030" : "#ff6a20" + A[5])
  }
}
function smokeBurst(c, s, seed) {
  const r = rng(seed), fade = clamp((s - 0.45) / 0.55, 0, 0.95)
  for (let i = 0; i < 7; i++) {
    const th = r() * Math.PI * 2, dist = (6 + r() * 24) * Math.min(1, s * 1.6)
    puff(c, 64 + Math.cos(th) * dist, 64 + Math.sin(th) * dist * 0.7 - s * 16, Math.round(5 + s * (14 + r() * 8)), SMOKE, fade, i * 1.7)
  }
}
function embers(c, n, seed, spread) { const r = rng(seed); for (let i = 0; i < n; i++) P(c, 64 + (r() * 2 - 1) * spread, 64 + (r() * 2 - 1) * spread * 0.7 + r() * 20, r() < 0.5 ? "#ffb030" : "#ff5a20" + A[5]) }

// 8-frame arcade crash: flash, small sparks, burst, big sparks, smoke starts/expands/dissipates, fading particles
anim("fx_crash_impact", { w: 128, h: 128, frames: 8, fps: 14 }, (c) => {
  const f = c.frame
  if (f >= 4) smokeBurst(c, [0, 0, 0, 0, 0.15, 0.45, 0.72, 0.94][f], 61)
  if (f === 0) { flash(c, 16); ring(c, 9, 1) }
  if (f === 1) { flash(c, 7); sparks(c, 0.18, 16, 0.6, 62) }
  if (f === 2) { ring(c, 30, 3); flash(c, 5); sparks(c, 0.3, 18, 0.8, 63) }
  if (f === 3) { ring(c, 46, 1); sparks(c, 0.5, 34, 1.1, 64) }
  if (f === 4) sparks(c, 0.72, 34, 1.1, 64)
  if (f === 5) sparks(c, 0.9, 20, 1.1, 64)
  if (f === 6) embers(c, 14, 65, 44)
  if (f === 7) embers(c, 7, 66, 50)
})
anim("fx_collision_sparks", { w: 128, h: 128, frames: 8, fps: 16 }, (c) => {
  if (c.frame === 0) flash(c, 8)
  sparks(c, (c.frame + 0.6) / 8 * 1.05, 40, 1.1, 71)
  if (c.frame >= 6) embers(c, 8 - c.frame + 4, 72 + c.frame, 46)
})

// ---------------- lightning (4 frames: strike, flicker, restrike, residual) ----------------
function boltPath(seed, x0, y0, x1, y1, rough) {
  const r = rng(seed); let pts = [[x0, y0], [x1, y1]]
  for (let lvl = 0, amp = rough; lvl < 6; lvl++, amp *= 0.55) {
    const nx = [pts[0]]
    for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]; nx.push([(a[0] + b[0]) / 2 + (r() * 2 - 1) * amp, (a[1] + b[1]) / 2 + (r() * 2 - 1) * amp * 0.25], b) }
    pts = nx
  }
  return pts
}
const MAIN = boltPath(81, 132, 0, 120, 296, 70)
const BRANCHES = [[10, 82, 40], [20, 83, 32], [33, 84, 26], [44, 85, 16]].map(([i, s, len]) => { const [x, y] = MAIN[i]; return boltPath(s, x, y, x + (s & 1 ? len : -len), Math.min(296, y + len * 1.4), len * 0.6) })
function drawBolt(c, pts, core, inner, glowCol, glowR) {
  if (glowR) for (let i = 1; i < pts.length; i++) { const [a, b] = [pts[i - 1], pts[i]]
    for (let t = 0; t <= 1; t += 0.1) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
      for (let dy = -glowR; dy <= glowR; dy++) for (let dx = -glowR; dx <= glowR; dx++) { const d = Math.hypot(dx, dy) / glowR
        if (d <= 1 && bay(Math.round(x + dx), Math.round(y + dy)) < (1 - d) * 0.7) P(c, x + dx, y + dy, glowCol) } } }
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1].map(Math.round), pts[i].map(Math.round)]
    if (inner) c.line(a[0] + 1, a[1], b[0] + 1, b[1], inner)
    c.line(a[0], a[1], b[0], b[1], core)
  }
}
anim("fx_lightning", { w: 256, h: 300, frames: 4, fps: 12 }, (c) => {
  const I = [1, 0.35, 0.85, 0.15][c.frame]
  if (I > 0.5) for (const b of BRANCHES) drawBolt(c, b, "#d8e2ff", null, "#7f94ff" + A[3], 3)
  if (I > 0.5) drawBolt(c, MAIN, "#ffffff", "#c8d6ff", "#8ea2ff" + A[4], I > 0.9 ? 7 : 5)
  else drawBolt(c, MAIN, I > 0.3 ? "#b8c8ff" + A[6] : "#8ea2ff" + A[4], null, null, 0)
})

// ---------------- headlight pools on the road ----------------
sprite("fx_headlight_glow", { w: VW, h: VH }, (c) => {
  const lobe = (u) => Math.exp(-((u / 0.26) ** 2))
  for (let y = HZ + 14; y < VH; y++) {
    const v = (y - HZ) / (VH - HZ), half = v * VW * 0.62                                    // road half-width in screen px
    const depth = clamp((v - 0.1) / 0.3, 0, 1) ** 1.5                                       // beam throw: fades in from ~y 290, full by ~y 370
    for (let x = 0; x < VW; x++) {
      const u = (x - VPX) / half, I = (lobe(u - 0.2) + lobe(u + 0.2)) * 0.62 * depth
      const a = aStep(I * 0.6, x, y)
      if (a > 0) c.px(x, y, (I > 0.45 ? "#fff6d4" : "#f6e2aa") + A[a])
    }
  }
})

// ---------------- speed lines (radial streaks from the vanishing point, loop) ----------------
anim("fx_speed_lines", { w: VW, h: VH, frames: 4, fps: 20 }, (c) => {
  const r = rng(91)
  for (let i = 0; i < 70; i++) {
    const th = r() * Math.PI * 2, s0 = r(), w = r() < 0.25 ? 2 : 1, bright = r() < 0.4
    const p = (s0 + c.phase) % 1, ex = Math.cos(th), ey = Math.sin(th) * 0.62
    const rIn = 330 + p * 260, len = 30 + p * 90                                             // start outside the central view, accelerate out
    const x0 = VPX + ex * rIn, y0 = HZ + ey * rIn, x1 = VPX + ex * (rIn + len), y1 = HZ + ey * (rIn + len)
    c.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), "#ffffff" + A[bright ? 4 : 2], w)
  }
})

globalThis.__FX = { HZ, VPX }
