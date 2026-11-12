// OPEN ROAD '87 car sprites: perfect side profile, facing right, 256x128, native 1:1 pixel art.
// All six share one baseline (ground y = GROUND before the final vertical centring shift) and one scale.

const GROUND = 100, SHIFT = 8, BODY = "56789"

const COMMON = {
  k: "#08080c", D: "#1c1c24", T: "#24242c", t: "#40404c", m: "#5a5f6c", n: "#8e94a2", o: "#c4c9d4", p: "#f2f4f8",
  G: "#13202e", J: "#2b4560", U: "#9cc4e0", R: "#e02028", N: "#6a0a10", Y: "#ffb020", W: "#fff4d0", B: "#3a78e0", A: "#c89a3a",
}

const P = (c, x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, k) }
const poly = (c, pts, k) => c.poly(pts.map(Math.round), k)
const rad = (d) => (d * Math.PI) / 180

// Chaikin corner-cutting: rounds the faceted silhouette into flowing body lines. Vertices on the floor line stay sharp.
function smoothPts(flat, iters = 2, floorY = 86) {
  let pts = []
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
  const sharp = (p) => p[1] >= floorY
  for (let it = 0; it < iters; it++) {
    const out = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      if (sharp(a) && sharp(b)) { out.push(a); continue }
      out.push(sharp(a) ? a : [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      out.push(sharp(b) ? b : [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    pts = out
  }
  return pts.flat()
}

// ---------------- shading passes ----------------
function shadeBody(c, car) {
  const [cx0, cy0, cx1, cy1] = car.crease
  for (let x = 0; x < c.w; x++) {
    let top = -1, bot = -1
    for (let y = 0; y < c.h; y++) if (c.is(x, y, BODY)) { if (top < 0) top = y; bot = y }
    if (top < 0) continue
    const yc = Math.round(cy0 + ((x - cx0) * (cy1 - cy0)) / (cx1 - cx0))
    for (let y = top; y <= bot; y++) {
      if (!c.is(x, y, BODY)) continue
      const d = y - top, b = bot - y
      let k
      if (d === 0) k = "9"
      else if (d === 1) k = "8"
      else if (y < yc) k = d <= 3 ? "8" : d === 4 ? (((x + y) & 1) ? "8" : "7") : "7"
      else if (y === yc) k = "5"
      else if (y === yc + 1) k = "9"
      else if (y === yc + 2) k = "8"
      else if (b <= 1) k = "5"
      else if (b <= 3) k = "6"
      else if (b === 4) k = ((x + y) & 1) ? "6" : "7"
      else k = "7"
      c.px(x, y, k)
    }
  }
}

// Long soft reflections: a bright shoulder highlight and a lighter reflected-sky band low on the doors.
function sheen(c, car) {
  const [cx0, cy0, cx1, cy1] = car.crease
  for (let x = 14; x < c.w - 10; x++) {
    const yc = Math.round(cy0 + ((x - cx0) * (cy1 - cy0)) / (cx1 - cx0))
    for (const dy of [-3, -2]) {
      const y = yc + dy
      if (c.is(x, y, BODY) && (x % 24) < 16) c.px(x, y, dy === -3 ? "9" : "8")
    }
    const yl = yc + 7
    if (c.is(x, yl, BODY) && (x + yl) % 2 === 0) c.px(x, yl, "6")
  }
}

// Chrome belt trim under the side glass, a roof-rail highlight, and a lit headlamp lens at the nose.
function trimAndLamps(c, car) {
  for (let y = 30; y < 80; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, 'BODY'.length ? BODY : '') && c.is(x, y - 1, 'GJU')) c.px(x, y, 'n')          // chrome under the glass
    if (c.is(x, y, 'GJU') && c.is(x, y - 1, BODY)) c.px(x, y - 1, 'D')                            // dark seal above the glass
  }
  const [lx, ly] = car.lamp || [243, 74]
  c.rect(lx - 3, ly, 7, 3, 'W'); c.hline(lx - 3, ly, 7, 'p'); c.hline(lx - 3, ly + 3, 7, 'n'); P(c, lx - 4, ly + 1, 'Y')
  const [tx, ty] = car.tail || [9, 66]
  c.rect(tx - 1, ty, 4, 2, 'R'); c.hline(tx - 1, ty, 4, 'Y')
}

// paint the 4-connected border of the pixels matching `keys` with `col`
function edge(c, keys, col, inside = true) {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const me = c.is(x, y, keys)
    if (inside !== me) continue
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) return inside
      return inside ? !c.is(X, Y, keys) : c.is(X, Y, keys)
    })
    if (nb) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, col)
}

