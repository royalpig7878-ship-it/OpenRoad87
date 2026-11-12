// OPEN ROAD '87 cockpits, Test Drive (1987) style.
// Drawn at 480x270 logical px, exported 2x -> 960x540 by export.mjs.

const BIG = 26, SMALL = 18   // the two big gauges are 26 so a round wheel can enclose both (see WHEELS)
const WHEEL = { cx: 240, cy: 266, rx: 150, ry: 96 }
// Windshield opening (genuine transparent cutout) and the rear-view mirror that hangs into it.
const OPEN = [16, 18, 464, 18, 472, 26, 476, 150, 4, 150, 8, 26]

const COMMON = { k: "#050507", m: "#3a3d46", n: "#6a6e7a", o: "#b8bcc8", p: "#e8ebf2",
  G: "#1e2a36", J: "#4a6276", R: "#ff3b30", Y: "#ffb020", Z: "#3ddc6a", B: "#3aa0ff", D: "#1c1c22", Q: "#ffffff", N: "#ff2a1a" }

// Layout items: big gauges are r=BIG, small ones r=SMALL unless r is given.
const big = (k, x) => ({ k, x, y: 214, r: BIG })
const small = (k, x, y = 212, r = SMALL) => ({ k, x, y, r })

const THEMES = {
  vortex_gt: { tag: "VGT", // panel 1: wide pod, volts left, fuel right, clock under the rim
    name: "cockpit_vortex_gt", thick: 0.12, cowl: "angular",
    gauges: [small("volts", 62), big("rpm", 205), big("speedo", 275), small("clock", 240, 196, 11), small("fuel", 418)],
    extras: [["tiles", 40, 236, 4], ["tiles", 396, 236, 4]],
    pal: { l: "#14141a", L: "#26262e", M: "#3a3a46", h: "#1a1a20", H: "#2c2c36",
      a: "#101014", b: "#1d1d26", c: "#2e2e3a", d: "#4a4a5a", s: "#c8243a", t: "#6a0f1c",
      g: "#0b0b10", f: "#2a2a34", w: "#f2efe8", i: "#f2efe8", v: "#141418", V: "#24242c", X: "#44444f", e: "#ff2a3a" },
  },
  night_hawk: { tag: "NH-2", // panel 2: oil/gas + T/oil-p pods left, clock right, vent right
    name: "cockpit_night_hawk", thick: 0.12, cowl: "round",
    gauges: [small("oil", 40, 216), small("temp", 92, 218), big("rpm", 205), big("speedo", 275), small("clock", 370, 218)],
    extras: [["vent", 388, 196, 86, 42], ["buttons", 392, 246]],
    pal: { l: "#0e0e12", L: "#1a1a20", M: "#2a2a32", h: "#121216", H: "#202026",
      a: "#14151a", b: "#22242b", c: "#343740", d: "#4d515c", s: "#c88a1e", t: "#6b4a0e",
      g: "#120b04", f: "#3a2a10", w: "#ffbb3a", i: "#ffc24a", v: "#121216", V: "#24252c", X: "#44464f", e: "#ffb020" },
  },
  apex_xr: { tag: "APX", // panel 3: gauge row across the dash, LCD strip, warning tiles
    name: "cockpit_apex_xr", thick: 0.11, cowl: "angular",
    gauges: [small("oil", 34, 206, 16), small("volts", 74, 206, 16), small("temp", 116, 210, 16), big("rpm", 205), big("speedo", 275),
      small("boost", 364, 210, 16), small("fuel", 406, 206, 16), small("clock", 446, 206, 16)],
    extras: [["lcd", 222, 236], ["tiles", 352, 232, 3], ["tiles", 22, 230, 3]],
    pal: { l: "#8d929c", L: "#b4b9c3", M: "#dde0e6", h: "#9aa0ac", H: "#c4c8d2",
      a: "#5a606c", b: "#7d8492", c: "#a2a9b6", d: "#c8cdd8", s: "#3fd0e0", t: "#1f7f94",
      g: "#10141c", f: "#2c3646", w: "#bfe9ff", i: "#7fe8ff", v: "#3a3e48", V: "#5e6470", X: "#a8aeb8", e: "#3fd0e0" },
  },
  thunder_v8: { tag: "V8", // panel 4: two huge gauges, side gauges, switch columns both sides
    name: "cockpit_thunder_v8", thick: 0.17, cowl: "round",
    gauges: [small("temp", 98, 220), big("rpm", 205), big("speedo", 275), small("fuel", 382, 220)],
    extras: [["column", 22, 186, 4], ["column", 458, 186, 4]],
    pal: { l: "#2b1a10", L: "#5b3a20", M: "#8a5a30", h: "#2a1c12", H: "#4c3322",
      a: "#1a1410", b: "#2c2018", c: "#44301f", d: "#6b4a2e", s: "#d9a35a", t: "#7a5226",
      g: "#14100a", f: "#3a2c1c", w: "#f0e6c8", i: "#f0e6c8", v: "#1a1008", V: "#3e2614", X: "#6e4826", e: "#ff3b30" },
  },
  silverline_turbo: { tag: "SLT", // panel 5: twin small gauges each side, turbo boost gauge top centre, green indicators
    name: "cockpit_silverline_turbo", thick: 0.12, cowl: "angular",
    gauges: [small("oil", 38, 212, 16), small("volts", 80, 212, 16), big("speedo", 205), small("boost", 240, 197, 11), big("rpm", 275),
      small("temp", 400, 212, 16), small("fuel", 442, 212, 16)],
    extras: [["green", 30, 234], ["green", 412, 234]],
    pal: { l: "#3c4250", L: "#6b7385", M: "#98a1b6", h: "#4a5160", H: "#6d768a",
      a: "#2a2f3a", b: "#444b5a", c: "#646d80", d: "#8a94aa", s: "#3a78e0", t: "#1d3f86",
      g: "#0b1220", f: "#243046", w: "#e8f4ff", i: "#9fd0ff", v: "#1b2f66", V: "#2f5bc0", X: "#6f9cf0", e: "#ff3b30" },
  },
  phantom_x: { tag: "PHX", // panel 6: compact red-lit pod, gear strip, button column right
    name: "cockpit_phantom_x", thick: 0.13, cowl: "angular", redring: true,
    gauges: [small("fuel", 116, 222), big("rpm", 205), big("speedo", 275), small("temp", 364, 222)],
    extras: [["gear", 222, 244], ["column", 458, 186, 4], ["vent", 8, 196, 62, 34]],
    pal: { l: "#0a0a0e", L: "#16161c", M: "#26262e", h: "#0c0c10", H: "#1a1a22",
      a: "#08080c", b: "#14141a", c: "#22222c", d: "#34343f", s: "#7a1018", t: "#3d080c",
      g: "#0a0406", f: "#3a0f12", w: "#ff5a4a", i: "#ff2a2a", v: "#0c0c10", V: "#1c1c24", X: "#3a3a46", e: "#ff2a2a" },
  },
}

