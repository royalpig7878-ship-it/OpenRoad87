// OPEN ROAD '87 small animations: steering wheel turn, headlight flash, turn signal blink.
// (police lights -> traffic.px.js anim_police_lights, dust -> fx.px.js anim_dust)

pal({ k: "#050507" })

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const q = (ramp, v) => ramp[clamp(Math.floor(clamp(v, 0, 0.999) * ramp.length), 0, ramp.length - 1)]   // no dither: rotation-stable
const pick = (ramp, v, x, y) => { const f = clamp(v, 0, 1) * (ramp.length - 1), i = Math.floor(f); return ramp[Math.min(ramp.length - 1, f - i > bay(x, y) ? i + 1 : i)] }
const P = (c, x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, col) }
function outline(c, col) {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, "*")) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.is(x + dx, y + dy, "*"))) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, col)
}

// ---------------- steering wheel: 5 frames, 256x256, rotation only ----------------
const LEATHER = ["#08080a", "#121216", "#1c1c22", "#2a2a32", "#3c3c46", "#565662", "#7a7a88"]
const AMBER = ["#5a2a06", "#9a4a0a", "#d87a14", "#f4a62a", "#ffd36a", "#fff0b0"]
const METAL = ["#3a3e46", "#555a64", "#737883", "#959aa4", "#b8bcc4", "#dde0e6", "#ffffff"]
const PAD = ["#0c0c0f", "#141418", "#1e1e24", "#2a2a32", "#383842"]
const L3 = (() => { const v = [-0.45, -0.65, 0.62], n = Math.hypot(...v); return v.map((a) => a / n) })()
const L2 = [-0.6, -0.8]
const SPOKES = [{ d: [-0.993, 0.12], w0: 13, w1: 9, holes: [58, 79] }, { d: [0.993, 0.12], w0: 13, w1: 9, holes: [58, 79] }, { d: [0, 1], w0: 11, w1: 8, slot: [50, 82] }]
const angDiff = (a, b) => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)

function wheel(c, deg) {
  const th = (deg * Math.PI) / 180, ct = Math.cos(th), st = Math.sin(th), C = 128
  const toWorld = (vx, vy) => [vx * ct - vy * st, vx * st + vy * ct]                       // local -> world direction
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const wx = x + 0.5 - C, wy = y + 0.5 - C, r = Math.hypot(wx, wy)
    const lx = wx * ct + wy * st, ly = -wx * st + wy * ct, la = Math.atan2(ly, lx), wa = Math.atan2(wy, wx)
    // rim (torus, world-fixed light) with finger grips on the lower inner edge
    const grip = la > 0.35 && la < Math.PI - 0.35 ? 2.4 * Math.max(0, Math.sin(la * 26)) : 0
    const R0 = 95 - grip, R1 = 121
    if (r >= R0 && r <= R1) {
      const s = clamp((r - 108) / 13.5, -1, 1), nz = Math.sqrt(1 - s * s)
      const I = s * Math.cos(wa) * L3[0] + s * Math.sin(wa) * L3[1] + nz * L3[2]
      const spec = Math.pow(Math.max(0, I), 14) * 0.6
      let v = 0.08 + Math.max(0, I) * 0.62 + spec
      const marker = angDiff(la, -Math.PI / 2) < 0.075
      if (!marker && Math.abs(r - (R0 + 3)) < 0.6 && Math.floor((la * 98) / 3) % 2 === 0) v += 0.16   // stitching
      c.px(x, y, marker ? q(AMBER, v + 0.12) : q(LEATHER, v))
      continue
    }
    // hub: padded horn button with metal collar + emblem
    if (r < 35) {
      if (r > 31) { const I2 = -(Math.cos(wa) * L2[0] + Math.sin(wa) * L2[1]); c.px(x, y, q(METAL, 0.45 - I2 * 0.35)); continue }
      const nx = wx / 31, ny = wy / 31, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const I = nx * L3[0] + ny * L3[1] + nz * L3[2]
      if (Math.abs(lx) / 10 + Math.abs(ly) / 7 < 1) { c.px(x, y, Math.abs(lx) / 10 + Math.abs(ly) / 7 < 0.45 ? q(AMBER, 0.95) : q(AMBER, 0.3 + I * 0.5)); continue }   // diamond emblem
      if (Math.abs(ly - 18) < 1.2 && Math.abs(lx) < 16) { c.px(x, y, q(AMBER, 0.4 + I * 0.3)); continue }                                         // amber pin-stripe
      c.px(x, y, q(PAD, 0.1 + I * 0.85)); continue
    }
    // spokes: brushed aluminium, bevelled edges, drilled holes
    for (const S of SPOKES) {
      const [dx, dy] = S.d, px = -dy, py = dx
      const u = lx * dx + ly * dy, vv = lx * px + ly * py
      if (u < 28 || u > 100) continue
      const hw = S.w0 + (S.w1 - S.w0) * ((u - 28) / 72)
      if (Math.abs(vv) > hw) continue
      let hole = false, edgeN = null
      if (S.holes) for (const hu of S.holes) { const hd = Math.hypot(u - hu, vv); if (hd < 5) hole = true; else if (hd < 6.6) edgeN = [-(u - hu) / hd, -vv / hd] }   // hole wall faces inward
      if (S.slot && u > S.slot[0] && u < S.slot[1]) { if (Math.abs(vv) < 2.6) hole = true; else if (Math.abs(vv) < 4) edgeN = [0, -Math.sign(vv)] }
      if (hole) break
      if (hw - Math.abs(vv) < 2) edgeN = [0, Math.sign(vv)]
      let v = 0.5 - (wy / 128) * 0.18 + (((Math.round(vv * 1.5) * 7) % 5) - 2) * 0.025               // brushed grain along the spoke
      if (edgeN) { const [ex, ey] = toWorld(edgeN[0] * dx + edgeN[1] * px, edgeN[0] * dy + edgeN[1] * py); v += (ex * L2[0] + ey * L2[1]) * 0.4 }
      c.px(x, y, q(METAL, v))
      break
    }
  }
  outline(c, "#050507")
}
const ANGLES = [-30, -15, 0, 15, 30]
anim("anim_steering_wheel", { w: 256, h: 256, frames: 5, fps: 8 }, (c) => wheel(c, ANGLES[c.frame]))