function glass(c, pts, streaks = [0.3, 0.62]) {
  poly(c, pts, "G")
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!c.is(x, y, "G")) continue
    if (y - y0 < (y1 - y0) * 0.35 && ((x + y) & 1)) c.px(x, y, "J")
    for (const s of streaks) {
      const u = x - (x0 + (x1 - x0) * s) + (y - y0) * 0.7
      if (u >= 0 && u < 3) c.px(x, y, u < 1 ? "U" : "J")
    }
  }
}

// ---------------- wheels ----------------
function wheelWell(c, cx, cy, r, bodyBottom) {
  for (let y = cy - r - 4; y <= bodyBottom; y++) for (let x = cx - r - 4; x <= cx + r + 4; x++) {
    const d = Math.hypot(x - cx, y - cy)
    if (d <= r + 3) P(c, x, y, d > r + 2 ? "5" : "k")
    else if (d <= r + 4 && y < cy && c.is(x, y, BODY)) P(c, x, y, "6")   // arch lip
  }
}

function wheel(c, cx, cy, r, style, ring) {
  c.circ(cx, cy, r, "k"); c.circ(cx, cy, r - 1, "T")
  for (let a = 195; a <= 255; a += 3) P(c, cx + Math.cos(rad(a)) * (r - 2), cy + Math.sin(rad(a)) * (r - 2), "t")
  for (let a = 0; a < 360; a += 15) P(c, cx + Math.cos(rad(a)) * (r - 1), cy + Math.sin(rad(a)) * (r - 1), "D") // tread blocks
  c.ring(cx, cy, r - 3, "D")                                   // tyre sidewall groove
  const rr = Math.round(r * 0.64)
  c.circ(cx, cy, rr + 1, "k"); c.circ(cx, cy, rr, "n")
  const open = style === "star" || style === "slot" || style === "mesh" || style === "disc"
  if (open) {                                                    // dark wheel face with the brake caliper sitting behind the spokes
    c.circ(cx, cy, rr - 1, "D")
    for (let ang = -45; ang <= 25; ang += 3) for (const rrr of [rr - 4, rr - 3, rr - 2]) P(c, cx + Math.cos(rad(ang)) * rrr, cy + Math.sin(rad(ang)) * rrr, rrr === rr - 4 ? "N" : "R")
    P(c, cx + Math.cos(rad(-30)) * (rr - 3), cy + Math.sin(rad(-30)) * (rr - 3), "Y")
  }
  if (style === "star") {
    for (let i = 0; i < 5; i++) {
      const a = rad(i * 72 - 90)
      c.line(cx, cy, Math.round(cx + Math.cos(a) * (rr - 1)), Math.round(cy + Math.sin(a) * (rr - 1)), "o", 3)
      c.line(cx, cy, Math.round(cx + Math.cos(a - 0.12) * (rr - 1)), Math.round(cy + Math.sin(a - 0.12) * (rr - 1)), "p")
    }
  } else if (style === "mesh") {
    for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
      if (Math.hypot(x, y) > rr - 1.5) continue
      if (((x + y) % 3 === 0) || ((x - y) % 3 === 0)) P(c, cx + x, cy + y, "o")
    }
    c.ring(cx, cy, rr - 1, "p")
  } else if (style === "dial") {
    c.circ(cx, cy, rr - 1, "o")
    for (let i = 0; i < 8; i++) { const a = rad(i * 45); c.circ(Math.round(cx + Math.cos(a) * rr * 0.58), Math.round(cy + Math.sin(a) * rr * 0.58), 1, "D") }
  } else if (style === "slot") {
    for (let i = 0; i < 5; i++) {
      const a = rad(i * 72 - 54)
      c.line(cx, cy, Math.round(cx + Math.cos(a) * (rr - 1)), Math.round(cy + Math.sin(a) * (rr - 1)), "o", 5)
    }
    c.ring(cx, cy, rr - 1, "o")
  } else if (style === "steel") {   // black-painted steel wheel, chrome centre cap, lug nuts
    c.circ(cx, cy, rr - 1, "D"); c.ring(cx, cy, rr - 2, "m")
    for (let i = 0; i < 5; i++) { const a = rad(i * 72 - 90); P(c, cx + Math.cos(a) * rr * 0.45, cy + Math.sin(a) * rr * 0.45, "n") }
    c.circ(cx, cy, 3, "n"); c.circ(cx, cy, 2, "o")
  } else if (style === "disc") {
    for (let i = 0; i < 12; i++) {
      const a = rad(i * 30)
      c.line(Math.round(cx + Math.cos(a) * rr * 0.3), Math.round(cy + Math.sin(a) * rr * 0.3),
        Math.round(cx + Math.cos(a + 0.5) * (rr - 1)), Math.round(cy + Math.sin(a + 0.5) * (rr - 1)), "n")
    }
    c.ring(cx, cy, rr - 2, ring || "o")
  }
  // lip light / shadow, then darken the lower-right of the rim
  for (let a = 180; a <= 280; a += 4) P(c, cx + Math.cos(rad(a)) * rr, cy + Math.sin(rad(a)) * rr, "p")
  for (let a = 0; a <= 100; a += 4) P(c, cx + Math.cos(rad(a)) * rr, cy + Math.sin(rad(a)) * rr, "m")
  c.shade((x, y) => (x - cx) + (y - cy) > 2 && Math.hypot(x - cx, y - cy) < rr, 1, 0.5)
  c.circ(cx, cy, 2, "k"); c.circ(cx, cy, 1, "o"); P(c, cx - 1, cy - 1, "p")
}