const P = (c, x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, k) }
const P2 = (c, pts, k) => c.poly(pts.map(Math.round), k)
const rad = (d) => (d * Math.PI) / 180

// ---------- warning glyph parts (Q is swapped to a lamp colour at stamp time) ----------
const GLYPHS = {
  oil: ".Q.....\nQQQQQQ.\nQQQQQQQ\n.QQQQQ.\n.QQQQQ.",
  batt: ".Q...Q.\nQQQQQQQ\nQ.Q.QQQ\nQQQQQQQ",
  brake: ".QQQQQ.\nQ..Q..Q\nQ..Q..Q\nQ.....Q\nQ..Q..Q\n.QQQQQ.",
  engine: "..QQQ..\n.QQQQQ.\nQQQQQQQ\nQQQQQQQ\n.Q...Q.",
  fuel: "QQQ....\nQ.QQQ..\nQQQQ.Q.\nQQQQ.Q.\nQQQQQQ.\nQQQQQ..",
  turn: "...Q...\n....QQ.\nQQQQQQQ\n....QQ.\n...Q...",
  beam: "...QQQ.\nQ.QQQQQ\nQQQQQQQ\nQ.QQQQQ\n...QQQ.",
}
pal(COMMON)
for (const [k, g] of Object.entries(GLYPHS)) sprite("_g_" + k, g)
const GLYPH_ORDER = ["oil", "batt", "engine", "brake", "fuel", "turn", "beam"]
const GLYPH_COL = { oil: "R", batt: "R", engine: "Y", brake: "R", fuel: "Y", turn: "Z", beam: "B" }

// ---------- steering wheels: a different design for every car ----------
// Rim = a (super)ellipse centred at (cx, cy) with radii rx, ry; n = 2 is a true ellipse (round), larger n is squarer.
// The hub sits 4 px below the rim centre, at the bottom edge of the screen, so the top of the wheel and the spokes that
// point up show. Spoke angles are degrees clockwise from 12 o'clock (spokes pointing down are off screen and omitted).
const WHEELS = {
  vortex_gt:        { cx: 240, cy: 266, rx: 112, ry: 100, n: 2.0, thick: 0.12, rim: "plain", spokes: [-76, 76], spokeW: 7,  spoke: "plain",   hub: "round" },
  night_hawk:       { cx: 240, cy: 266, rx: 107, ry: 100, n: 2.2, thick: 0.13, rim: "grip",  spokes: [-76, 76], spokeW: 9,  spoke: "drilled", hub: "ring" },
  apex_xr:          { cx: 240, cy: 266, rx: 107, ry: 100, n: 2.0, thick: 0.11, rim: "plain", spokes: [-82, 82, { a: 0, len: 16, w: 8 }], spokeW: 6, spoke: "plain", hub: "ring" },
  thunder_v8:       { cx: 240, cy: 258, rx: 108, ry: 92,  n: 2.0, thick: 0.13, rim: "wood",  spokes: [-84, 84], spokeW: 6,  spoke: "chrome",  hub: "pad" },
  silverline_turbo: { cx: 240, cy: 264, rx: 100, ry: 98,  n: 2.2, thick: 0.12, rim: "sport", spokes: [-84, 84], spokeW: 9,  spoke: "wide",    hub: "round" },
  phantom_x:        { cx: 240, cy: 258, rx: 103, ry: 92,  n: 2.3, thick: 0.15, rim: "grip",  spokes: [-84, 84, { a: 0, len: 18, w: 12 }], spokeW: 8, spoke: "plain", hub: "slab" },
}
// How these were chosen (scripts/wheel-gauge-overlap.mjs checks it on the real art): the inner opening of the rim must contain both
// big gauges (r = 26 at x 205 and 275, y 214) with 2 px to spare, the rim top must be at or below y = 166 (the gear display now ends at 165),
// and the hub stays low so it does not cover the warning lamps. Spokes start near horizontal so they stay off the gauges even when turned.
const rimDist = (nx, ny, n) => Math.pow(Math.pow(Math.abs(nx), n) + Math.pow(Math.abs(ny), n), 1 / n)

// Size of one spoke/hub animation frame (native px) for a wheel: wide enough for the rim, tall enough for the spokes above the hub.
function frameDims(G) { const hu = Math.ceil(G.ry * (1 - G.thick) + 8); return { fw: G.rx * 2 + 3, fh: hu + 40, hu } }

