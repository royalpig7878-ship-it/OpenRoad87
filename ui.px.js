// OPEN ROAD '87 interface components. Transparent PNGs, no text (the engine renders labels).
// Palette: dark charcoal panels, warm amber highlights, cream lettering areas, subtle metal trim.

pal({ k: "#0a0a0d" })

const K = "#0a0a0d"
const CH = ["#121216", "#1b1c21", "#25272d", "#30333a", "#3e414a"]        // charcoal
const MT = ["#4a4e57", "#6b7079", "#8f949d", "#b8bcc4", "#e2e5ea"]        // metal
const AM = ["#5a2a06", "#9a4a0a", "#d87a14", "#f4a62a", "#ffd36a"]        // amber
const CR = ["#a8977a", "#cdbd9c", "#e8dcc0", "#f6eedb"]                   // cream
const RD = ["#4a0808", "#8a1414", "#d02a24", "#ff5a46", "#ff9a86"]
const BL = ["#0c1c4a", "#1a3a8a", "#2e64d8", "#5a9cff", "#a8ccff"]
const GD = ["#4a2a04", "#8a5a0a", "#d09a1a", "#f4cc3a", "#fff08a"]        // gold
const RB = ["#0e0e10", "#1c1c20", "#2c2c32", "#44444c", "#5c5c66"]        // rubber
const GR = ["#5c6068", "#80858e", "#a4a9b2"]                                 // disabled greys

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const P = (c, x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, col) }
// level 0..1 -> ramp entry, dithered between steps
const pick = (ramp, v, x, y) => { const f = clamp(v, 0, 1) * (ramp.length - 1), i = Math.floor(f); return ramp[Math.min(ramp.length - 1, f - i > bay(x, y) ? i + 1 : i)] }

function outline(c, col = K) {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, "*")) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.is(x + dx, y + dy, "*"))) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, col)
}
// chamfered rectangle test
const inCham = (x, y, x0, y0, x1, y1, ch) => x >= x0 && x <= x1 && y >= y0 && y <= y1 &&
  x - x0 + (y - y0) >= ch && x1 - x + (y - y0) >= ch && x - x0 + (y1 - y) >= ch && x1 - x + (y1 - y) >= ch
// lit dome: light from upper-left
function ball(c, cx, cy, r, ramp, ry = r) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny
    if (d > 1) continue
    const l = 0.55 - 0.45 * nx - 0.55 * ny + (1 - d) * 0.25 - d * 0.25
    P(c, x, y, pick(ramp, l, x, y))
  }
}
function ringShape(c, cx, cy, r0, r1, colAt) {
  for (let y = Math.floor(cy - r1); y <= cy + r1; y++) for (let x = Math.floor(cx - r1); x <= cx + r1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if (d >= r0 && d <= r1) { const col = colAt(x, y, d, Math.atan2(y + 0.5 - cy, x + 0.5 - cx)); if (col) P(c, x, y, col) }
  }
}