// ---------------- headlights: off, on, high-beam flash, on (128x48) ----------------
const CHROME = ["#3a3e46", "#737883", "#b8bcc4", "#eef0f4"]
function lamp(c, x0, y0, w, h, lensOn, lensHot, off, st) {
  for (let y = y0 - 2; y < y0 + h + 2; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) {
    const bez = x < x0 || y < y0 || x >= x0 + w || y >= y0 + h
    if (bez) { P(c, x, y, CHROME[y < y0 ? 3 : x < x0 ? 2 : y >= y0 + h ? 0 : 1]); continue }
    const flute = (x - x0) % 4 === 0, row = (y - y0) % 6 === 0
    if (st === "off") { const refl = ((x - x0) - (y - y0) * 1.5 + 40) % 26 < 3; P(c, x, y, refl ? "#8a96a8" : flute || row ? off[0] : off[1]); continue }
    const core = Math.hypot((x - x0 - w / 2) / (w / 2), (y - y0 - h / 2) / (h / 2)) < (st === "high" ? 0.95 : 0.6)
    P(c, x, y, core ? lensHot : flute || row ? lensOn[0] : lensOn[1])
  }
}
function glow(c, cx, cy, rx, ry, cols, amt) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d > 1 || c.is(x, y, "*")) continue
    if (bay(x, y) < (1 - d) * amt) P(c, x, y, cols[d < 0.45 ? 0 : 1])
  }
}
anim("anim_headlights", { w: 128, h: 48, frames: 4, fps: 6 }, (c) => {
  const st = ["off", "on", "high", "on"][c.frame], lamps = [[14, 16], [76, 16]]
  for (const [x, y] of lamps) lamp(c, x, y, 38, 16, ["#ffe8a8", "#fff4d0"], "#ffffff", ["#1a2028", "#2a3038"], st)
  if (st !== "off") for (const [x, y] of lamps) {
    glow(c, x + 19, y + 8, st === "high" ? 34 : 26, st === "high" ? 22 : 15, ["#fff6d8b0", "#ffe8a860"], st === "high" ? 1.2 : 1.0)
    if (st === "high") for (let k = -60; k <= 60; k++) { const a = 1 - Math.abs(k) / 60; if (bay(x + 19 + k, y + 8) < a) P(c, x + 19 + k, y + 8, "#ffffffd0"); if (bay(x + 19 + k, y + 7) < a * 0.5) P(c, x + 19 + k, y + 7, "#fff6d890") }   // lens flare streak
  }
})

// ---------------- turn signal: bright, on, off, off (48x32 amber lamp, ~1 Hz at 4 fps) ----------------
anim("anim_turn_signals", { w: 48, h: 32, frames: 4, fps: 4 }, (c) => {
  const st = ["hot", "on", "off", "off"][c.frame], x0 = 12, y0 = 9, w = 24, h = 14
  for (let y = y0 - 2; y < y0 + h + 2; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) {
    const bez = x < x0 || y < y0 || x >= x0 + w || y >= y0 + h
    if (bez) { P(c, x, y, CHROME[y < y0 ? 2 : y >= y0 + h ? 0 : 1]); continue }
    const flute = (x - x0) % 3 === 0 || (y - y0) % 5 === 0, core = Math.hypot((x - x0 - w / 2) / (w / 2), (y - y0 - h / 2) / (h / 2)) < 0.55
    if (st === "off") P(c, x, y, flute ? "#3a1c06" : (x - x0 + (y - y0)) % 14 < 2 ? "#9a5a2a" : "#5a2a06")
    else P(c, x, y, core ? (st === "hot" ? "#fff0b0" : "#ffd36a") : flute ? "#d87a14" : "#f4a62a")
  }
  if (st !== "off") glow(c, x0 + w / 2, y0 + h / 2, st === "hot" ? 23 : 19, st === "hot" ? 15 : 12, ["#ffb030c0", "#ff8a2080"], st === "hot" ? 1.6 : 1.1)
})