function wheelRim(c, G, ox, oy) {
  const { rx, ry, n } = G
  for (let y = oy - ry - 1; y <= oy + ry + 1; y++) {
    for (let x = ox - rx - 1; x <= ox + rx + 1; x++) {
      const nx = (x - ox) / rx, ny = (y - oy) / ry, d = rimDist(nx, ny, n)
      const th = G.thick * (G.rim === "sport" ? 1 + 0.6 * Math.pow(Math.abs(nx), 4) : 1)   // sport wheels have fat grips at 3 and 9 o'clock
      if (d > 1 || d < 1 - th) continue
      const t = (1 - d) / th, ang = Math.atan2(ny, nx), lit = -(nx * 0.35 + ny * 0.94)
      let k
      if (t < 0.08 || t > 0.92) k = "k"
      else if (G.rim === "wood") { const g = Math.floor(ang * 24 + t * 2.4) & 1; k = lit > 0.55 && t > 0.2 && t < 0.65 ? (g ? "X" : "V") : (g ? "V" : "v") }   // grain
      else if (lit > 0.75 && t > 0.2 && t < 0.55) k = "X"
      else if (lit > 0.5 && t > 0.15 && t < 0.7) k = ((x + y) & 1) ? "X" : "V"   // dithered highlight band
      else if (t > 0.75) k = "v"
      else k = "V"
      if (G.rim === "grip" && Math.abs(t - 0.5) < 0.07 && (Math.floor((ang * 180) / Math.PI / 4) & 1) === 0) k = "s"   // contrast stitching
      if (G.rim === "sport" && t > 0.78 && t < 0.86) k = "s"                                                            // accent line
      P(c, x, y, k)
    }
  }
}

// How far a spoke at angle a (degrees clockwise from up) runs from the hub before it meets the inside of the rim.
function spokeReach(G, a) {
  const dx = Math.sin(rad(a)), dy = -Math.cos(rad(a)), ix = G.rx * (1 - G.thick) + 2, iy = G.ry * (1 - G.thick) + 2
  let best = 0
  for (let t = 0; t < 400; t++) if (rimDist((t * dx) / ix, (t * dy + 4) / iy, G.n) <= 1) best = t
  return best
}

// Spokes (turned phi degrees) and the hub, drawn about the hub centre (hx, hy).
function wheelSpokes(c, G, hx, hy, phi) {
  const body = G.spoke === "chrome" ? ["k", "n", "o"] : ["k", "V", "X"]
  for (const sp of G.spokes) {
    const a = typeof sp === "number" ? sp : sp.a
    const A = a + phi, dx = Math.sin(rad(A)), dy = -Math.cos(rad(A))
    if (dy > 0.3) continue                                    // points below the screen
    const L = (typeof sp === "object" && sp.len) || spokeReach(G, A), x1 = Math.round(hx + dx * L), y1 = Math.round(hy + dy * L), w = (typeof sp === "object" && sp.w) || G.spokeW
    c.line(hx, hy, x1, y1, body[0], w + 2)
    c.line(hx, hy, x1, y1, body[1], w)
    if (G.spoke === "wide") { c.line(hx + dx * 18, hy + dy * 18, hx + dx * (L - 6), hy + dy * (L - 6), "v", 3); c.line(hx, hy, x1, y1, "s", 1) }
    const f0 = 0.22, f1 = 0.88
    c.line(Math.round(hx + dx * L * f0 - 1), Math.round(hy + dy * L * f0 - 1), Math.round(hx + dx * L * f1 - 1), Math.round(hy + dy * L * f1 - 1), body[2], 1)
    if (G.spoke === "drilled") for (let f = 0.38; f < 0.82; f += 0.11) c.rect(Math.round(hx + dx * L * f) - 1, Math.round(hy + dy * L * f) - 1, 3, 3, "k")   // drilled holes
  }
  const cap = () => { c.ellipse(hx, hy, 7, 5, "k"); c.ellipse(hx, hy, 5, 3, "n"); c.hline(hx - 3, hy - 2, 4, "o") }
  if (G.hub === "pad") {                                      // big horn pad: a rectangle that turns with the wheel
    const rot = (px, py) => [hx + px * Math.cos(rad(phi)) - py * Math.sin(rad(phi)), hy + px * Math.sin(rad(phi)) + py * Math.cos(rad(phi))]
    const box = (hw, hh) => [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)].flat()
    P2(c, box(26, 12), "k"); P2(c, box(24, 10), "V"); P2(c, box(21, 3), "X")
    const [l0, l1] = [rot(-14, 2), rot(14, 2)]; c.line(Math.round(l0[0]), Math.round(l0[1]), Math.round(l1[0]), Math.round(l1[1]), "n", 3)
    c.line(Math.round(l0[0]), Math.round(l0[1]) - 1, Math.round(l1[0]), Math.round(l1[1]) - 1, "o", 1)
  } else if (G.hub === "slab") {                              // small flat hub with a bright ring
    c.ellipse(hx, hy, 19, 10, "k"); c.ellipse(hx, hy, 17, 8, "s"); c.ellipse(hx, hy, 14, 6, "V"); c.ellipse(hx, hy - 1, 10, 3, "X"); cap()
  } else if (G.hub === "ring") {                              // round hub with a coloured ring
    c.ellipse(hx, hy, 26, 14, "k"); c.ellipse(hx, hy, 24, 12, "s"); c.ellipse(hx, hy, 21, 9, "V"); c.ellipse(hx, hy - 2, 18, 5, "X"); c.ellipse(hx, hy - 1, 17, 5, "V"); cap()
  } else {                                                    // plain round hub
    c.ellipse(hx, hy, 26, 14, "k"); c.ellipse(hx, hy, 24, 12, "V"); c.ellipse(hx, hy - 2, 20, 8, "X"); c.ellipse(hx, hy - 1, 19, 8, "V"); cap()
  }
}

// The whole wheel at rest (used for the full cockpit scenes that have the wheel baked in).
function wheelFull(c, G) { wheelRim(c, G, G.cx, G.cy); wheelSpokes(c, G, G.cx, G.cy + 4, 0) }