// ---------------- buttons (240x48, chamfered) ----------------
const BW = 240, BH = 48
function button(c, st) {
  const frame = st === "disabled" ? [GR[0], GR[1], GR[2]] : st === "selected" ? [AM[1], AM[3], AM[4]] : [MT[0], MT[2], MT[4]]
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    if (!inCham(x, y, 0, 0, BW - 1, BH - 1, 8)) continue
    const outer = !inCham(x, y, 1, 1, BW - 2, BH - 2, 8), rim = !inCham(x, y, 3, 3, BW - 4, BH - 4, 8)
    if (outer) { c.px(x, y, K); continue }
    if (rim) { const lit = x + y < (BW + BH) / 2 ? (y < BH / 2 ? 2 : 1) : (y < BH / 2 ? 1 : 0); c.px(x, y, frame[lit]); continue }
    const t = (y - 3) / (BH - 7)                                                      // face gradient
    let col
    if (st === "selected") col = pick(["#3a1c08", "#5a2c0c", "#7a3e10", "#9a5216"], 0.95 - t * 0.9, x, y)
    else if (st === "disabled") col = pick(["#16171a", "#1d1e22", "#24262a"], 0.8 - t * 0.7, x, y)
    else col = pick(CH, 0.95 - t * 0.85, x, y)
    if (y === 4 && st !== "disabled") col = st === "selected" ? AM[3] : CH[4]          // top gloss line
    if (y === BH - 5) col = st === "selected" ? AM[2] : st === "disabled" ? "#2a2c30" : AM[1]    // amber underline
    if (st === "disabled" && (x + y) % 6 === 0 && y > 5 && y < BH - 6) col = "#26282c"      // faint hatch
    c.px(x, y, col)
  }
  // rivets at the chamfer ends
  for (const x of [9, BW - 10]) for (const y of [7, BH - 8]) { P(c, x, y, st === "disabled" ? GR[1] : MT[3]); P(c, x + 1, y + 1, K) }
  if (st === "selected") {
    for (const [x0, s] of [[14, 1], [BW - 15, -1]]) for (let k = 0; k < 7; k++)            // chevrons pointing inward
      for (let j = -k; j <= k; j++) if (Math.abs(j) === k || Math.abs(j) === k - 1) P(c, x0 + s * (7 - k), BH / 2 + j, k > 5 ? AM[2] : AM[4])
  }
}
sprite("ui_button_normal", { w: BW, h: BH }, (c) => button(c, "normal"))
sprite("ui_button_selected", { w: BW, h: BH }, (c) => button(c, "selected"))
sprite("ui_button_disabled", { w: BW, h: BH }, (c) => button(c, "disabled"))

// ---------------- panel (480x320, 9-slice with 16px corners) ----------------
sprite("ui_panel", { w: 480, h: 320 }, (c) => {
  const W = c.w, H = c.h
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inCham(x, y, 0, 0, W - 1, H - 1, 12)) continue
    if (!inCham(x, y, 1, 1, W - 2, H - 2, 12)) { c.px(x, y, K); continue }
    if (!inCham(x, y, 5, 5, W - 6, H - 6, 12)) {                                   // brushed metal frame
      const top = y < 5 || (x < 5 && y < H - 6), bot = y > H - 6 || x > W - 6
      c.px(x, y, top ? (((x * 7 + y * 3) % 11) < 2 ? MT[4] : MT[3]) : bot ? MT[0] : MT[2]); continue
    }
    if (!inCham(x, y, 6, 6, W - 7, H - 7, 12)) { c.px(x, y, K); continue }
    let col = pick(CH, 0.62 - (y / H) * 0.5, x, y)
    if (y % 2 === 1) col = col === CH[0] ? CH[0] : CH[Math.max(0, CH.indexOf(col) - 1)]  // faint CRT scanlines
    if (inCham(x, y, 12, 12, W - 13, H - 13, 8) && !inCham(x, y, 13, 13, W - 14, H - 14, 8)) col = AM[1]   // inset amber rule
    c.px(x, y, col)
  }
  for (const [x, y] of [[14, 14], [W - 17, 14], [14, H - 17], [W - 17, H - 17]]) {      // corner screws
    ball(c, x + 1.5, y + 1.5, 2.6, MT); P(c, x + 1, y + 1, MT[0]); P(c, x + 2, y + 2, MT[0])
  }
})

// ---------------- panel header (480x40, cream lettering plate) ----------------
sprite("ui_panel_header", { w: 480, h: 40 }, (c) => {
  const W = c.w, H = c.h
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inCham(x, y, 0, 0, W - 1, H - 1, 10)) continue
    if (!inCham(x, y, 1, 1, W - 2, H - 2, 10)) { c.px(x, y, K); continue }
    if (!inCham(x, y, 3, 3, W - 4, H - 4, 10)) { c.px(x, y, y < H / 2 ? AM[4] : AM[1]); continue }
    let col = pick(AM, 0.85 - (y / H) * 0.6, x, y)                                      // amber bar
    const sx = x < W / 2 ? x : W - 1 - x
    if (sx > 18 && sx < 74) { const k = (sx - 18 + (H - y)) % 14; if (k < 3) col = AM[4]; else if (k < 5) col = CH[1] }   // racing stripes
    c.px(x, y, col)
  }
  // cream lettering plate (text area) with dark bevel
  const x0 = 84, x1 = W - 85, y0 = 7, y1 = H - 8
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inCham(x, y, x0, y0, x1, y1, 4)) continue
    const edge = !inCham(x, y, x0 + 1, y0 + 1, x1 - 1, y1 - 1, 4)
    c.px(x, y, edge ? (y < (y0 + y1) / 2 || x === x0 ? CH[1] : AM[4]) : pick(CR, 0.95 - ((y - y0) / (y1 - y0)) * 0.5, x, y))
  }
})

