// OPEN ROAD '87 sky / background layers, 960x540, horizontally tileable.
// Per time of day: sky_<t> (flattened composite) + three parallax layers:
//   sky_<t>_layer_sky  (opaque: gradient, sun/moon, stars, clouds, weather)
//   sky_<t>_layer_far  (transparent: far snow peaks + mid range)
//   sky_<t>_layer_near (transparent: forested foothills, distant treeline, empty valley floor)
// Nothing below the horizon except flat valley-floor tones; the pseudo-3D road draws over it.

pal({ k: "#000000" })

const W = 960, H = 540, HZ = 262                       // HZ = horizon line (valley floor starts here)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const wrap = (x) => ((x % W) + W) % W
const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s) }
const P = (c, x, y, col) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < H) c.px(wrap(x), y, col) }

// banded gradient: solid for the first half of each band, ordered-dither into the next
function grad(stops, t, x, y) {
  const n = stops.length, f = clamp(t, 0, 1) * (n - 1), i = Math.floor(f), fr = f - i
  if (i >= n - 1) return stops[n - 1]
  return fr > 0.5 && bay(x, y) < (fr - 0.5) * 2 ? stops[i + 1] : stops[i]
}
// light level (-1..1) -> 5-step ramp with dithered transitions
function q5(ramp, l, x, y) {
  const v = clamp((l + 1) * 2, 0, 4), i = Math.floor(v), f = v - i
  if (i >= 4) return ramp[4]
  return f > 0.75 || (f > 0.4 && bay(x, y) < (f - 0.4) / 0.35) ? ramp[i + 1] : ramp[i]
}

// ---------------- mountains ----------------
function ridge(x, layers) {
  x = wrap(x); let h = 0
  for (const [f, a, p, e, round] of layers)
    h += round ? a * (0.5 + 0.5 * Math.sin((2 * Math.PI * f * x) / W + p)) : a * Math.pow(1 - Math.abs(Math.sin((Math.PI * f * x) / W + p)), e ?? 1.3)
  return h
}
function range(c, R, dir) {
  for (let x = 0; x < W; x++) {
    const h = ridge(x, R.layers) + R.base, top = Math.round(R.y - h)
    for (let y = Math.max(0, top); y <= R.y + (R.foot ?? 0); y++) {
      const depth = y - top, xr = x - depth * 0.5 * (dir || 1)
      const slope = ridge(xr + 2, R.layers) - ridge(xr - 2, R.layers)
      let l = clamp(slope * R.gain * (dir || 0), -0.9, 0.9) + (R.bias ?? 0) - (depth / (R.y - top + 1)) * 0.3
      if (depth < 2 && slope * dir > 0) l += 0.35                                     // sunlit ridge rim
      let col = q5(R.ramp, l, x, y)
      if (R.snow) {
        const sd = h - R.snow + Math.sin((2 * Math.PI * 97 * x) / W) * 2 + Math.sin((2 * Math.PI * 31 * x) / W) * 4
        if (depth < sd * 0.8) col = q5(R.snowRamp, l + 0.2, x, y)
      }
      const hz = clamp((y - (R.y - R.hazeH)) / R.hazeH, 0, 1) * R.haze                // valley mist
      if (hz > 0 && bay(x, y) < hz) col = R.hazeCol
      c.px(x, y, col)
    }
  }
}
function treeline(c, T) {
  for (let i = 0; i < W / 6; i++) {
    const cx = i * 6 + Math.floor(hash(i, 7) * 3), th = 4 + Math.floor(hash(i, 3) * 6)
    for (let k = 0; k < th; k++) {
      const half = Math.floor((k / th) * 2.6)
      for (let d = -half; d <= half; d++) P(c, cx + d, HZ + 2 - th + k + 1, d === -T.dir * half && half > 0 ? T.treeLit : T.tree)
    }
  }
  for (let x = 0; x < W; x++) for (let y = HZ; y <= HZ + 3; y++) c.px(x, y, T.tree)
}