// ---------- gauges with numerals ----------
const GAUGE = {
  rpm: { st: 135, sw: 270, n: 16, majors: 2, labels: ["0", "1", "2", "3", "4", "5", "6", "7", "8"], red: 13 },
  speedo: { st: 135, sw: 270, n: 16, majors: 2, labels: ["0", "", "40", "", "80", "", "120", "", "160"], unit: "MPH" },
  fuel: { st: 210, sw: 120, n: 4, labels: ["E", "F"], cap: "FUEL", redLow: true },
  temp: { st: 210, sw: 120, n: 4, labels: ["C", "H"], cap: "TEMP", redHigh: true, blueLow: true },
  oil: { st: 210, sw: 120, n: 4, labels: ["L", "H"], cap: "OIL", redLow: true },
  volts: { st: 210, sw: 120, n: 4, labels: ["8", "16"], cap: "VOLT", redLow: true },
  boost: { st: 180, sw: 180, n: 6, labels: ["0", "2"], cap: "PSI", blueHigh: true },
  clock: { st: -90, sw: 330, n: 11, clock: true },
}

function gauge(c, g, T, needle = true) {
  const { x: cx, y: cy, r } = g, spec = GAUGE[g.k], red = T.redring
  c.circ(cx, cy, r + 1, "k"); c.circ(cx, cy, r, red ? "t" : "m")
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {          // lit chrome bezel
    const d = Math.hypot(x, y)
    if (d > r - 0.5 || d < r - 1.6) continue
    const lit = -(x + y) / (d * 1.41)
    if (lit > 0.5) P(c, cx + x, cy + y, red ? "e" : "o")
    else if (lit < -0.5) P(c, cx + x, cy + y, "D")
  }
  c.circ(cx, cy, r - 2, "g")
  // ticks
  const N = spec.n
  for (let i = 0; i <= N; i++) {
    if (spec.clock && i === N) break
    const a = rad(spec.st + (spec.sw * i) / N), major = !spec.majors || i % spec.majors === 0
    let col = "w"
    if (spec.red && i >= spec.red) col = "R"
    if (spec.redLow && i === 0) col = "R"
    if (spec.redHigh && i === N) col = "R"
    if (spec.blueLow && i === 0) col = "B"
    if (spec.blueHigh && i === N) col = "B"
    const r1 = r - 3, r2 = r1 - (major ? (r > 20 ? 3 : 2) : 1)
    c.line(Math.round(cx + Math.cos(a) * r1), Math.round(cy + Math.sin(a) * r1),
      Math.round(cx + Math.cos(a) * r2), Math.round(cy + Math.sin(a) * r2), col)
  }
  if (spec.red) for (let i = spec.red; i < N; i++) for (let s = 0; s < 4; s++) {   // red-line arc
    const a = rad(spec.st + (spec.sw * (i + s / 4)) / N); P(c, cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), "R")
  }
  // finer detail: tiny ticks between the main ones, a coloured zone arc along the rim and a ring around the hub
  const fineN = spec.clock ? 0 : (spec.n > 8 ? spec.n * 3 : spec.n * 2)
  for (let i = 0; i < fineN; i++) {
    const t = i / fineN, a = rad(spec.st + spec.sw * t)
    if (Math.abs(t * spec.n - Math.round(t * spec.n)) < 1e-6 || (spec.n > 8 && Math.abs(t * spec.n * 1 - Math.round(t * spec.n)) < 1e-6)) continue
    P(c, cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), spec.red && t * spec.n >= spec.red ? "R" : "f")
  }
  if (r >= 22 && !spec.clock) {
    const zone = (t) => (g.k === "speedo" ? (t < 0.55 ? "Z" : t < 0.8 ? "Y" : "R") : (spec.red && t * spec.n >= spec.red ? "R" : t > 0.62 ? "Y" : "Z"))
    for (let d = 0; d <= 270; d += 2) P(c, cx + Math.cos(rad(135 + d)) * (r - 2.2), cy + Math.sin(rad(135 + d)) * (r - 2.2), zone(d / 270))
  } else if (!spec.clock) {
    for (let d = 0; d <= spec.sw; d += 6) P(c, cx + Math.cos(rad(spec.st + d)) * (r - 2.2), cy + Math.sin(rad(spec.st + d)) * (r - 2.2), "f")
  }
  if (r >= 22) { for (let d = 0; d < 360; d += 12) P(c, cx + Math.cos(rad(d)) * 6, cy + Math.sin(rad(d)) * 6, "f") }
  // numerals
  if (r >= 22 && spec.labels) {
    spec.labels.forEach((L, j) => {
      if (!L) return
      const a = rad(spec.st + (spec.sw * j) / (spec.labels.length - 1)), lr = r - 10
      const col = spec.red && j * spec.majors >= spec.red ? "R" : "w"
      c.text(Math.round(cx + Math.cos(a) * lr), Math.round(cy + Math.sin(a) * lr) - 2, L, col, { align: "c" })
    })
    if (spec.unit) c.text(cx, cy + 9, spec.unit, "f", { align: "c" })
    if (g.k === "rpm") c.text(cx, cy + 9, "X1000", "f", { align: "c" })
    c.text(cx, cy - 7, g.k === "rpm" ? "RPM" : (T.tag || ""), "f", { align: "c" })
    if (g.k === "speedo") { c.rect(cx - 7, cy + 16, 15, 5, "D"); for (let i = 0; i < 5; i++) c.rect(cx - 6 + i * 3, cy + 17, 2, 3, i === 4 ? "R" : "w") } // odometer
  } else if (spec.labels && r >= 12) {
    const [a0, a1] = [rad(spec.st), rad(spec.st + spec.sw)], lr = r - 7
    c.text(Math.round(cx + Math.cos(a0) * lr) + 1, Math.round(cy + Math.sin(a0) * lr) - 1, spec.labels[0], spec.redLow ? "R" : spec.blueLow ? "B" : "w", { align: "c" })
    c.text(Math.round(cx + Math.cos(a1) * lr) - 1, Math.round(cy + Math.sin(a1) * lr) - 1, spec.labels[1], spec.redHigh ? "R" : spec.blueHigh ? "B" : "w", { align: "c" })
    if (spec.cap && r >= 15) c.text(cx, cy + 5, spec.cap, "f", { align: "c" })
  }
  if (spec.clock && r >= 14) { c.text(cx, cy - r + 5, "12", "w", { align: "c" }); c.text(cx, cy + r - 9, "6", "w", { align: "c" }) }
  // needle at rest (Phaser overlays the gauge_* face + an animated needle on top of this)
  if (needle) {
    const a = spec.clock ? rad(-30) : rad(spec.st + spec.sw * 0.02), len = r - (r > 20 ? 5 : 4)
    c.line(cx + 1, cy + 1, Math.round(cx + Math.cos(a) * len) + 1, Math.round(cy + Math.sin(a) * len) + 1, "k")
    c.line(cx, cy, Math.round(cx + Math.cos(a) * len), Math.round(cy + Math.sin(a) * len), "N")
    if (spec.clock) c.line(cx, cy, cx, cy - Math.round(len * 0.6), "N")
  }
  c.circ(cx, cy, r > 20 ? 3 : 2, "k"); c.circ(cx, cy, r > 20 ? 2 : 1, "n"); P(c, cx - 1, cy - 1, "p")
  // glass glint
  for (let a = 205; a <= 245; a += 5) P(c, cx + Math.cos(rad(a)) * (r - 3), cy + Math.sin(rad(a)) * (r - 3), "f")
  if (r >= 22) for (let a = 212; a <= 232; a += 5) P(c, cx + Math.cos(rad(a)) * (r - 5), cy + Math.sin(rad(a)) * (r - 5), "w")   // bright glass glint
}