// ---------------- shared detail helpers ----------------
const vpanel = (c, x, y0, y1) => { for (let y = y0; y <= y1; y++) if (c.is(x, y, BODY)) { c.px(x, y, "5"); if (c.is(x + 1, y, BODY) && y % 3) c.px(x + 1, y, "8") } }
const handle = (c, x, y) => { c.hline(x, y, 5, "k"); c.hline(x, y - 1, 5, "o") }
const mirror = (c, x, y) => { poly(c, [x, y, x + 7, y - 1, x + 8, y + 3, x + 1, y + 4], "6"); c.hline(x + 1, y, 6, "8"); c.hline(x + 1, y + 4, 7, "k") }
const skirt = (c, x0, x1, y, h, col = "D") => { for (let x = x0; x < x1; x++) for (let yy = y; yy < y + h; yy++) if (c.is(x, yy, BODY)) c.px(x, yy, yy === y ? "m" : col) }

// ---------------- the six cars ----------------
const CARS = {
  car_vortex_gt: {
    body: { 5: "#3a0608", 6: "#7a0e14", 7: "#c01a22", 8: "#e8433c", 9: "#ff8a74" },
    rear: [56, 17], front: [198, 15], bottom: 91, wheels: "star", tail: [9, 73],
    pts: [8, 72, 12, 66, 66, 62, 92, 52, 104, 49, 132, 48, 166, 60, 232, 67, 245, 71, 249, 78, 246, 90, 228, 92, 20, 92, 8, 88],
    crease: [8, 75, 248, 80],
    glass: [[100, 51, 130, 50, 158, 60, 96, 62]],
    detail(c) {
      poly(c, [74, 62, 92, 54, 97, 54, 94, 62], "k")                       // rear quarter louvre opening
      for (let x = 76; x < 95; x += 3) c.line(x, 62, x + 3, 55, "D")
      for (let y = 69; y <= 83; y += 3) { c.hline(70, y, 40, "k"); c.hline(70, y + 1, 40, "6") }  // side strakes
      vpanel(c, 98, 62, 88); vpanel(c, 160, 63, 88); handle(c, 114, 66)
      c.line(206, 65, 228, 68, "5"); c.line(206, 63, 228, 66, "9")          // pop-up headlight lid seam
      mirror(c, 160, 58)
      skirt(c, 20, 236, 87, 4)
      c.rect(8, 72, 4, 7, "R"); c.rect(8, 76, 4, 3, "N"); c.rect(8, 81, 6, 8, "D")   // tail light + rear bumper
      c.rect(241, 80, 6, 2, "Y"); c.rect(236, 86, 10, 4, "D")                        // marker + chin
      c.rect(14, 89, 6, 2, "n")                                                          // exhaust tip
    },
  },
  car_night_hawk: {   // notchback coupe: upright rear window, separate trunk with lip spoiler, hood scoop, chrome and gold trim
    body: { 5: "#050608", 6: "#101219", 7: "#1b1f2a", 8: "#2f3647", 9: "#6c7894" },
    rear: [64, 16], front: [194, 16], bottom: 90, wheels: "mesh",
    pts: [8, 86, 8, 66, 12, 63, 52, 62, 58, 60, 84, 45, 130, 45, 160, 60, 234, 63, 246, 67, 249, 77, 247, 88, 236, 90, 18, 90],
    crease: [8, 70, 249, 72], lamp: [246, 70], tail: [9, 67],
    glass: [[60, 59, 84, 47, 100, 47, 100, 59], [105, 47, 128, 47, 152, 59, 105, 59]],
    detail(c) {
      c.rect(100, 46, 5, 14, "5")                                                  // B-pillar
      poly(c, [8, 63, 12, 58, 40, 58, 46, 62], "7"); c.hline(11, 58, 29, "9"); c.hline(10, 62, 36, "5")   // trunk lip spoiler
      for (let x = 10; x < 246; x++) if (c.is(x, 77, BODY)) c.px(x, 77, "A")        // gold pinstripe
      vpanel(c, 86, 60, 88); vpanel(c, 152, 61, 88); handle(c, 130, 65)
      poly(c, [186, 62, 194, 58, 214, 58, 220, 62], "7"); c.hline(194, 58, 20, "9"); c.rect(212, 59, 5, 3, "k")   // hood scoop
      for (let x = 168; x < 180; x += 3) c.rect(x, 69, 2, 8, "k")                   // fender vents
      mirror(c, 150, 55)
      skirt(c, 18, 236, 86, 4, "m")
      c.rect(8, 78, 8, 8, "m"); c.hline(8, 78, 8, "o")                              // chrome rear bumper
      c.rect(238, 78, 10, 8, "m"); c.hline(238, 78, 10, "o")                        // chrome front bumper
      c.rect(16, 88, 6, 2, "n")
    },
  },
  car_apex_xr: {   // cab-forward wedge: knife nose, big rear wheels, tall wing, side intake, scissor door
    body: { 5: "#555b6a", 6: "#8f97a8", 7: "#cfd5df", 8: "#eaedf3", 9: "#ffffff" },
    rear: [62, 19], front: [198, 15], bottom: 92, wheels: "star",
    pts: [6, 88, 6, 66, 10, 62, 40, 60, 84, 50, 108, 44, 128, 44, 160, 53, 224, 62, 243, 68, 249, 77, 246, 90, 230, 92, 22, 92],
    crease: [6, 72, 247, 80], lamp: [245, 72], tail: [8, 67],
    glass: [[98, 51, 112, 45, 128, 45, 156, 55, 150, 60, 98, 60], [62, 58, 82, 53, 94, 51, 94, 60, 60, 60]],
    detail(c) {
      c.rect(14, 50, 3, 12, "6"); c.rect(36, 50, 3, 11, "6")                       // wing struts
      poly(c, [2, 44, 48, 44, 48, 50, 4, 51], "7"); c.hline(3, 44, 45, "9"); c.hline(4, 50, 44, "5"); c.rect(2, 42, 3, 10, "6")   // tall wing
      for (let x = 44; x < 82; x += 4) c.line(x, 61, x + 2, 59, "6")                // engine louvres
      poly(c, [76, 66, 98, 64, 96, 82, 82, 82], "k"); for (let y = 68; y < 82; y += 3) c.hline(82, y, 14, "D")   // big side intake
      vpanel(c, 98, 60, 90); c.line(150, 60, 166, 84, "5"); handle(c, 132, 66)       // scissor-door outline
      poly(c, [186, 60, 204, 62, 186, 64], "5")                                        // NACA duct
      c.line(212, 63, 234, 66, "5")                                                   // pop-up lamp lid
      mirror(c, 140, 53)
      skirt(c, 24, 230, 88, 4)
      c.rect(6, 76, 6, 4, "N"); c.rect(6, 82, 8, 9, "D")                              // tail panel and diffuser
      c.rect(12, 89, 5, 3, "n"); c.rect(20, 89, 5, 3, "n")                            // quad exhausts
      c.rect(232, 86, 14, 5, "D"); c.hline(232, 86, 14, "m")                          // front splitter
    },
  },
  car_thunder_v8: {   // fastback grand tourer: long hood with power bulge, hatch glass, two-tone lower body, round tail lamps
    body: { 5: "#3a1404", 6: "#8a3208", 7: "#d8581a", 8: "#f58a3c", 9: "#ffc27a" },
    rear: [66, 17], front: [196, 16], bottom: 91, wheels: "slot",
    pts: [8, 88, 6, 72, 8, 66, 24, 62, 48, 60, 96, 44, 124, 44, 150, 58, 232, 63, 246, 70, 249, 80, 247, 90, 232, 91, 20, 91],
    crease: [6, 74, 249, 74], lamp: [245, 72], tail: [9, 70],
    glass: [[54, 59, 94, 46, 100, 46, 100, 59], [104, 46, 124, 46, 146, 58, 104, 58]],
    detail(c) {
      c.rect(100, 45, 4, 14, "5")
      skirt(c, 18, 234, 80, 11, "D")                                               // two-tone: charcoal lower body
      for (let x = 12; x < 244; x++) if (c.is(x, 80, BODY)) c.px(x, 80, "n")         // chrome division strip
      poly(c, [176, 60, 190, 56, 214, 57, 220, 62], "7"); c.hline(190, 56, 24, "9"); c.rect(210, 58, 6, 3, "k")   // power bulge
      for (let x = 98; x < 112; x += 3) c.line(x, 83, x + 2, 78, "k")               // side gills
      vpanel(c, 108, 58, 80); vpanel(c, 152, 59, 80); handle(c, 128, 63)
      c.line(212, 65, 232, 67, "5")
      mirror(c, 146, 53)
      for (const y of [68, 75]) { c.circ(10, y, 3, "k"); c.circ(10, y, 2, "R"); P(c, 9, y - 1, "p") }   // round tail lamps
      c.rect(14, 88, 6, 3, "n"); c.rect(24, 88, 6, 3, "n")
      c.rect(238, 78, 11, 9, "D"); c.hline(238, 78, 11, "m")
    },
  },
  car_silverline_turbo: {   // hot hatch: tall greenhouse, chopped hatchback tail, short hood with intake, blue stripes
    body: { 5: "#3a3f4a", 6: "#6e7584", 7: "#a2a9b6", 8: "#cbd1db", 9: "#f6f8fb" },
    rear: [58, 15], front: [186, 15], bottom: 90, wheels: "dial",
    pts: [18, 88, 13, 68, 18, 62, 30, 59, 52, 44, 116, 44, 140, 56, 218, 60, 238, 64, 245, 74, 242, 88, 230, 90, 24, 90],
    crease: [13, 72, 245, 74], lamp: [241, 67], tail: [15, 66],
    glass: [[36, 57, 52, 46, 62, 46, 62, 57], [66, 46, 92, 46, 92, 57, 66, 57], [96, 46, 114, 46, 134, 56, 96, 56]],
    detail(c) {
      poly(c, [14, 64, 18, 60, 32, 58, 32, 61], "D"); c.line(16, 62, 31, 59, "m")        // small lip spoiler
      for (const y of [76, 80]) for (let x = 12; x < 243; x++) if (c.is(x, y, BODY)) c.px(x, y, y === 76 ? "B" : "t")   // blue stripe + shadow line
      vpanel(c, 94, 57, 86); vpanel(c, 148, 58, 86); handle(c, 116, 62)
      poly(c, [170, 59, 180, 56, 198, 57, 204, 60], "7"); c.hline(180, 56, 18, "9"); for (let x = 184; x < 198; x += 3) c.vline(x, 57, 3, "k")   // turbo intake
      c.line(206, 60, 226, 62, "5")
      c.rect(238, 80, 5, 3, "Y")                                                      // fog lamp
      mirror(c, 134, 52)
      skirt(c, 24, 230, 86, 4)
      c.rect(230, 84, 12, 5, "D"); c.hline(230, 84, 12, "m")
      c.rect(18, 88, 5, 2, "n")
    },
  },
  car_phantom_x: {   // stealth supercar: bubble canopy, tail fin, razor nose, red accent line
    body: { 5: "#050508", 6: "#0f0f16", 7: "#1b1b26", 8: "#30304a", 9: "#6a6a90" },
    rear: [60, 17], front: [198, 16], bottom: 92, wheels: "disc", ring: "R",
    pts: [6, 90, 6, 68, 12, 62, 44, 57, 72, 52, 100, 44, 128, 43, 156, 50, 212, 60, 242, 67, 250, 76, 248, 88, 240, 92, 20, 92],
    crease: [6, 72, 248, 84], lamp: [246, 72], tail: [8, 66],
    glass: [[88, 53, 104, 45, 128, 44, 152, 51, 160, 57, 90, 58]],
    detail(c) {
      poly(c, [8, 58, 34, 49, 46, 49, 42, 57], "7"); c.line(9, 57, 34, 49, "9"); c.rect(14, 57, 3, 4, "6")   // tail fin
      for (let x = 38; x < 80; x += 4) c.rect(x, 56, 2, 2, "k")                       // engine vents
      for (let x = 6; x < 248; x++) { const y = Math.round(74 + ((x - 6) * 10) / 242); if (c.is(x, y, BODY)) c.px(x, y, "R") }   // red accent line
      poly(c, [98, 70, 130, 66, 128, 82, 100, 82], "k"); for (let y = 69; y < 82; y += 2) c.hline(101, y, 26, "D")   // side intake
      vpanel(c, 88, 58, 90); vpanel(c, 164, 59, 90)
      c.line(214, 62, 236, 65, "5")
      mirror(c, 150, 53)
      skirt(c, 20, 240, 88, 4)
      c.rect(6, 80, 6, 4, "N"); c.rect(6, 85, 6, 6, "D")
      c.hline(238, 84, 10, "R"); c.rect(236, 88, 12, 4, "D")
      c.rect(12, 89, 6, 3, "n")
    },
  },
}