// ---------------- sky ----------------
function clouds(c, T) {
  for (const [cx, cy, w, h] of T.clouds) {
    const ph = cx * 0.017 + cy * 0.031
    for (let dx = -w / 2; dx <= w / 2; dx++) {
      const u = dx / (w / 2), env = Math.sqrt(Math.max(0, 1 - u * u))
      const lump = Math.max(0.5 + 0.5 * Math.cos(u * Math.PI * 2.3 + ph), 0.45 + 0.35 * Math.cos(u * Math.PI * 5.7 + ph * 2), 0.3)
      const rag = T.cloudNoise ? Math.floor(hash(cx + dx, cy) * 4) * (Math.abs(Math.sin(u * 23 + ph)) > 0.6) : 0
      const top = cy - h * Math.pow(env, 0.6) * lump * (T.cloudNoise ? 0.8 + 0.2 * Math.cos(u * 17 + ph) : 1), bot = rag + cy + h * 0.25 * env * (T.flatBase ? 1 : 0.6 + 0.4 * Math.cos(u * 9 + ph))
      if (bot - top < 1) continue
      for (let y = Math.floor(top); y <= Math.ceil(bot); y++) {
        let s = (y - top) / (bot - top + 0.01)
        if (T.cloudBelow) s = 1 - s
        const side = (T.sunX != null ? -Math.sign(cx + dx - T.sunX) : -T.dir) * Math.abs(u) * 0.35
        const n = T.cloudNoise ? (hash(cx + dx, y) - 0.5) * T.cloudNoise + Math.sin((cx + dx) * 0.21 + y * 0.37) * T.cloudNoise * 0.3 : 0
        const l = 0.8 - s * 1.7 + side + n
        const i = clamp(Math.floor((l + 1) * 1.6 + (bay(cx + dx, y) - 0.5) * 0.8), 0, T.cloudRamp.length - 1)
        P(c, cx + dx, y, T.cloudRamp[i])
      }
    }
  }
}
function disc(c, cx, cy, r, colAt) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx + 0.5, y - cy + 0.5) / r
    if (d <= 1) { const col = colAt(x, y, d); if (col) P(c, x, y, col) }
  }
}
function glow(c, cx, cy, r0, r1, cols, amt = 0.6) {
  disc(c, cx, cy, r1, (x, y, d) => {
    const t = (d * r1 - r0) / (r1 - r0); if (t < 0) return cols[0]
    const k = Math.min(cols.length - 1, Math.floor(t * cols.length))
    return bay(x, y) < (1 - t) * amt ? cols[k] : null
  })
}
function sky(c, T) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.px(x, y, grad(T.sky, y / HZ, x, y))
  if (T.stars) for (let y = 0; y < HZ - 40; y++) for (let x = 0; x < W; x++) {
    const h = hash(x, y), fade = 1 - y / (HZ - 40)
    if (h < 0.0022 * fade) c.px(x, y, h < 0.0005 ? "#ffffff" : h < 0.0012 ? "#c8d2f0" : "#6f7ca6")
    if (h < 0.00012) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P(c, x + dx, y + dy, "#7f8cb8")
  }
  const S = T.sun
  if (S?.kind === "sun") { glow(c, S.x, S.y, S.r, S.r * 3.2, S.glow, 0.7); disc(c, S.x, S.y, S.r, (x, y, d) => d > 0.82 ? S.cols[0] : S.cols[1]) }
  if (S?.kind === "set") {
    glow(c, S.x, S.y, S.r, S.r * 2.4, S.glow, 0.75)
    disc(c, S.x, S.y, S.r, (x, y) => {
      const v = (y - (S.y - S.r)) / (2 * S.r), dy = y - S.y
      if (dy > 0) { const gap = Math.floor(dy / (S.r / 5)) + 1; if ((dy % 11) < gap) return null }  // retro slats
      return grad(S.cols, v, x, y)
    })
  }
  if (S?.kind === "moon") {
    glow(c, S.x, S.y, S.r, S.r * 2.6, S.glow, 0.5)
    disc(c, S.x, S.y, S.r, (x, y, d) => {
      if (Math.hypot(x - S.x - S.r * 0.55, y - S.y + S.r * 0.25) < S.r * 0.92) return null  // crescent
      for (const [mx, my, mr] of [[-0.4, -0.2, 0.18], [-0.15, 0.4, 0.13], [-0.55, 0.3, 0.1]]) if (Math.hypot(x - S.x - mx * S.r, y - S.y - my * S.r) < mr * S.r) return S.cols[0]
      return d > 0.86 ? S.cols[1] : S.cols[2]
    })
  }
  clouds(c, T)
  if (T.rain) for (const [x0, x1] of T.rain) for (let y = T.rainTop; y < HZ; y++) for (let x = x0; x < x1; x++) {
    const e = Math.min(x - x0, x1 - x) / 40
    const e2 = clamp(e, 0, 1) * clamp((y - T.rainTop) / 20, 0, 1)
    if (bay(x, y) < 0.45 * e2) P(c, x, y, T.rainVeil)                                 // grey rain curtain
    if ((x * 2 + y) % 9 === 0 && hash(x, y) < 0.5 * e2) P(c, x, y, T.rainCol)         // slanted streak flecks
  }
  if (T.bolt) {
    const pts = T.bolt, seg = []
    for (let i = 0; i + 3 < pts.length; i += 2) seg.push(pts.slice(i, i + 4))
    for (const [x0, y0, x1, y1] of seg) for (let t = 0; t <= 1; t += 0.02) {
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (Math.hypot(dx, dy) < 3.2 && bay(x + dx | 0, y + dy | 0) < 0.35) P(c, x + dx, y + dy, "#8494c4")
    }
    for (const [x0, y0, x1, y1] of seg) c.line(x0, y0, x1, y1, "#f2f6ff")
    for (const [x0, y0, x1, y1] of [[T.bolt[4], T.bolt[5], T.bolt[4] + 14, T.bolt[5] + 18], [T.bolt[4] + 14, T.bolt[5] + 18, T.bolt[4] + 18, T.bolt[5] + 30]]) c.line(x0, y0, x1, y1, "#b8c6ee")
    glow(c, T.bolt[0], T.bolt[1], 4, 46, ["#68707e", "#5a616c"], 0.5)
  }
}