// ---------- small controls ----------
function button(c, x, y, kind, col = "R") {
  if (kind === "knob") { c.circ(x, y, 5, "k"); c.circ(x, y, 4, "n"); c.circ(x - 1, y - 1, 2, "o"); c.px(x + 1, y + 2, "m"); c.line(x, y, x + 2, y - 3, "k") }
  else if (kind === "push") { c.rect(x - 3, y - 3, 7, 7, "k"); c.rect(x - 2, y - 2, 5, 5, col); c.hline(x - 2, y - 2, 5, "p"); c.hline(x - 2, y + 2, 5, "D") }
  else if (kind === "toggle") { c.rect(x - 3, y - 4, 7, 9, "k"); c.rect(x - 2, y - 3, 5, 7, "m"); c.rect(x - 1, y - 6, 3, 6, "k"); c.rect(x - 1, y - 6, 2, 5, "o"); c.px(x - 1, y - 6, "p") }
  else if (kind === "rocker") { c.rect(x - 4, y - 5, 9, 11, "k"); c.rect(x - 3, y - 4, 7, 4, "n"); c.rect(x - 3, y, 7, 5, "m"); c.hline(x - 3, y - 4, 7, "p"); c.px(x, y - 2, col) }
  else if (kind === "slider") { c.rect(x - 7, y - 2, 15, 5, "k"); c.rect(x - 6, y - 1, 13, 3, "D"); c.rect(x - 2, y - 3, 4, 7, "k"); c.rect(x - 1, y - 2, 2, 5, "o") }
}

function extra(c, e) {
  const [kind, x, y, a, b] = e
  if (kind === "vent") {
    c.rect(x, y, a, b, "k"); c.rect(x + 1, y + 1, a - 2, b - 2, "a")
    for (let yy = y + 3; yy < y + b - 3; yy += 4) { c.hline(x + 3, yy, a - 6, "n"); c.hline(x + 3, yy + 1, a - 6, "m"); c.hline(x + 3, yy + 2, a - 6, "D") }
    c.rect(x + Math.floor(a / 2) - 1, y + 1, 3, b - 2, "k")
    for (const s of [x + 6, x + a - 10]) { c.rect(s, y + b / 2 - 2, 4, 4, "k"); c.rect(s + 1, y + b / 2 - 1, 2, 2, "o") }
  } else if (kind === "tiles") {
    for (let i = 0; i < a; i++) { c.rect(x + i * 11, y, 10, 7, "k"); c.rect(x + i * 11 + 1, y + 1, 8, 5, "D"); c.hline(x + i * 11 + 2, y + 3, 6, ["R", "Y", "Z", "B"][i % 4]) }
  } else if (kind === "green") {
    for (let i = 0; i < 3; i++) { c.rect(x + i * 13, y, 12, 9, "k"); c.rect(x + i * 13 + 1, y + 1, 10, 7, "D"); c.dither(x + i * 13 + 2, y + 2, 8, 5, "D", "Z", 0.5) }
  } else if (kind === "column") {
    c.rect(x - 9, y - 4, 19, a * 16 + 6, "k"); c.rect(x - 8, y - 3, 17, a * 16 + 4, "b")
    const kinds = ["rocker", "push", "toggle", "push"]
    for (let i = 0; i < a; i++) button(c, x, y + 6 + i * 16, kinds[i % 4], ["R", "Y", "R", "Z"][i % 4])
  } else if (kind === "buttons") {
    c.rect(x, y, 78, 18, "k"); c.rect(x + 1, y + 1, 76, 16, "a")
    button(c, x + 10, y + 9, "knob"); button(c, x + 26, y + 9, "push", "Y"); button(c, x + 38, y + 9, "push", "Z"); button(c, x + 52, y + 9, "toggle"); button(c, x + 66, y + 9, "knob")
  } else if (kind === "lcd") {
    c.rect(x, y, 36, 10, "k"); c.rect(x + 1, y + 1, 34, 8, "g")
    for (let i = 0; i < 11; i++) { const h = 1 + Math.min(i, 6); c.rect(x + 2 + i * 3, y + 8 - h, 2, h, i < 8 ? "i" : "R") }
  } else if (kind === "gear") {
    c.rect(x, y, 36, 9, "k"); c.rect(x + 1, y + 1, 34, 7, "g")
    for (let i = 0; i < 6; i++) c.rect(x + 3 + i * 5, y + 2, 4, 5, i === 2 ? "i" : "f")
  }
}

function roundRect(c, x, y, w, h, r, k) {
  c.rect(x + r, y, w - 2 * r, h, k); c.rect(x, y + r, w, h - 2 * r, k)
  c.circ(x + r, y + r, r, k); c.circ(x + w - 1 - r, y + r, r, k); c.circ(x + r, y + h - 1 - r, r, k); c.circ(x + w - 1 - r, y + h - 1 - r, r, k)
}