// ---------------- collision damage (Vortex GT geometry, pre-shift coordinates) ----------------
const onBody = (c, x, y) => c.is(x, y, BODY)
function bodyLine(c, x0, y0, x1, y1, col, keys = BODY) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n)
    if (c.is(x, y, keys)) c.px(x, y, col)
  }
}
// dent: shadowed upper rim (light comes from above), bright lower lip, crease where the panel folded
function dent(c, cx, cy, rx, ry, deep = 1) {
  const inE = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && onBody(c, x, y)
  const upper = (x, y) => inE(x, y) && y < cy + ry * 0.15
  const lower = (x, y) => inE(x, y) && y > cy + ry * 0.45
  c.shade(upper, deep); c.shade((x, y) => inE(x, y) && y < cy - ry * 0.4, 1, 0.5)
  c.light(lower, 1)
  for (let a = 200; a <= 340; a += 4) { const x = Math.round(cx + Math.cos(rad(a)) * rx), y = Math.round(cy + Math.sin(rad(a)) * ry); if (onBody(c, x, y)) c.px(x, y, "5") }
  for (let a = 30; a <= 150; a += 6) { const x = Math.round(cx + Math.cos(rad(a)) * rx), y = Math.round(cy + Math.sin(rad(a)) * ry); if (onBody(c, x, y)) c.px(x, y, "9") }
}
function scratch(c, x0, y0, x1, y1) { bodyLine(c, x0, y0, x1, y1, "o"); bodyLine(c, x0, y0 + 1, x1, y1 + 1, "5") }
// paint chipped down to grey primer / bare metal, in a seeded cluster
function chips(c, x, y, w, h, n, seed) {
  let s = seed
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < n; i++) {
    const px = Math.round(x + r() * w), py = Math.round(y + r() * h)
    if (!onBody(c, px, py)) continue
    c.px(px, py, "n"); if (r() < 0.5 && onBody(c, px + 1, py)) c.px(px + 1, py, "m"); if (r() < 0.3) P(c, px, py - 1, "o")
  }
}
function crack(c, x, y, rays, len, seed) {
  let s = seed
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < rays; i++) {
    let a = (i / rays) * Math.PI * 2 + r() * 0.5, px = x, py = y
    const L = len * (0.6 + r() * 0.6)
    for (let k = 0; k < L; k++) {
      a += (r() - 0.5) * 0.5; px += Math.cos(a); py += Math.sin(a)
      if (!c.is(Math.round(px), Math.round(py), "GJUD")) break
      c.px(Math.round(px), Math.round(py), "p")
    }
  }
  for (let a = 0; a < 360; a += 20) { const X = Math.round(x + Math.cos(rad(a)) * len * 0.35), Y = Math.round(y + Math.sin(rad(a)) * len * 0.35); if (c.is(X, Y, "GJU")) c.px(X, Y, "U") }
  if (c.is(x, y, "GJU")) c.px(x, y, "p")
}