// ---------------- near layer: foothills, treeline, empty valley floor ----------------
function near(c, T) {
  range(c, { ...T.hills, y: HZ + 3 }, T.dir)
  treeline(c, T)
  for (let y = HZ + 4; y < H; y++) for (let x = 0; x < W; x++) c.px(x, y, grad(T.ground, (y - HZ - 4) / (H - HZ - 4), x, y))
  if (T.lights) for (const [lx, n] of T.lights) for (let k = 0; k < n; k++) {
    const x = lx + Math.floor(hash(lx, k) * 26), y = HZ + 5 + Math.floor(hash(k, lx) * 7)
    P(c, x, y, hash(x, y) < 0.6 ? "#ffd27a" : "#ff9a4a")
  }
}
function far(c, T) { range(c, { ...T.far, y: HZ }, T.dir); range(c, { ...T.mid, y: HZ }, T.dir) }

// ---------------- themes ----------------
const FAR_L = [[2, 66, 0.3, 1.2], [3, 38, 1.1], [5, 25, 2.0], [9, 13, 0.7], [17, 7, 1.3], [31, 3, 0.2]]
const MID_L = [[3, 34, 0.9], [4, 22, 2.4], [7, 13, 0.4], [13, 7, 1.7], [23, 3, 0.9]]
const HILL_L = [[4, 16, 0.5, 0, 1], [6, 11, 1.9, 0, 1], [11, 6, 0.2, 0, 1], [19, 3, 1.1, 0, 1], [37, 2, 0.6, 0, 1]]
const mtn = (ramp, hazeCol, o = {}) => ({ far: { layers: FAR_L, base: 34, gain: 0.2, ramp: ramp[0], haze: 0.9, hazeH: 60, hazeCol, ...o.far },
  mid: { layers: MID_L, base: 14, gain: 0.22, ramp: ramp[1], haze: 0.75, hazeH: 34, hazeCol, ...o.mid },
  hills: { layers: HILL_L, base: 6, gain: 0.3, ramp: ramp[2], haze: 0.4, hazeH: 14, hazeCol: o.hillHaze ?? hazeCol, foot: 1, ...o.hills } })

