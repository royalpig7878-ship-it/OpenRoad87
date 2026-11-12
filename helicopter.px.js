// OPEN ROAD '87 police pursuit helicopter: 192x128, three-quarter side view facing left, slightly above.
// police_helicopter = static (frame 0); police_helicopter_anim = 4-frame rotor loop.

pal({
  k: "#08080c", D: "#1c1c24", m: "#5a5f6c", n: "#8e94a2", o: "#c4c9d4", p: "#f4f6fa",
  5: "#06070a", 6: "#101219", 7: "#1b1e28", 8: "#2c3140", 9: "#5a6278",              // black
  q: "#6a6e78", r: "#a6abb6", s: "#d6dae2", u: "#eef0f4", v: "#ffffff",              // white
  G: "#13202e", J: "#2b4560", U: "#9cc4e0", R: "#ff3a2a", B: "#3a78e0", W: "#fff4d0", Y: "#ffb020",
})
ramps("k56789", "qrsuv")

const P = (c, x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, k) }
const BLACK = ["5", "6", "7", "8", "9"], WHITE = ["q", "r", "s", "u", "v"]

// ellipse lit from the top-left; `split` = y below which it turns black (two-tone livery)
function body(c, cx, cy, rx, ry, split = Infinity) {
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny
    if (d > 1) continue
    const l = -(0.55 * nx + 0.83 * ny) + (1 - d) * 0.35
    const i = l > 0.75 ? 4 : l > 0.35 ? 3 : l > -0.1 ? 2 : l > -0.5 ? 1 : 0
    const ramp = y > split ? BLACK : WHITE
    P(c, x, y, (i === 3 && (x + y) & 1) ? ramp[2] : ramp[i])
  }
}

function glass(c, pts) {
  c.poly(pts, "G")
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!c.is(x, y, "G")) continue
    if (y - y0 < (y1 - y0) * 0.4 && (x + y) & 1) c.px(x, y, "J")
    const u = x - (x0 + (x1 - x0) * 0.35) + (y - y0) * 0.8
    if (u >= 0 && u < 3) c.px(x, y, u < 1 ? "U" : "J")
  }
}

function outline(c) {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, "*")) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.is(x + dx, y + dy, "*"))) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, "k")
}

function heli(c, frame) {
  // far skid + struts (in shadow, drawn first)
  c.line(62, 89, 118, 89, "m", 2); c.line(56, 86, 62, 89, "m", 2)
  c.line(76, 80, 74, 89, "D", 2); c.line(104, 80, 106, 89, "D", 2)
  // tail boom, stabiliser, fin
  c.poly([104, 54, 166, 58, 166, 64, 104, 74], "s")
  c.poly([104, 66, 166, 62, 166, 64, 104, 74], "7"); c.line(104, 54, 166, 58, "v"); c.line(104, 66, 166, 62, "q")
  c.poly([146, 62, 160, 60, 162, 64, 148, 67], "7"); c.line(146, 62, 160, 60, "9")
  c.poly([158, 40, 168, 42, 174, 64, 164, 64], "6"); c.line(158, 40, 168, 42, "9"); c.line(160, 44, 165, 62, "8")
  // cabin: white upper, black belly
  body(c, 80, 64, 36, 22, 68)
  body(c, 54, 66, 20, 18, 72)
  c.line(44, 69, 114, 69, "B")                                                     // blue livery stripe
  // engine housing + exhaust
  for (let y = 40; y <= 48; y++) for (let x = 64; x <= 106; x++) { const t = (y - 40) / 8; P(c, x, y, t < 0.2 ? "v" : t < 0.5 ? "u" : t < 0.85 ? "s" : "r") }
  c.rect(64, 40, 3, 9, "r"); c.rect(104, 42, 6, 5, "7"); c.rect(108, 43, 3, 3, "k")
  for (let x = 72; x < 100; x += 4) c.vline(x, 43, 4, "r")                         // intake grille
  // canopy and door glazing
  glass(c, [36, 66, 40, 54, 50, 46, 66, 44, 68, 62, 52, 70, 38, 70])
  glass(c, [72, 47, 92, 46, 94, 62, 72, 63]); c.rect(92, 46, 3, 17, "s")
  glass(c, [96, 47, 106, 49, 108, 60, 96, 62])
  c.vline(69, 44, 26, "r")                                                         // door line
  c.rect(84, 72, 6, 2, "o")                                                        // door handle
  // searchlight under the nose, belly strobe
  c.rect(46, 80, 10, 6, "n"); c.rect(46, 80, 10, 1, "o"); c.rect(44, 81, 3, 4, "W"); P(c, 44, 82, "p")
  c.rect(80, 86, 3, 2, "R")
  // near skid + struts
  c.line(66, 80, 64, 94, "8", 2); c.line(98, 82, 100, 94, "8", 2)
  c.line(52, 94, 116, 94, "7", 2); c.line(46, 90, 52, 94, "7", 2); c.line(52, 93, 116, 93, "9")
  // mast + rotor head
  c.rect(84, 32, 4, 9, "D"); c.rect(79, 30, 14, 3, "m"); c.hline(79, 30, 14, "o")
  c.rect(166, 40, 3, 2, "R")                                                       // tail beacon
  outline(c)
  // rotors last so the outline pass doesn't trace them
  const th = (frame * Math.PI) / 4
  for (let y = 22; y <= 40; y++) for (let x = 0; x < c.w; x++) {                   // faint rotor disc (ordered dither)
    const nx = (x - 86) / 84, ny = (y - 31) / 7
    if (nx * nx + ny * ny <= 1 && !c.is(x, y, "*") && (x * 3 + y * 5 + frame) % 9 === 0) c.px(x, y, "n")
  }
  for (const s of [1, -1]) {
    const ex = 86 + s * Math.cos(th) * 84, ey = 31 + s * Math.sin(th) * 7
    c.line(86, 31, Math.round(ex), Math.round(ey), "D"); c.line(86, 30, Math.round(ex), Math.round(ey) - 1, "m")
  }
  c.rect(84, 29, 5, 4, "k"); c.rect(85, 30, 3, 2, "o")
  // tail rotor
  for (let y = 44; y <= 60; y++) for (let x = 160; x <= 178; x++) if (Math.hypot(x - 169, y - 52) <= 8 && !c.is(x, y, "*") && (x + y * 3 + frame) % 5 === 0) c.px(x, y, "n")
  for (const a of [th * 2, th * 2 + Math.PI / 2]) c.line(Math.round(169 - Math.cos(a) * 8), Math.round(52 - Math.sin(a) * 8), Math.round(169 + Math.cos(a) * 8), Math.round(52 + Math.sin(a) * 8), "D")
  c.rect(168, 51, 3, 3, "m")
}

sprite("police_helicopter", { w: 192, h: 128 }, (c) => heli(c, 0))
anim("police_helicopter_anim", { w: 192, h: 128, frames: 4, fps: 16 }, (c) => heli(c, c.frame))