function damage(c, level) {
  // ---- light: scratches, small dents, chipped paint ----
  scratch(c, 104, 72, 126, 70); scratch(c, 110, 76, 136, 73); scratch(c, 30, 77, 44, 76)
  dent(c, 148, 79, 6, 3); dent(c, 222, 80, 5, 3)
  chips(c, 228, 76, 14, 10, 26, 7); chips(c, 12, 74, 10, 10, 16, 3)
  if (level < 2) return
  // ---- medium: bigger dents, cracked glass, bumper knocked loose ----
  dent(c, 128, 78, 14, 6); dent(c, 84, 71, 9, 5); dent(c, 214, 78, 10, 4)
  scratch(c, 166, 80, 196, 76); scratch(c, 170, 83, 194, 80)
  crack(c, 140, 56, 7, 14, 11)
  for (let y = 84; y <= 92; y++) for (let x = 232; x <= 250; x++) if (c.is(x, y, "D")) c.px(x, y, "_")   // chin spoiler torn off its mount
  poly(c, [230, 88, 244, 87, 250, 93, 236, 94], "D"); c.line(231, 88, 244, 87, "m"); c.line(244, 87, 250, 93, "k")
  for (let y = 81; y <= 89; y++) for (let x = 6; x <= 15; x++) if (c.is(x, y, "D")) c.px(x, y, "_")        // rear bumper sagging
  poly(c, [6, 83, 14, 82, 16, 91, 8, 93], "D"); c.line(6, 83, 14, 82, "m")
  if (level < 3) return
  // ---- heavy: crumpled nose, broken lights, caved door, buckled hood, shattered glass ----
  c.poly([226, 60, 256, 60, 256, 100, 226, 100], "_")
  poly(c, [226, 72, 233, 73, 231, 76, 238, 76, 235, 80, 241, 82, 236, 85, 240, 89, 228, 92, 226, 92], "6")
  for (const [a, b, d, e] of [[227, 74, 232, 76], [229, 79, 236, 81], [228, 84, 235, 86], [227, 88, 236, 89]]) { c.line(a, b, d, e, "9"); c.line(a, b + 1, d, e + 1, "5") }
  c.rect(232, 74, 3, 2, "k"); c.px(233, 74, "Y")                                                          // smashed marker housing
  poly(c, [206, 66, 216, 58, 224, 61, 214, 70], "6"); c.line(206, 66, 216, 58, "9"); c.line(214, 70, 224, 61, "5")  // pop-up lid jammed half open
  poly(c, [209, 67, 216, 61, 220, 63, 214, 69], "k"); P(c, 213, 65, "W"); P(c, 216, 63, "n"); P(c, 211, 67, "W")    // broken headlamp lens
  poly(c, [176, 66, 188, 59, 196, 67], "7"); c.line(176, 66, 188, 59, "9"); c.line(188, 59, 196, 67, "5")             // hood buckled upward
  dent(c, 130, 77, 24, 9, 2); bodyLine(c, 108, 73, 152, 80, "5"); bodyLine(c, 112, 80, 148, 74, "5")               // door caved in
  dent(c, 82, 72, 12, 7, 2); dent(c, 24, 78, 10, 6)
  scratch(c, 140, 82, 190, 78); scratch(c, 150, 85, 186, 82); chips(c, 140, 76, 50, 10, 60, 19)
  poly(c, [112, 53, 126, 52, 132, 58, 118, 61, 108, 58], "D")                                           // glass chunk gone (dark cabin)
  for (const [x, y] of [[112, 53], [118, 61], [126, 52], [132, 58], [108, 58]]) P(c, x, y, "p")
  crack(c, 136, 56, 9, 18, 5); crack(c, 104, 58, 5, 8, 9)
  for (let y = 70; y <= 80; y++) for (let x = 6; x <= 13; x++) if (c.is(x, y, "RN")) c.px(x, y, (x + y) % 3 ? "k" : "R")   // shattered tail light
}