const THEMES = {
  day: {
    dir: 1, sky: ["#1f4fa8", "#2a62bd", "#3a76cc", "#4f8ad6", "#69a0de", "#86b6e6", "#a6cbee", "#c6def3"],
    sun: { kind: "sun", x: 170, y: 64, r: 16, cols: ["#fff2b8", "#fffdf0"], glow: ["#e6f0f8", "#bcd6ef"] }, sunX: 170,
    clouds: [[120, 128, 230, 26], [430, 74, 170, 18], [700, 142, 290, 30], [890, 58, 150, 14], [300, 186, 210, 12], [560, 206, 160, 8]],
    cloudRamp: ["#93a9c9", "#b9cae1", "#dfe8f3", "#f7faff"], flatBase: true,
    ...mtn([["#5d7ca8", "#6e8db6", "#83a0c3", "#9bb4d1", "#b5c8df"], ["#3c5a72", "#4a6b80", "#5c7d8e", "#728f9c", "#8aa3ab"], ["#24402f", "#2f513a", "#3d6345", "#4f7650", "#668a5e"]], "#bcd5ec",
      { far: { snow: 74, snowRamp: ["#a9bdd8", "#c8d7e8", "#e4ecf5", "#f6f9fd", "#ffffff"] }, hillHaze: "#8fa9a6" }),
    tree: "#1d3626", treeLit: "#2f513a", ground: ["#8ea67c", "#7a9668", "#678556", "#587647", "#4b673b"],
  },
  sunset: {
    dir: -1, sky: ["#1e1b4a", "#2e2260", "#47286f", "#6a2f78", "#933a78", "#bb4a6e", "#df6660", "#f28a55", "#f9ad55", "#fcd06a"],
    sun: { kind: "set", x: 620, y: 186, r: 58, cols: ["#fff3b0", "#ffe07a", "#ffbf55", "#ff9450", "#ff6d5a"], glow: ["#ffd27a", "#f8a85a", "#e9785c"] }, sunX: 620,
    clouds: [[200, 92, 330, 8], [560, 150, 380, 7], [830, 60, 270, 6], [420, 196, 300, 5], [60, 178, 210, 5], [760, 118, 200, 4]],
    cloudRamp: ["#4a2563", "#7a3570", "#c4567a", "#ff9a6a", "#ffd08a"], cloudBelow: true, flatBase: true,
    ...mtn([["#6b3f7c", "#7a4884", "#8a528c", "#9c5e93", "#b06c99"], ["#3a2350", "#45295a", "#523064", "#60386c", "#704275"], ["#1c1230", "#231638", "#2b1b40", "#341f48", "#3e2550"]], "#d2707a",
      { far: { snow: 74, snowRamp: ["#b4708f", "#d68aa0", "#f2a8a6", "#ffc8a8", "#ffe2b8"], gain: 0.24 }, hillHaze: "#6a3a64" }),
    tree: "#150d24", treeLit: "#3e2550", ground: ["#7a3f62", "#5f3156", "#4a2749", "#38203c", "#2a1930"],
  },
  night: {
    dir: -1, sky: ["#04050f", "#070a1a", "#0b1024", "#10172f", "#16203a", "#1d2a46", "#253452", "#2e3e5c"], stars: true,
    sun: { kind: "moon", x: 742, y: 78, r: 22, cols: ["#a9b0c4", "#d8dceb", "#f6f7ff"], glow: ["#2c3a5c", "#22304e"] }, sunX: 742,
    clouds: [[300, 150, 320, 6], [650, 196, 270, 5], [900, 116, 210, 5], [110, 210, 240, 4]],
    cloudRamp: ["#141b2c", "#1f2a40", "#2e3a54", "#45526e"], cloudBelow: false, flatBase: true,
    ...mtn([["#141c30", "#18213a", "#1d2742", "#232e4a", "#2b3756"], ["#0d1322", "#10172a", "#141c31", "#182138", "#1f2942"], ["#070a12", "#090d18", "#0c111e", "#0f1524", "#141b2e"]], "#24314e",
      { far: { snow: 74, snowRamp: ["#3a4664", "#4a5878", "#5d6c8c", "#7383a0", "#8c9ab4"] }, hillHaze: "#121a2c" }),
    tree: "#05070d", treeLit: "#141b2e", ground: ["#1a2236", "#141b2a", "#0f141f", "#0b0f17", "#07090e"],
    lights: [[140, 5], [372, 3], [598, 7], [826, 4]],
  },
  storm: {
    dir: 0, sky: ["#2b3036", "#33393f", "#3c4248", "#454c52", "#4f565c", "#5a6166", "#666d71", "#73797c"],
    clouds: [[100, 44, 540, 56], [480, 64, 620, 64], [820, 34, 520, 52], [300, 132, 420, 30], [700, 146, 440, 32], [930, 118, 300, 24], [520, 186, 300, 10]],
    cloudRamp: ["#1d2126", "#282d33", "#353b41", "#454c52", "#5a6167"], cloudBelow: false, flatBase: false,
    rain: [[480, 700], [840, 960], [0, 60]], rainTop: 140, rainCol: "#8b9296", rainVeil: "#4b5258", cloudNoise: 0.7,
    bolt: [318, 132, 330, 150, 318, 168, 336, 186, 326, 204, 342, 222, 334, 238],
    ...mtn([["#4a5257", "#50585d", "#566064", "#5d676a", "#646e71"], ["#353d42", "#3a4247", "#40484d", "#464e53", "#4c5459"], ["#1f2a28", "#24302d", "#293632", "#2e3c37", "#33423c"]], "#646b6f",
      { far: { gain: 0.06, bias: 0.1, snow: 70, snowRamp: ["#646e71", "#6d777a", "#778083", "#80898c", "#8a9295"] }, mid: { gain: 0.06 }, hills: { gain: 0.1 }, hillHaze: "#4a5450" }),
    tree: "#18211f", treeLit: "#24302d", ground: ["#55605a", "#4b5650", "#424d47", "#39443f", "#313b37"],
  },
}

for (const [name, T] of Object.entries(THEMES)) {
  sprite(`sky_${name}_layer_sky`, { w: W, h: H }, (c) => sky(c, T))
  sprite(`sky_${name}_layer_far`, { w: W, h: H }, (c) => far(c, T))
  sprite(`sky_${name}_layer_near`, { w: W, h: H }, (c) => near(c, T))
  sprite(`sky_${name}`, { w: W, h: H }, (c) => { sky(c, T); far(c, T); near(c, T) })
}
globalThis.__SKY = { horizonY: HZ, themes: Object.keys(THEMES) }