// ---------- extra dash detail: texture, hardware and switchgear (the dash is a big area the player stares at) ----------
const TEX = { vortex_gt: "carbon", night_hawk: "wood", apex_xr: "brushed", thunder_v8: "wood", silverline_turbo: "brushed", phantom_x: "carbon" }
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v) }

// Material of the instrument panel face: carbon weave, wood grain or brushed metal (kept low-contrast so the gauges stay readable).
function panelTexture(c, id, x0, y0, w, h) {
  const t = TEX[id]
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let k
    if (t === "carbon") k = (((x >> 1) + (y >> 1)) & 1) ? ((y & 1) ? "b" : "c") : ((y & 1) ? "a" : "b")
    else if (t === "wood") { const band = Math.sin(y * 0.9 + Math.sin(x * 0.07) * 3 + hash(0, y >> 1) * 2); k = band > 0.55 ? "f" : band > -0.25 ? "g" : "h" }
    else { const n = hash(x >> 3, y); k = n < 0.12 ? "c" : n < 0.22 ? "a" : "b" }
    P(c, x, y, k)
  }
}

// Boxes that are already taken by gauges, extras and the warning lamps, so loose hardware is only placed on free panel.
function extraBox(e) {
  const [k, x, y, a, b] = e
  if (k === "vent") return [x, y, a, b]
  if (k === "tiles") return [x, y, a * 11, 7]
  if (k === "green") return [x, y, 39, 9]
  if (k === "column") return [x - 9, y - 4, 19, a * 16 + 6]
  if (k === "buttons") return [x, y, 78, 18]
  if (k === "lcd") return [x, y, 36, 10]
  if (k === "gear") return [x, y, 36, 9]
  return [x, y, 1, 1]
}
function isFree(T, x, y, w, h, margin = 2) {
  for (const g of T.gauges) {
    const nx = Math.max(x, Math.min(g.x, x + w)), ny = Math.max(y, Math.min(g.y, y + h))
    if (Math.hypot(nx - g.x, ny - g.y) < g.r + 3 + margin) return false
  }
  for (const e of T.extras) { const [bx, by, bw, bh] = extraBox(e); if (x < bx + bw + margin && x + w > bx - margin && y < by + bh + margin && y + h > by - margin) return false }
  if (x < 204 + 78 && x + w > 200 && y < 255 && y + h > 243) return false      // warning lamps
  return true
}

function screw(c, x, y) { c.circ(x, y, 2, "k"); c.circ(x, y, 1, "n"); P(c, x - 1, y - 1, "o"); P(c, x + 1, y + 1, "m") }

function speakerGrille(c, x, y, w, h) {
  c.rect(x, y, w, h, "k"); c.rect(x + 1, y + 1, w - 2, h - 2, "a")
  for (let yy = y + 2; yy < y + h - 2; yy += 2) for (let xx = x + 2 + ((yy - y) & 2 ? 1 : 0); xx < x + w - 2; xx += 3) { P(c, xx, yy, "k"); P(c, xx, yy - 1, "c") }
  c.hline(x + 1, y, w - 2, "d")
}

// Headliner, dash top and cowl hardware (drawn before the panel so nothing can cover a gauge).
function dashTopDetail(c, T) {
  // headliner: stitching, dome lamp, visor clips
  for (let x = 108; x < 332; x += 4) c.hline(x, 13, 2, "d")
  roundRect(c, 226, 3, 28, 10, 3, "k"); roundRect(c, 228, 4, 24, 8, 2, "m"); c.rect(232, 6, 16, 4, "o"); c.hline(232, 6, 16, "p")
  for (const x of [22, 456]) { c.rect(x - 3, 3, 7, 7, "k"); c.rect(x - 2, 4, 5, 5, "m"); c.rect(x - 1, 5, 3, 3, "n") }
  // dash top: leather grain, seams, speaker grilles, sun sensor
  for (let y = 152; y < 165; y++) for (let x = 6; x < 474; x++) {
    if (x > 186 && x < 294) continue
    const n = hash(x, y)
    if (n < 0.1) P(c, x, y, "a"); else if (n > 0.93) P(c, x, y, "c")
  }
  speakerGrille(c, 30, 153, 62, 11); speakerGrille(c, 388, 153, 62, 11)
  c.vline(100, 152, 14, "k"); c.vline(101, 152, 14, "c"); c.vline(378, 152, 14, "k"); c.vline(379, 152, 14, "c")
  c.rect(104, 158, 4, 4, "k"); c.rect(105, 159, 2, 2, "i")                        // auto-light sensor
  c.rect(372, 158, 4, 4, "k"); c.rect(373, 159, 2, 2, "m")
  // cowl lip: stitching and rivets
  for (let x = 44; x < 437; x += 4) { if (x > 186 && x < 294) continue; const y = T.cowl === "angular" ? 172 : Math.round(214 - 48 * Math.sqrt(Math.max(0, 1 - ((x - 240) / 230) ** 2))) + 3; c.hline(x, y, 2, "d"); c.hline(x, y + 1, 2, "k") }
  for (let x = 54; x < 430; x += 16) {
    if (x > 180 && x < 300) continue
    const y = T.cowl === "angular" ? 177 : Math.round(214 - 46 * Math.sqrt(Math.max(0, 1 - ((x - 240) / 228) ** 2))) + 5
    P(c, x, y, "o"); P(c, x + 1, y + 1, "k")
  }
}