function car(c, C, level = 0, fixedDx) {
  poly(c, smoothPts(C.pts), "7")
  shadeBody(c, C)
  sheen(c, C)
  for (const g of C.glass) glass(c, g)
  edge(c, "GJU", "k")
  C.detail(c)
  trimAndLamps(c, C)
  if (level) damage(c, level)
  wheelWell(c, C.rear[0], GROUND - C.rear[1], C.rear[1], C.bottom)
  wheelWell(c, C.front[0], GROUND - C.front[1], C.front[1], C.bottom)
  wheel(c, C.rear[0], GROUND - C.rear[1], C.rear[1], C.wheels, C.ring)
  wheel(c, C.front[0], GROUND - C.front[1], C.front[1], C.wheels, C.ring)
  edge(c, "*", "k", false)                                    // crisp 1px outline
  { const sx0 = 14, sx1 = 246
    for (let x = sx0; x <= sx1; x++) { const t = (x - (sx0 + sx1) / 2) / ((sx1 - sx0) / 2), a = Math.sqrt(Math.max(0, 1 - t * t))
      for (let k = 0; k < 3; k++) if (!c.is(x, GROUND + k, "*") || (c.get(x, GROUND + k) & 255) === 0) if (a * (3 - k) > 1.1) c.px(x, GROUND + k, ["#00000070", "#00000048", "#00000028"][k]) } }                      // soft ground shadow
  // centre horizontally on the opaque bounds; move up by SHIFT (same baseline for every car)
  const px = []
  let x0 = c.w, x1 = -1
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const v = c.get(x, y); px.push(v); if (v & 255) { x0 = Math.min(x0, x); x1 = Math.max(x1, x) } }
  const dx = fixedDx ?? Math.floor((c.w - (x1 - x0 + 1)) / 2) - x0
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const sx = x - dx, sy = y + SHIFT
    const v = sy < c.h && sx >= 0 && sx < c.w ? px[sy * c.w + sx] : 0
    c.px(x, y, (v & 255) ? "#" + (v >>> 0).toString(16).padStart(8, "0") : "_")
  }
}