// ---------------- icons (32x32) ----------------
const icon = (name, fn) => sprite(name, { w: 32, h: 32 }, (c) => { fn(c); outline(c) })

icon("ui_coin", (c) => {
  ball(c, 16, 16, 13.5, GD)
  ringShape(c, 16, 16, 10, 11.4, (x, y, d, a) => Math.sin(a) + Math.cos(a) < 0 ? GD[1] : GD[4])   // milled rim groove
  const inStar = (x, y, ox, oy, R, r) => {                                              // point-in-star (polar test)
    const dx = x + 0.5 - ox, dy = y + 0.5 - oy, a = Math.atan2(dy, dx) + Math.PI / 2, seg = Math.PI / 5
    const t = Math.abs(((a % (2 * seg)) + 2 * seg) % (2 * seg) - seg) / seg                     // 1 at tip, 0 at notch
    return Math.hypot(dx, dy) <= r + (R - r) * t ** 1.4
  }
  ringShape(c, 16, 16, 0, 9.9, (x, y) => pick(GD, 0.42 - (x + y - 32) / 50, x, y))        // recessed field
  for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) {
    if (inStar(x, y, 16, 16.5, 7.5, 3.2)) c.px(x, y, inStar(x - 1, y - 1, 16, 16.5, 7.5, 3.2) ? (x + y < 33 ? GD[4] : GD[3]) : "#fffbe0")
    else if (inStar(x - 1, y - 1, 16, 16.5, 7.5, 3.2)) c.px(x, y, GD[1])                       // drop shadow
  }
  P(c, 9, 8, "#ffffff"); P(c, 10, 7, "#ffffff")
})
icon("ui_fuel", (c) => {                                                                 // gas pump
  for (let y = 5; y <= 28; y++) for (let x = 6; x <= 19; x++) if (inCham(x, y, 6, 5, 19, 28, 2)) c.px(x, y, pick(RD, 0.95 - (x - 6) / 16, x, y))
  c.rect(8, 8, 10, 7, K); c.rect(9, 9, 8, 5, CR[2]); c.hline(9, 9, 8, CR[3]); c.hline(10, 11, 5, CR[0])   // meter window
  c.rect(5, 26, 16, 3, CH[3]); c.hline(5, 26, 16, MT[2])                                  // plinth
  c.rect(8, 17, 2, 2, AM[4])                                                              // lamp
  c.line(19, 12, 24, 12, RB[3], 2); c.line(24, 12, 25, 21, RB[3], 2)                       // hose
  c.rect(23, 20, 4, 3, MT[2]); c.line(26, 20, 28, 17, MT[3], 2); P(c, 23, 20, MT[4])      // nozzle
})
icon("ui_repair", (c) => {                                                               // wrench
  c.line(7, 25, 21, 11, MT[1], 5); c.line(7, 24, 20, 11, MT[3], 2); c.line(8, 23, 19, 12, MT[4])
  ball(c, 23, 9, 6.2, MT)
  c.poly([24, 3, 30, 3, 30, 9, 25, 9], "_"); c.poly([22, 6, 26, 2, 30, 6, 26, 10], "_")    // jaw opening
  ball(c, 7, 25, 4.2, MT); ringShape(c, 7, 25, 0, 1.8, () => "_")                          // ring end
})
icon("ui_engine", (c) => {                                                               // V-block
  c.poly([4, 13, 10, 7, 22, 7, 28, 13, 28, 25, 4, 25], CH[3])
  for (let y = 13; y <= 25; y++) for (let x = 4; x <= 28; x++) if (c.is(x, y, "*")) c.px(x, y, pick(MT, 0.7 - (y - 13) / 22 - (x - 4) / 60, x, y))
  c.poly([5, 12, 10, 6, 15, 6, 15, 12], AM[2]); c.line(10, 6, 14, 6, AM[4]); c.poly([17, 12, 17, 6, 22, 6, 27, 12], AM[1]); c.line(18, 6, 21, 6, AM[3])   // valve covers
  for (let y = 15; y < 24; y += 3) c.hline(7, y, 18, MT[0])                              // cooling fins
  ball(c, 16, 20, 4.2, MT); ringShape(c, 16, 20, 0, 1.6, () => K)                          // pulley
  c.rect(14, 2, 4, 5, CH[3]); c.hline(13, 2, 6, MT[3])                                    // intake
})
icon("ui_tire", (c) => {
  ringShape(c, 16, 16, 7.5, 14.5, (x, y, d, a) => {
    const tread = d > 12.6 && Math.floor(((a + Math.PI) / (2 * Math.PI)) * 22) % 2 === 0
    const l = 0.5 - 0.35 * Math.cos(a + 2.3) - (d > 13.5 ? 0.25 : 0)
    return tread ? RB[0] : pick(RB, l, x, y)
  })
  ball(c, 16, 16, 7.5, MT)
  for (let k = 0; k < 5; k++) { const a = (k * 2 * Math.PI) / 5 - Math.PI / 2; P(c, 16 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, MT[0]) }
  ringShape(c, 16, 16, 0, 1.6, () => CH[2])
})
icon("ui_brake", (c) => {
  ringShape(c, 15, 17, 0, 13, (x, y, d, a) => {
    if (d < 5) return null
    const l = 0.65 - 0.3 * Math.cos(a + 2.3) - d / 40
    const hole = d > 7.5 && d < 11.5 && Math.abs(((a * 8) / Math.PI) % 2) < 0.35 && (Math.round(d) % 2 === 0)
    return hole ? CH[1] : pick(MT, l, x, y)
  })
  ball(c, 15, 17, 5, CH); ringShape(c, 15, 17, 0, 2, () => MT[2])
  ringShape(c, 15, 17, 9, 15.5, (x, y, d, a) => a > -1.75 && a < -0.15 ? pick(RD, 1.1 - (d - 9) / 7, x, y) : null)   // caliper
  P(c, 21, 6, RD[4]); P(c, 22, 6, RD[4])
})
icon("ui_transmission", (c) => {                                                         // H-gate + knob
  for (let y = 4; y <= 29; y++) for (let x = 3; x <= 28; x++) if (inCham(x, y, 3, 4, 28, 29, 4)) c.px(x, y, pick(CH, 0.8 - (y - 4) / 30, x, y))
  for (const x of [8, 16, 24]) c.vline(x, 9, 15, CR[1]); c.hline(8, 16, 17, CR[1])         // gate slots
  for (const [x, y] of [[8, 9], [8, 23], [16, 23], [24, 9], [24, 23]]) P(c, x, y, CR[3])
  c.line(16, 16, 16, 12, MT[3], 2)                                                         // lever
  ball(c, 16, 9, 4.6, AM); P(c, 14, 7, "#ffffff")
})
icon("ui_speed", (c) => {                                                                // speedometer
  ringShape(c, 16, 19, 0, 14.5, (x, y, d, a) => {
    if (y > 25) return null
    if (d > 12.5) return pick(AM, 0.8 - (y - 4) / 26, x, y)
    const tick = d > 9.5 && d < 12 && Math.abs(((a / Math.PI) * 6 + 12) % 1 - 0.5) > 0.38 && y < 22
    return tick ? CH[1] : pick(CR, 0.9 - d / 18, x, y)
  })
  c.hline(4, 26, 25, CH[2]); c.hline(5, 25, 23, CH[3])                                    // flat base
  c.line(16, 19, 25, 10, RD[2], 2); c.line(16, 19, 24, 10, RD[4])                          // needle at speed
  ball(c, 16, 19, 2.4, CH)
})
icon("ui_damage", (c) => {                                                               // dented car + impact
  c.poly([2, 22, 4, 17, 10, 16, 14, 11, 22, 11, 25, 15, 27, 16, 29, 20, 29, 24, 2, 24], RD[2])
  for (let y = 11; y <= 24; y++) for (let x = 2; x <= 29; x++) if (c.is(x, y, "*")) c.px(x, y, pick(RD, 0.95 - (y - 11) / 14, x, y))
  c.poly([15, 12, 21, 12, 23, 15, 15, 15], BL[1]); c.line(16, 12, 20, 12, BL[3])            // window
  c.poly([24, 15, 30, 18, 30, 24, 26, 24, 27, 19], "_")                                      // crushed front
  c.line(24, 15, 27, 19, K); c.line(27, 19, 26, 24, K); c.line(23, 17, 20, 21, K); c.line(20, 21, 21, 23, K)   // creases
  for (const x of [8, 22]) { ball(c, x, 24, 3.6, RB); P(c, x, 24, MT[2]) }
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; c.line(27, 8, Math.round(27 + Math.cos(a) * (k % 2 ? 3 : 5)), Math.round(8 + Math.sin(a) * (k % 2 ? 3 : 5)), k % 2 ? AM[3] : AM[4]) }
  P(c, 27, 8, "#ffffff")
})
icon("ui_police_alert", (c) => {                                                         // beacon
  for (let k = 0; k < 7; k++) { const a = Math.PI + (k * Math.PI) / 6; c.line(Math.round(16 + Math.cos(a) * 12), Math.round(18 + Math.sin(a) * 12), Math.round(16 + Math.cos(a) * 15), Math.round(18 + Math.sin(a) * 15), k < 3 ? RD[3] : k > 3 ? BL[3] : AM[4]) }
  for (let y = 7; y <= 20; y++) for (let x = 7; x <= 25; x++) {
    const nx = (x + 0.5 - 16) / 9, ny = (y + 0.5 - 20) / 13
    if (nx * nx + ny * ny > 1) continue
    const l = 0.85 - 0.35 * Math.abs(nx) - (y - 7) / 30
    c.px(x, y, x < 16 ? pick(RD, l, x, y) : pick(BL, l, x, y))
  }
  c.vline(16, 8, 12, "#ffffff"); P(c, 11, 11, "#ffffff"); P(c, 12, 10, "#ffffff")
  c.rect(6, 21, 21, 4, CH[3]); c.hline(6, 21, 21, MT[3]); c.rect(4, 25, 25, 3, CH[1]); c.hline(4, 25, 25, MT[1])
})
icon("ui_checkpoint", (c) => {                                                           // checkered flag
  c.line(6, 3, 6, 30, MT[1], 2); c.vline(6, 3, 27, MT[3]); ball(c, 6.5, 3, 2.2, GD)
  for (let y = 0; y < 13; y++) for (let x = 0; x < 21; x++) {
    const wave = Math.round(Math.sin((x / 21) * Math.PI * 1.6) * 2), px = 8 + x, py = 5 + y + wave
    const sq = (Math.floor(x / 4) + Math.floor(y / 4)) % 2, shade = Math.sin((x / 21) * Math.PI * 1.6 + 1.2) > 0.3
    P(c, px, py, sq ? (shade ? CH[0] : CH[2]) : (shade ? CR[2] : CR[3]))
  }
})
icon("ui_trophy", (c) => {
  for (let y = 3; y <= 16; y++) for (let x = 7; x <= 24; x++) {                           // cup bowl
    const nx = (x + 0.5 - 16) / 9, ny = (y - 3) / 14, w = 1 - ny * ny * 0.65
    if (Math.abs(nx) > w) continue
    c.px(x, y, pick(GD, 0.95 - nx * 0.55 - ny * 0.35, x, y))
  }
  c.hline(7, 3, 18, GD[4]); c.hline(8, 4, 16, GD[1])                                      // rim
  ringShape(c, 6, 9, 2.5, 4.2, (x, y, d, a) => x < 8 ? GD[2] : null); ringShape(c, 26, 9, 2.5, 4.2, (x, y, d, a) => x > 24 ? GD[3] : null)   // handles
  c.rect(14, 17, 4, 4, GD[2]); c.vline(14, 17, 4, GD[4]); c.rect(11, 21, 10, 2, GD[3])     // stem
  c.rect(8, 23, 16, 6, CH[3]); c.hline(8, 23, 16, CH[4]); c.rect(12, 25, 8, 2, GD[2])      // plinth + plaque
  c.poly([16, 6, 17, 9, 20, 9, 18, 11, 19, 14, 16, 12, 13, 14, 14, 11, 12, 9, 15, 9], GD[4]) // star emboss
  P(c, 10, 6, "#ffffff"); P(c, 10, 7, "#ffffff")
})