// Switchgear, screws and trim on the panel (drawn after the gauges; only on free spots).
function panelHardware(c, T, rx0, rx1) {
  for (const [x, y] of [[rx0 + 5, 184], [rx1 - 6, 184], [rx0 + 5, 249], [rx1 - 6, 249]]) screw(c, x, y)
  // a row of small switches left and right of where the wheel sits
  const kinds = ["toggle", "push", "knob", "rocker", "toggle", "push"], cols = ["R", "Y", "Z", "B", "R", "Y"]
  let i = 0
  for (let x = rx0 + 16; x < rx1 - 10; x += 13) {
    const W = T.wheel
    if (x > W.cx - W.rx - 10 && x < W.cx + W.rx + 10) continue    // hidden behind the wheel
    const y = 243
    if (!isFree(T, x - 6, y - 8, 13, 16)) continue
    button(c, x, y, kinds[i % 6], cols[i % 6]); c.hline(x - 3, y - 10, 7, "f"); i++
  }
  // engraved labels under the small gauges
  for (const g of T.gauges) {
    if (g.r > 20 || g.k === "clock") continue
    const w = Math.round(g.r * 1.1), y = g.y + g.r + 4
    if (y > 250 || !isFree(T, g.x - w / 2, y, w, 2, 0)) continue
    c.hline(g.x - Math.floor(w / 2), y, w, "d"); c.hline(g.x - Math.floor(w / 2) + 2, y + 2, w - 4, "c")
  }
  // seam lines dividing the panel into sections
  for (const x of [rx0 + 3, rx1 - 4]) { c.vline(x, 182, 68, "k"); c.vline(x + 1, 182, 68, "c") }
}

// Footwell: carpet edge, hood-release lever and a fuse cover.
function footwell(c) {
  c.dither(0, 263, 480, 7, "k", "a", 0.5)
  for (let x = 0; x < 480; x += 3) if (hash(x, 1) > 0.6) P(c, x, 264 + Math.floor(hash(x, 2) * 5), "b")
  c.rect(22, 262, 22, 7, "k"); c.rect(23, 263, 20, 5, "m"); c.rect(25, 264, 10, 3, "R"); c.hline(23, 263, 20, "n")
  c.rect(430, 262, 26, 7, "k"); c.rect(431, 263, 24, 5, "b"); for (let x = 433; x < 454; x += 4) c.vline(x, 264, 3, "k")
}

// ---------- the cockpit ----------
function cockpit(c, T, withWheel = true) {
  c.rect(0, 0, 480, 270, "l")
  // headliner with dithered falloff + radar detector clipped to the visor
  c.rect(0, 0, 480, 18, "h"); c.dither(0, 0, 480, 7, "h", "k", 0.5); c.dither(0, 10, 480, 8, "h", "H", 0.25); c.hline(0, 17, 480, "H")
  c.rect(34, 3, 62, 11, "k"); c.rect(35, 4, 60, 9, "m"); c.hline(35, 4, 60, "o"); c.rect(38, 7, 22, 4, "D")
  for (let i = 0; i < 6; i++) c.rect(64 + i * 4, 8, 2, 2, ["Z", "Z", "Y", "Y", "R", "D"][i])
  // windshield seal
  P2(c, [11, 15, 469, 15, 477, 24, 480, 154, 0, 154, 3, 24], "k")
  P2(c, [13, 16, 467, 16, 475, 25, 479, 152, 1, 152, 5, 25], "m")
  // ---- dash body ----
  P2(c, [0, 156, 30, 150, 450, 150, 480, 156, 480, 270, 0, 270], "b")
  c.grad(0, 150, 480, 24, "dcb", "v", 0.8); c.hline(30, 150, 420, "k"); c.hline(30, 151, 420, "d")
  for (let i = 0; i < 9; i++) { c.rect(110 + i * 8, 156, 5, 2, "a"); c.rect(298 + i * 8, 156, 5, 2, "a") }  // defrost slots
  c.grad(0, 174, 480, 96, "bba", "v", 0.9)
  // cowl over the cluster
  if (T.cowl === "angular") {
    P2(c, [14, 186, 40, 166, 440, 166, 466, 186, 466, 258, 14, 258], "k")
    P2(c, [16, 186, 41, 168, 439, 168, 464, 186, 464, 256, 16, 256], "c")
    c.dither(16, 168, 448, 10, "d", "c", 0.5)
  } else {
    c.ellipse(240, 214, 232, 50, "k"); c.ellipse(240, 214, 230, 48, "c"); c.dither(10, 164, 460, 12, "d", "c", 0.5)
    c.rect(8, 214, 464, 44, "c"); c.vline(8, 214, 44, "k"); c.vline(471, 214, 44, "k")
  }
  // recessed instrument panel sized to the layout
  const xs = T.gauges.map((g) => g.x - g.r), xe = T.gauges.map((g) => g.x + g.r)
  const rx0 = Math.max(18, Math.min(...xs) - 6), rx1 = Math.min(462, Math.max(...xe) + 6)
  roundRect(c, rx0, 178, rx1 - rx0, 76, 10, "k"); roundRect(c, rx0 + 1, 179, rx1 - rx0 - 2, 74, 9, "a")
  c.dither(rx0 + 4, 179, rx1 - rx0 - 8, 6, "k", "a", 0.5)   // shadow under the cowl lip
  c.hline(rx0 + 8, 252, rx1 - rx0 - 16, "c")
  panelTexture(c, T.name.slice(8), rx0 + 3, 182, rx1 - rx0 - 6, 69)
  dashTopDetail(c, T)
  for (const e of T.extras) extra(c, e)
  for (const g of T.gauges) gauge(c, g, T)
  GLYPH_ORDER.forEach((g, i) => c.stamp("_g_" + g, 203 + i * 11, 247, { swap: { Q: "D" } }))   // unlit warning lamps
  panelHardware(c, T, rx0, rx1)
  // lower trim with stitching
  c.hline(0, 259, 480, "k"); c.hline(0, 260, 480, "t"); for (let x = 0; x < 480; x += 4) c.hline(x, 262, 2, "s")
  footwell(c)
  // ---- wheel ----
  if (withWheel) wheelFull(c, T.wheel)
  // ---- cut the windshield, then hang the rear-view mirror into it ----
  c.poly(OPEN, "_")
  rearMirror(c, withWheel)
}