for (const [name, C] of Object.entries(CARS)) {
  pal({ ...COMMON, ...C.body })
  ramps("k56789", "kDmnop", "GJU")
  sprite(name, { w: 256, h: 128 }, (c) => car(c, C))
}

// Damage states of the hero car (Vortex GT). Centring offset is pinned to the undamaged car's (0)
// so the body and wheels land on exactly the same pixels in every state.
pal({ ...COMMON, ...CARS.car_vortex_gt.body })
ramps("k56789", "kDmnop", "GJU")
;["light", "medium", "heavy"].forEach((lv, i) =>
  sprite("car_damage_" + lv, { w: 256, h: 128 }, (c) => car(c, CARS.car_vortex_gt, i + 1, 0)))

// ---------------- police cruiser, side view for menus / garage ----------------
const POLICE_SIDE = {
  body: { 5: "#06070a", 6: "#101219", 7: "#1b1e28", 8: "#2c3140", 9: "#5a6278",
    q: "#6a6e78", r: "#a6abb6", s: "#d6dae2", u: "#eef0f4", v: "#ffffff" },
  rear: [60, 15], front: [194, 15], bottom: 90, wheels: "steel",
  pts: [6, 70, 8, 62, 50, 60, 70, 59, 88, 45, 142, 44, 160, 58, 238, 61, 247, 63, 249, 74, 247, 88, 236, 90, 14, 90, 6, 86],
  crease: [6, 72, 249, 72],
  glass: [[92, 47, 114, 46, 114, 58, 80, 58], [118, 46, 140, 46, 156, 58, 118, 58]],
  detail(c) {
    const toWhite = { 5: "q", 6: "r", 7: "s", 8: "u", 9: "v" }
    skirt(c, 14, 236, 86, 4)
    c.recolor(toWhite, [84, 40, 76, 19])                                        // white roof and pillars
    c.recolor(toWhite, [80, 59, 82, 27])                                        // white doors
    c.rect(114, 46, 4, 13, "s")                                                 // B-pillar
    for (const x of [80, 118, 161]) for (let y = 59; y <= 86; y++) if (c.is(x, y, "qrsuv")) c.px(x, y, "q")
    poly(c, [96, 64, 104, 64, 104, 69, 100, 72, 96, 69], "A"); c.hline(97, 65, 6, "Y")   // plain shield, no lettering
    handle(c, 106, 62); handle(c, 140, 62)
    c.rect(102, 39, 30, 5, "D"); c.hline(102, 39, 30, "n")                       // roof light bar
    c.rect(103, 40, 12, 3, "R"); c.rect(119, 40, 12, 3, "B"); c.rect(115, 40, 4, 3, "o")
    c.hline(105, 41, 3, "p"); c.hline(124, 41, 3, "p")
    c.rect(150, 51, 6, 3, "o"); c.hline(150, 53, 6, "m")                        // A-pillar spotlight
    c.vline(20, 38, 22, "D")                                                    // trunk whip antenna
    mirror(c, 154, 55)
    c.rect(6, 64, 4, 7, "R"); c.rect(6, 71, 4, 2, "p"); c.rect(5, 76, 8, 9, "n"); c.hline(5, 76, 8, "o")
    c.rect(245, 64, 4, 6, "W"); c.rect(245, 70, 4, 2, "Y"); c.rect(238, 76, 11, 9, "n"); c.hline(238, 76, 11, "o")
    c.rect(249, 72, 2, 14, "D")                                                 // push bumper
    c.rect(14, 88, 6, 2, "n")
  },
}
pal({ ...COMMON, ...POLICE_SIDE.body })
ramps("k56789", "kDmnop", "GJU", "qrsuv")
sprite("police_cruiser_side", { w: 256, h: 128 }, (c) => car(c, POLICE_SIDE))