function rearMirror(c, glass = true) {
  c.rect(394, 16, 6, 10, "k"); c.rect(395, 16, 4, 9, "m")                     // stem
  roundRect(c, 336, 24, 126, 30, 6, "k"); roundRect(c, 338, 26, 122, 26, 5, "m")
  if (glass) {
    roundRect(c, 341, 29, 116, 20, 3, "G")
    c.dither(341, 29, 116, 8, "J", "G", 0.5)                                   // sky-side tint (no scenery)
    for (let i = 0; i < 14; i++) { P(c, 360 + i, 48 - i, "J"); P(c, 362 + i, 48 - i, "J") }  // glass glint
  } else {
    roundRect(c, 341, 29, 116, 20, 3, "_")                                     // transparent glass: live rear view shows through
  }
  c.hline(344, 26, 110, "o")
}

for (const [id, T] of Object.entries(THEMES)) T.wheel = WHEELS[id]
pal(COMMON)
for (const T of Object.values(THEMES)) {
  pal({ ...COMMON, ...T.pal })
  ramps("kabcd")
  scene(T.name, { w: 480, h: 270 }, (c) => cockpit(c, T))
  // layered variant: no wheel (the game draws a rotating wheel sprite on top)
  scene(T.name + "_dash", { w: 480, h: 270 }, (c) => cockpit(c, T, false))
}

// ---------- separate animatable components (Vortex GT palette) ----------
const VT = THEMES.vortex_gt
pal({ ...COMMON, ...VT.pal })
const VW = VT.wheel
sprite("steering_wheel", { w: VW.rx * 2 + 3, h: VW.ry * 2 + 3 }, (c) => { wheelRim(c, VW, VW.rx + 1, VW.ry + 1); wheelSpokes(c, VW, VW.rx + 1, VW.ry + 5, 0) })
// Per-cockpit pieces: static rim, spoke/hub frame sheet (rotation steps), and themed gauge faces. Every car has its own wheel design.
const WHEEL_DEG = [-45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45]   // frame i is the wheel turned WHEEL_DEG[i] (steering lock is 45 degrees)
const SHEET_COLS = 4, SHEET_ROWS = 5
for (const T of Object.values(THEMES)) {
  const id = T.name.replace("cockpit_", ""), G = T.wheel, F = frameDims(G)
  pal({ ...COMMON, ...T.pal })
  sprite("steering_wheel_" + id + "_rim", { w: G.rx * 2 + 3, h: G.ry * 2 + 3 }, (c) => wheelRim(c, G, G.rx + 1, G.ry + 1))
  sprite("steering_wheel_" + id + "_spokes", { w: SHEET_COLS * F.fw, h: SHEET_ROWS * F.fh }, (c) => {
    WHEEL_DEG.forEach((deg, i) => {
      const col = i % SHEET_COLS, row = Math.floor(i / SHEET_COLS)
      wheelSpokes(c, G, col * F.fw + G.rx + 1, row * F.fh + F.hu, deg)
    })
  })
  for (const g of T.gauges) sprite("gauge_" + id + "_" + g.k, { w: g.r * 2 + 3, h: g.r * 2 + 3 }, (c) => gauge(c, { k: g.k, x: g.r + 1, y: g.r + 1, r: g.r }, T, false))
}
pal({ ...COMMON, ...VT.pal })
// Glass tint + glint laid over the live rear view (116x20 = the mirror glass).
sprite("mirror_glint", { w: 116, h: 20 }, (c) => {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 116; x++) if ((x + y) % 2 === 0 && y < 7 - (x % 3 === 0 ? 1 : 0)) P(c, x, y, "J")
  for (let i = 0; i < 14; i++) { P(c, 19 + i, 19 - i, "o"); P(c, 21 + i, 19 - i, "o") }
})
const face = (k, r) => (c) => gauge(c, { k, x: r + 1, y: r + 1, r }, {}, false)
sprite("gauge_speedometer", { w: BIG * 2 + 3, h: BIG * 2 + 3 }, face("speedo", BIG))
sprite("gauge_rpm", { w: BIG * 2 + 3, h: BIG * 2 + 3 }, face("rpm", BIG))
sprite("gauge_fuel", { w: SMALL * 2 + 3, h: SMALL * 2 + 3 }, face("fuel", SMALL))
sprite("gauge_temperature", { w: SMALL * 2 + 3, h: SMALL * 2 + 3 }, face("temp", SMALL))
sprite("gauge_needle", { w: BIG - 4, h: 3 }, (c) => { c.hline(0, 1, BIG - 5, "N"); c.hline(0, 2, BIG - 6, "k"); c.rect(0, 0, 3, 3, "n") }) // pivot at (1,1), points right
sprite("gear_indicator", { w: 44, h: 15 }, (c) => {
  c.rect(0, 0, 44, 15, "k"); c.rect(1, 1, 42, 13, "g"); c.hline(1, 1, 42, "D")
  const L = "PRND21"
  for (let i = 0; i < 6; i++) { c.rect(2 + i * 7, 3, 6, 9, "f"); c.text(3 + i * 7, 5, L[i], "w") }
})
sprite("dashboard_warnings", { w: 7 * 11, h: 8 }, (c) => {
  GLYPH_ORDER.forEach((g, i) => c.stamp("_g_" + g, i * 11, 1, { swap: { Q: GLYPH_COL[g] } }))
})
sprite("dashboard_buttons", { w: 124, h: 24 }, (c) => {
  button(c, 7, 8, "knob"); button(c, 22, 8, "knob")
  button(c, 38, 8, "push", "R"); button(c, 50, 8, "push", "Y"); button(c, 62, 8, "push", "Z")
  button(c, 76, 9, "toggle"); button(c, 88, 9, "toggle"); button(c, 102, 10, "rocker", "R"); button(c, 116, 10, "rocker", "Y")
  button(c, 20, 19, "slider")
})

// expose layouts for export.mjs (placements.json)
globalThis.__OPENROAD = { THEMES, WHEEL: THEMES.vortex_gt.wheel, BIG, SMALL, WHEEL_DEG, frameDims }
