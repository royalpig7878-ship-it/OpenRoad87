// OPEN ROAD '87 highway traffic. Each vehicle is a small 3D box model in metres
// (x across, y up, z forward from the rear bumper), drawn with one fixed oblique
// three-quarter projection seen from slightly above. "rear" = driving away from the camera,
// "front" = oncoming (the model flipped end for end). 192x128, auto-fitted and centred.

let A = 0.2, B = 0.1            // screen shift per metre of depth: right, up (A = 0 gives a straight-on view)
const STRAIGHT = { A: 0, B: 0.03, S: 64 }   // straight-on view: slight roof, fixed 64 px/m
const CW = 192, CH = 128, PAD = 5

const COMMON = {
  k: "#08080c", D: "#1e1e26", T: "#26262e", t: "#44444e", m: "#5c6170", n: "#9096a4", o: "#c8ccd6", p: "#f4f6fa",
  G: "#132030", J: "#2c4862", U: "#a0c8e4", R: "#e0201c", N: "#6e0c0c", Y: "#ffb020", W: "#fff6d8", P: "#e6e0c6",
}

const P = (c, x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px(x, y, k) }
const lerp = (a, b, t) => a + (b - a) * t
const lerp3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]
const bil = (Q, u, v) => lerp3(lerp3(Q[0], Q[1], u), lerp3(Q[3], Q[2], u), v)

// hexahedron part: bottom footprint (x0b..x1b, z0b..z1b) at y0, top (x0t..x1t, z0t..z1t) at y1
function hexa(o) {
  return { x0t: o.x0b, x1t: o.x1b, z0t: o.z0b, z1t: o.z1b, ...o }
}
const box = (x0, x1, y0, y1, z0, z1, col, extra = {}) => hexa({ x0b: x0, x1b: x1, y0, y1, z0b: z0, z1b: z1, ...col, ...extra })
const sym = (w, y0, y1, z0, z1, col, extra) => box(-w, w, y0, y1, z0, z1, col, extra)

// ---------------- renderer ----------------
function extent(V) {
  const L = V.L
  let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9
  const { r, axles, track, tw = 0.22 } = V.wheels
  const tyreBoxes = axles.map((z) => box(-track - tw / 2, track + tw / 2, 0, 2 * r, z - r * 1.12, z + r * 1.12, {}))
  for (const p of [...V.parts, ...tyreBoxes]) for (const x of [p.x0b, p.x1b, p.x0t, p.x1t]) for (const [y, zs] of [[p.y0, [p.z0b, p.z1b]], [p.y1, [p.z0t, p.z1t]]]) for (const z of zs) for (const zz of [z, L - z]) {
    const u = x + zz * A, w = y + zz * B; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w)
  }
  return { u0, u1, w0, w1 }
}

// canvas size (px) and scale for the straight-on rear sprite of a vehicle
function straightDims(V) {
  const sa = [A, B]; A = STRAIGHT.A; B = STRAIGHT.B
  const e = extent(V)
  A = sa[0]; B = sa[1]
  return { w: Math.ceil((e.u1 - e.u0) * STRAIGHT.S) + 2 * PAD, h: Math.ceil((e.w1 - e.w0) * STRAIGHT.S) + 2 * PAD }
}

function view(V, mode, cw = CW, ch = CH, fixedS = null) {
  const L = V.L, flip = mode === "front"
  const vz = (z) => (flip ? L - z : z)
  const { u0, u1, w0, w1 } = extent(V)
  const s = fixedS ?? Math.min((cw - 2 * PAD) / (u1 - u0), (ch - 2 * PAD) / (w1 - w0))
  const OX = cw / 2 - (s * (u0 + u1)) / 2, OY = ch / 2 + (s * (w0 + w1)) / 2
  // project natural coords (z from the rear) into screen space for this view
  const q = (x, y, z) => { const zz = vz(z); return [OX + s * (x + zz * A), OY - s * (y + zz * B)] }
  return { s, q, vz, flip, L, straight: A === 0, near: (v) => (flip ? L - v : v) }
}

function quad(c, D, pts, k) { c.poly(pts.flatMap((p) => D.q(...p)).map(Math.round), k) }

function glassPoly(c, D, pts) {
  const sp = pts.map((p) => D.q(...p))
  c.poly(sp.flat().map(Math.round), "G")
  const xs = sp.map((p) => p[0]), ys = sp.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys))
  const wdt = Math.max(1, x1 - x0)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!c.is(x, y, "G")) continue
    if (y - y0 < (y1 - y0) * 0.4 && ((x + y) & 1)) c.px(x, y, "J")
    for (const f of [0.22, 0.6]) { const u = x - (x0 + wdt * f) + (y - y0) * 0.6; if (u >= 0 && u < Math.max(2, wdt * 0.06)) c.px(x, y, u < 1 ? "U" : "J") }
  }
}

// the three visible faces of a part, in this view
function faces(p, D) {
  const f = D.flip
  const zn_b = f ? p.z1b : p.z0b, zf_b = f ? p.z0b : p.z1b, zn_t = f ? p.z1t : p.z0t, zf_t = f ? p.z0t : p.z1t
  return {
    near: [[p.x0b, p.y0, zn_b], [p.x1b, p.y0, zn_b], [p.x1t, p.y1, zn_t], [p.x0t, p.y1, zn_t]],
    side: [[p.x1b, p.y0, zn_b], [p.x1b, p.y0, zf_b], [p.x1t, p.y1, zf_t], [p.x1t, p.y1, zn_t]],
    top: [[p.x0t, p.y1, zn_t], [p.x1t, p.y1, zn_t], [p.x1t, p.y1, zf_t], [p.x0t, p.y1, zf_t]],
  }
}

function drawPart(c, D, p) {
  if (p.only && p.only !== (D.flip ? "front" : "rear")) return
  const F = faces(p, D)
  quad(c, D, F.top, p.top); if (!D.straight) quad(c, D, F.side, p.side)
  const nearCol = D.flip ? p.far ?? p.near : p.near
  quad(c, D, F.near, nearCol)
  // edge light: top lip of near face, top edge of side face
  const [a, b] = [D.q(...F.near[3]), D.q(...F.near[2])]
  if (p.lip !== false) c.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), p.lip ?? "9")
  const [d, e] = [D.q(...F.side[3]), D.q(...F.side[2])]
  if (p.lip !== false && !D.straight) c.line(Math.round(d[0]), Math.round(d[1]), Math.round(e[0]), Math.round(e[1]), p.sideLip ?? "8")
  // glazing
  const g = D.flip ? p.frontGlass : p.rearGlass
  if (g) { const [iu, ivb, ivt] = g; glassPoly(c, D, [bil(F.near, iu, ivb), bil(F.near, 1 - iu, ivb), bil(F.near, 1 - iu, 1 - ivt), bil(F.near, iu, 1 - ivt)]) }
  if (p.sideGlass && !D.straight) for (const [a0, a1, ivb = 0.12, ivt = 0.14] of p.sideGlass) {
    const u0 = D.flip ? 1 - a1 : a0, u1 = D.flip ? 1 - a0 : a1
    glassPoly(c, D, [bil(F.side, u0, ivb), bil(F.side, u1, ivb), bil(F.side, u1, 1 - ivt), bil(F.side, u0, 1 - ivt)])
  }
}

// tyre seen end-on (a dark block) for every axle; the visible side also gets a round tyre + rim
function tyres(c, D, V) {
  const { r, axles, track, tw = 0.22 } = V.wheels
  for (const z of [...axles].sort((a, b) => (D.flip ? a - b : b - a))) for (const sx of [-1, 1]) {
    const x0 = sx * track - tw / 2, x1 = sx * track + tw / 2
    drawPart(c, D, box(x0, x1, 0, 2 * r * 0.92, z - r * 0.8, z + r * 0.8, { near: "T", far: "T", side: "k", top: "D" }, { lip: "t", sideLip: "t" }))
  }
}
// visible side: dark wheel arch cut into the body, tyre tread inside it, a hint of hubcap
function sideWheels(c, D, V) {
  const { r, axles, track, tw = 0.22 } = V.wheels, X = V.W / 2, xt = track + tw / 2
  const arch = []
  for (let a = 180; a >= 0; a -= 15) { const t = (a * Math.PI) / 180; arch.push([X, r + Math.sin(t) * r * 1.12, Math.cos(t) * r * 1.12]) }
  for (const z of axles) {
    quad(c, D, [[X, 0, z - r * 1.12], ...arch.map(([x, y, dz]) => [x, y, z + dz]).reverse(), [X, 0, z + r * 1.12]], "k")
    quad(c, D, [[xt, 0.02, z - r * 0.85], [xt, 0.02, z + r * 0.85], [xt, 2 * r * 0.92, z + r * 0.85], [xt, 2 * r * 0.92, z - r * 0.85]], "T")
    for (let i = 1; i < 6; i++) { const y = (2 * r * 0.92 * i) / 6, a = D.q(xt, y, z - r * 0.8), b = D.q(xt, y, z + r * 0.8); c.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), "D") }
    quad(c, D, [[xt, r * 0.6, z - r * 0.35], [xt, r * 0.6, z + r * 0.35], [xt, r * 1.4, z + r * 0.35], [xt, r * 1.4, z - r * 0.35]], V.wheels.hub || "m")
    const h = D.q(xt, r * 1.4, z - r * 0.35), h2 = D.q(xt, r * 1.4, z + r * 0.35); c.line(Math.round(h[0]), Math.round(h[1]), Math.round(h2[0]), Math.round(h2[1]), "o")
  }
}

// helpers for details (natural coords)
const H = (c, D) => ({
  poly3(pts, k) { quad(c, D, pts, k) },
  rect(x0, x1, y0, y1, k, v = 0) { const z = D.near(v); quad(c, D, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], k) },
  pair(x0, x1, y0, y1, k, v = 0) { this.rect(x0, x1, y0, y1, k, v); this.rect(-x1, -x0, y0, y1, k, v) },
  hline(x0, x1, y, k, v = 0) { const z = D.near(v), a = D.q(x0, y, z), b = D.q(x1, y, z); c.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), k) },
  vline(x, y0, y1, k, v = 0) { const z = D.near(v), a = D.q(x, y0, z), b = D.q(x, y1, z); c.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), k) },
  frame(x0, x1, y0, y1, k, v = 0) { this.hline(x0, x1, y0, k, v); this.hline(x0, x1, y1, k, v); this.vline(x0, y0, y1, k, v); this.vline(x1, y0, y1, k, v) },
  glass(x0, x1, y0, y1, v = 0) { const z = D.near(v); glassPoly(c, D, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]) },
  // on the visible side plane x = X (natural z)
  sline(X, z0, z1, y, k) { const a = D.q(X, y, z0), b = D.q(X, y, z1); c.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), k) },
  svert(X, z, y0, y1, k) { const a = D.q(X, y0, z), b = D.q(X, y1, z); c.line(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), k) },
  sband(X, z0, z1, y0, y1, k) { quad(c, D, [[X, y0, z0], [X, y0, z1], [X, y1, z1], [X, y1, z0]], k) },
  sglass(X, z0, z1, y0, y1) { glassPoly(c, D, [[X, y0, z0], [X, y0, z1], [X, y1, z1], [X, y1, z0]]) },
  grille(x0, x1, y0, y1, step, v = 0) { this.rect(x0, x1, y0, y1, "D", v); for (let y = y0 + step / 2; y < y1; y += step) this.hline(x0 + 0.02, x1 - 0.02, y, "n", v) },
})

function outline(c) {
  const hits = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (c.is(x, y, "*")) continue
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.is(x + dx, y + dy, "*"))) hits.push([x, y])
  }
  for (const [x, y] of hits) c.px(x, y, "k")
}

function render(c, V, mode, state, fixedS = null) {
  const D = view(V, mode, c.w, c.h, fixedS), h = H(c, D)
  tyres(c, D, V)
  const groups = [...new Set(V.parts.map((p) => p.g ?? 0))].sort((a, b) => (D.flip ? a - b : b - a))
  for (const g of groups) {
    for (const p of V.parts) if ((p.g ?? 0) === g) drawPart(c, D, p)
    if (V.side && !D.straight && (V.sideGroup ?? 0) === g) V.side(h, D)
  }
  if (!D.straight) sideWheels(c, D, V)
  if (D.flip) V.front(h, D, state); else V.rear(h, D, state)
  outline(c)
  return D
}

// ---------------- vehicles ----------------
const BODY = (n, s, t) => ({ near: "7", far: "7", side: "6", top: "8" })
const CHROME = { near: "n", far: "n", side: "m", top: "o" }
const RUBBER = { near: "D", far: "D", side: "k", top: "t" }

const VEHICLES = {
  sedan: {
    pal: { 5: "#101a34", 6: "#1e3260", 7: "#2c4a8a", 8: "#4a6eb4", 9: "#8aaee0" },
    L: 4.8, W: 1.76, wheels: { r: 0.32, axles: [0.95, 3.75], track: 0.74 },
    parts: [
      sym(0.88, 0.3, 0.92, 0, 4.8, BODY()),
      hexa({ x0b: -0.8, x1b: 0.8, x0t: -0.68, x1t: 0.68, y0: 0.92, y1: 1.4, z0b: 0.95, z1b: 3.15, z0t: 1.45, z1t: 2.75, ...BODY(),
        rearGlass: [0.06, 0.08, 0.1], frontGlass: [0.06, 0.06, 0.08], sideGlass: [[0.12, 0.48], [0.52, 0.86]] }),
      box(0.88, 1.0, 0.98, 1.1, 3.05, 3.2, RUBBER, { g: 1 }), box(-1.0, -0.88, 0.98, 1.1, 3.05, 3.2, RUBBER, { g: 1 }),
      sym(0.9, 0.24, 0.42, -0.08, 0.1, CHROME, { only: "rear" }), sym(0.9, 0.24, 0.42, 4.7, 4.88, CHROME, { only: "front" }),
    ],
    side(h) { const X = 0.88; h.sline(X, 0.2, 4.6, 0.56, "D"); for (const z of [1.6, 2.6, 3.4]) h.svert(X, z, 0.36, 0.9, "5"); for (const z of [1.75, 2.75]) h.sline(X, z, z + 0.15, 0.78, "o") },
    rear(h) {
      h.frame(-0.56, 0.56, 0.5, 0.91, "5")
      h.pair(0.5, 0.86, 0.6, 0.84, "R"); h.pair(0.5, 0.86, 0.6, 0.66, "N"); h.pair(0.5, 0.58, 0.66, 0.84, "Y")
      h.rect(-0.22, 0.22, 0.36, 0.5, "P"); h.frame(-0.22, 0.22, 0.36, 0.5, "D")
      h.rect(0.5, 0.62, 0.18, 0.24, "k", -0.1)
    },
    front(h) {
      h.grille(-0.42, 0.42, 0.5, 0.78, 0.07); h.vline(0, 0.5, 0.78, "n")
      h.pair(0.48, 0.84, 0.58, 0.78, "W"); h.pair(0.5, 0.62, 0.66, 0.74, "p"); h.pair(0.52, 0.84, 0.48, 0.55, "Y")
    },
  },

  sports_car: {
    pal: { 5: "#0a3a38", 6: "#13675f", 7: "#22968a", 8: "#46c4b4", 9: "#a4f0e4" },
    L: 4.2, W: 1.68, wheels: { r: 0.3, axles: [0.85, 3.35], track: 0.72, tw: 0.24 },
    parts: [
      sym(0.84, 0.26, 0.78, 0, 4.2, BODY()),
      hexa({ x0b: -0.76, x1b: 0.76, x0t: -0.62, x1t: 0.62, y0: 0.78, y1: 1.18, z0b: 0.45, z1b: 2.75, z0t: 1.45, z1t: 2.3, ...BODY(),
        rearGlass: [0.08, 0.1, 0.1], frontGlass: [0.06, 0.06, 0.08], sideGlass: [[0.18, 0.84]] }),
      box(0.56, 0.62, 0.78, 0.88, 0.08, 0.2, RUBBER, { g: -1 }), box(-0.62, -0.56, 0.78, 0.88, 0.08, 0.2, RUBBER, { g: -1 }),
      sym(0.8, 0.88, 0.94, 0.02, 0.3, RUBBER, { g: -1 }),
      box(0.84, 0.94, 0.86, 0.94, 2.6, 2.72, RUBBER, { g: 1 }), box(-0.94, -0.84, 0.86, 0.94, 2.6, 2.72, RUBBER, { g: 1 }),
      sym(0.86, 0.2, 0.36, -0.06, 0.08, RUBBER, { only: "rear" }), sym(0.86, 0.2, 0.38, 4.12, 4.26, RUBBER, { only: "front" }),
    ],
    side(h) { const X = 0.84; h.sline(X, 0.1, 4.1, 0.48, "p"); for (const z of [1.7, 2.9]) h.svert(X, z, 0.3, 0.76, "5") },
    rear(h) {
      h.rect(-0.8, 0.8, 0.54, 0.7, "R"); h.rect(-0.22, 0.22, 0.54, 0.7, "N"); h.pair(0.7, 0.8, 0.54, 0.7, "Y")
      h.rect(-0.2, 0.2, 0.38, 0.5, "P"); h.frame(-0.2, 0.2, 0.38, 0.5, "D")
      h.pair(0.42, 0.54, 0.14, 0.2, "k", -0.08)
    },
    front(h) {
      h.pair(0.44, 0.78, 0.5, 0.58, "W"); h.pair(0.62, 0.78, 0.43, 0.48, "Y")
      h.rect(-0.4, 0.4, 0.22, 0.34, "D", -0.06); h.hline(-0.36, 0.36, 0.28, "n", -0.06)
      h.hline(-0.6, 0.6, 0.7, "5")                                          // pop-up headlight lid seam
    },
  },

  station_wagon: {
    pal: { 5: "#6e6048", 6: "#a8986e", 7: "#d0c096", 8: "#e8dcb8", 9: "#fff6dc", a: "#7a4a24", A: "#4a2a12", b: "#a06a3a" },
    L: 5.1, W: 1.8, wheels: { r: 0.33, axles: [1.05, 4.0], track: 0.76 },
    parts: [
      sym(0.9, 0.32, 0.95, 0, 5.1, BODY()),
      hexa({ x0b: -0.84, x1b: 0.84, x0t: -0.76, x1t: 0.76, y0: 0.95, y1: 1.45, z0b: 0.12, z1b: 3.4, z0t: 0.22, z1t: 3.0, ...BODY(),
        rearGlass: [0.07, 0.08, 0.1], frontGlass: [0.06, 0.06, 0.08], sideGlass: [[0.04, 0.3], [0.34, 0.62], [0.66, 0.9]] }),
      box(0.56, 0.62, 1.45, 1.53, 0.5, 2.7, CHROME), box(-0.62, -0.56, 1.45, 1.53, 0.5, 2.7, CHROME),
      sym(0.92, 0.26, 0.44, -0.08, 0.1, CHROME, { only: "rear" }), sym(0.92, 0.26, 0.44, 5.0, 5.18, CHROME, { only: "front" }),
    ],
    side(h) {   // woodgrain side panel with a cream border
      const X = 0.9
      h.sband(X, 0.25, 4.85, 0.4, 0.86, "a")
      for (const y of [0.52, 0.64, 0.76]) h.sline(X, 0.35, 4.75, y, "b")
      h.sline(X, 0.25, 4.85, 0.4, "A"); h.sline(X, 0.25, 4.85, 0.86, "A")
      for (const z of [1.5, 2.9]) h.svert(X, z, 0.4, 0.86, "A")
    },
    rear(h) {
      h.frame(-0.62, 0.62, 0.4, 0.94, "5"); h.rect(-0.6, 0.6, 0.42, 0.62, "a"); h.hline(-0.6, 0.6, 0.52, "b"); h.frame(-0.6, 0.6, 0.42, 0.62, "A")
      h.pair(0.66, 0.88, 0.45, 0.9, "R"); h.pair(0.66, 0.88, 0.45, 0.56, "N")
      h.rect(-0.2, 0.2, 0.66, 0.78, "P"); h.frame(-0.2, 0.2, 0.66, 0.78, "D"); h.hline(-0.14, 0.14, 0.84, "o")
    },
    front(h) {
      h.rect(-0.44, 0.44, 0.52, 0.8, "D"); for (let x = -0.4; x <= 0.41; x += 0.1) h.vline(x, 0.52, 0.8, "n"); h.hline(-0.44, 0.44, 0.66, "n")
      h.pair(0.48, 0.64, 0.6, 0.78, "W"); h.pair(0.67, 0.84, 0.6, 0.78, "W"); h.pair(0.5, 0.84, 0.5, 0.56, "Y")
    },
  },

  delivery_van: {
    pal: { 5: "#6a6a64", 6: "#a8a8a0", 7: "#d8d6ce", 8: "#eeede6", 9: "#ffffff", a: "#d04020", A: "#e88a20" },
    L: 5.6, W: 2.1, wheels: { r: 0.38, axles: [1.0, 4.6], track: 0.84, tw: 0.26 },
    parts: [
      sym(1.05, 0.4, 2.65, 0, 4.0, BODY(), { g: 0 }),
      sym(1.0, 0.4, 1.4, 4.0, 5.6, BODY(), { g: 1 }),
      hexa({ g: 1, x0b: -1.0, x1b: 1.0, x0t: -0.94, x1t: 0.94, y0: 1.4, y1: 2.35, z0b: 4.0, z1b: 5.05, z0t: 4.0, z1t: 4.55, ...BODY(),
        frontGlass: [0.05, 0.08, 0.1], sideGlass: [[0.1, 0.78]] }),
      box(1.0, 1.12, 1.6, 1.85, 4.85, 4.95, RUBBER, { g: 1 }), box(-1.12, -1.0, 1.6, 1.85, 4.85, 4.95, RUBBER, { g: 1 }),
      sym(1.02, 0.3, 0.48, -0.1, 0.06, RUBBER, { only: "rear", g: 0 }), sym(1.02, 0.3, 0.5, 5.52, 5.7, RUBBER, { only: "front", g: 1 }),
    ],
    side(h) { const X = 1.05; h.sband(X, 0.05, 3.95, 1.1, 1.26, "a"); h.sband(X, 0.05, 3.95, 1.27, 1.33, "A"); h.svert(X, 2.6, 0.45, 2.55, "5"); h.svert(X, 3.6, 0.45, 2.55, "5"); h.sline(X, 2.7, 2.85, 1.5, "o") },
    rear(h) {
      h.frame(-1.0, 1.0, 0.46, 2.6, "5"); h.vline(0, 0.46, 2.6, "k")
      h.rect(-1.03, 1.03, 1.1, 1.26, "a"); h.rect(-1.03, 1.03, 1.27, 1.33, "A")
      h.glass(0.18, 0.78, 1.75, 2.3); h.glass(-0.78, -0.18, 1.75, 2.3)
      h.pair(0.06, 0.1, 1.45, 1.7, "o"); h.pair(0.9, 1.02, 0.6, 1.05, "R"); h.pair(0.9, 1.02, 0.6, 0.72, "Y")
      h.rect(-0.22, 0.22, 0.52, 0.66, "P"); h.frame(-0.22, 0.22, 0.52, 0.66, "D")
      for (const y of [0.9, 2.2]) h.pair(0.98, 1.04, y, y + 0.12, "n")    // door hinges
    },
    front(h) {
      h.grille(-0.5, 0.5, 0.68, 1.12, 0.08)
      h.pair(0.6, 0.92, 0.8, 1.06, "W"); h.pair(0.66, 0.78, 0.88, 0.98, "p"); h.pair(0.6, 0.92, 0.68, 0.76, "Y")
      h.rect(-1.0, 1.0, 1.15, 1.22, "a")
    },
  },

  semi_truck: {
    pal: { 5: "#0e1a44", 6: "#1a2e74", 7: "#2a4aa8", 8: "#4a70d0", 9: "#90b4f0", c: "#b8bec8", C: "#8a909c", e: "#dde2ea", E: "#f4f6fa" },
    L: 15.0, W: 2.5, sideGroup: 0, wheels: { r: 0.5, axles: [1.2, 2.5, 11.4, 14.0], track: 0.98, tw: 0.48 },
    parts: [
      sym(0.5, 0.9, 1.15, 0, 12, { near: "k", far: "k", side: "D", top: "D" }, { g: 0, lip: false }),
      sym(1.25, 1.15, 4.0, 0, 12, { near: "c", far: "c", side: "C", top: "e" }, { g: 0, lip: "E", sideLip: "e" }),
      box(1.2, 1.3, 1.0, 3.9, 12.3, 12.45, CHROME, { g: 1 }), box(-1.3, -1.2, 1.0, 3.9, 12.3, 12.45, CHROME, { g: 1 }),
      sym(1.22, 0.62, 3.2, 12.5, 14.8, BODY(), { g: 1, frontGlass: null }),
      hexa({ g: 1, x0b: -1.15, x1b: 1.15, x0t: -1.0, x1t: 1.0, y0: 3.2, y1: 3.95, z0b: 12.6, z1b: 14.3, z0t: 12.6, z1t: 13.1, ...BODY() }),
      sym(1.25, 0.42, 0.72, 14.7, 14.95, CHROME, { only: "front", g: 1 }),
      sym(1.15, 0.45, 0.6, -0.06, 0.05, RUBBER, { only: "rear", g: 0 }),
      box(0.76, 0.84, 0.6, 1.15, -0.02, 0.05, RUBBER, { only: "rear", g: 0 }), box(-0.84, -0.76, 0.6, 1.15, -0.02, 0.05, RUBBER, { only: "rear", g: 0 }),
      box(0.72, 1.22, 0.22, 0.95, 0.62, 0.66, RUBBER, { only: "rear", g: 0 }), box(-1.22, -0.72, 0.22, 0.95, 0.62, 0.66, RUBBER, { only: "rear", g: 0 }),
    ],
    side(h) { const X = 1.25; for (let z = 0.6; z < 12; z += 0.8) h.svert(X, z, 1.2, 3.95, "m"); h.sline(X, 0.05, 11.95, 1.35, "n"); h.sline(X, 0.05, 11.95, 3.8, "n") },
    rear(h) {
      // trailer doors: outline, livery bands, corrugated ribs, emblem, lock rods, hinges, tape and lights
      h.frame(-1.2, 1.2, 1.22, 3.94, "C")
      h.rect(-1.19, 1.19, 3.5, 3.93, "7"); h.hline(-1.19, 1.19, 3.5, "9"); h.hline(-1.19, 1.19, 3.93, "8"); h.hline(-1.19, 1.19, 3.46, "m")   // blue header band
      h.rect(-1.19, 1.19, 1.23, 1.62, "6"); h.hline(-1.19, 1.19, 1.62, "8"); h.hline(-1.19, 1.19, 1.25, "5")                                  // blue skirt band
      for (let x = -1.09; x <= 1.1; x += 0.15) if (Math.abs(x) > 0.06) h.vline(x, 1.74, 3.44, "C")                                          // corrugation ribs
      h.vline(0, 1.22, 3.94, "m"); h.vline(-0.035, 1.64, 3.46, "n"); h.vline(0.035, 1.64, 3.46, "e")                                        // door seam
      h.poly3([[-0.55, 2.12, 0], [0, 2.72, 0], [0.55, 2.12, 0], [0.55, 2.4, 0], [0, 3.0, 0], [-0.55, 2.4, 0]], "7")                      // chevron emblem
      h.poly3([[-0.55, 2.4, 0], [0, 3.0, 0], [0, 3.06, 0], [-0.55, 2.46, 0]], "9"); h.poly3([[0.55, 2.4, 0], [0, 3.0, 0], [0, 3.06, 0], [0.55, 2.46, 0]], "9")
      for (const x of [-0.88, -0.3, 0.3, 0.88]) {                                                                                           // lock rods, cams and handles
        h.vline(x, 1.74, 3.44, "n"); h.vline(x + 0.03, 1.74, 3.44, "m")
        for (const y of [1.95, 3.15]) { h.rect(x - 0.07, x + 0.1, y, y + 0.1, "D"); h.rect(x - 0.05, x + 0.08, y + 0.02, y + 0.08, "o") }
      }
      for (const y of [1.9, 2.7, 3.3]) h.pair(1.12, 1.2, y, y + 0.14, "n")                                                                 // door hinges
      for (let x = -1.1; x < 1.1; x += 0.2) { h.rect(x, x + 0.1, 1.66, 1.74, "R"); h.rect(x + 0.1, x + 0.2, 1.66, 1.74, "p") }            // reflective tape (red / white)
      for (let y = 1.9; y < 3.4; y += 0.24) { h.rect(1.12, 1.17, y, y + 0.12, "R"); h.rect(-1.17, -1.12, y, y + 0.12, "R"); h.rect(1.12, 1.17, y + 0.12, y + 0.24, "p"); h.rect(-1.17, -1.12, y + 0.12, y + 0.24, "p") }
      h.pair(0.9, 1.16, 1.28, 1.58, "N"); h.pair(0.93, 1.13, 1.31, 1.55, "R"); h.pair(0.95, 1.1, 1.45, 1.53, "Y")                       // tail light clusters
      h.pair(1.04, 1.17, 3.74, 3.9, "Y"); for (const x of [-0.18, 0, 0.18]) h.rect(x - 0.05, x + 0.05, 3.76, 3.86, "Y")                   // amber marker lights
      h.rect(-0.26, 0.26, 0.6, 0.84, "D", -0.06); h.rect(-0.22, 0.22, 0.63, 0.81, "P", -0.06)                                             // framed licence plate
      h.hline(-1.1, 1.1, 0.53, "n"); h.hline(-1.1, 1.1, 0.5, "m")                                                                           // underride bar highlight
    },
    front(h) {
      h.glass(-1.12, 1.12, 2.05, 2.98); h.vline(0, 2.05, 2.98, "D")
      h.grille(-0.72, 0.72, 0.9, 1.9, 0.12); h.frame(-0.74, 0.74, 0.88, 1.92, "o")
      h.pair(0.82, 0.98, 1.0, 1.24, "W"); h.pair(1.0, 1.16, 1.0, 1.24, "W"); h.pair(0.82, 1.16, 1.3, 1.4, "Y")
      for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) h.rect(x - 0.05, x + 0.05, 3.08, 3.16, "Y")
    },
  },

  bus: {
    pal: { 5: "#4a5060", 6: "#8a92a4", 7: "#b8c0cc", 8: "#d8dee8", 9: "#f6f8fc", a: "#c42a2a", A: "#2a4ab0" },
    L: 12.0, W: 2.55, wheels: { r: 0.5, axles: [2.2, 3.4, 10.0], track: 1.04, tw: 0.42 },
    parts: [
      sym(1.27, 0.4, 3.45, 0, 12, BODY()),
      sym(0.62, 3.45, 3.62, 4.0, 7.2, { near: "8", far: "8", side: "7", top: "9" }, { lip: "9" }),
      sym(1.28, 0.32, 0.55, -0.1, 0.06, RUBBER, { only: "rear" }), sym(1.28, 0.32, 0.55, 11.94, 12.1, RUBBER, { only: "front" }),
    ],
    side(h) {
      const X = 1.27
      for (let z = 0.4; z < 10.4; z += 1.25) h.sglass(X, z, Math.min(z + 1.12, 10.3), 2.0, 3.05)
      h.sglass(X, 10.6, 11.55, 0.6, 3.05); h.svert(X, 11.08, 0.6, 3.05, "D")                       // entry door
      h.sband(X, 0.1, 11.9, 1.68, 1.8, "a"); h.sband(X, 0.1, 11.9, 1.82, 1.9, "A")
      for (let y = 0.7; y < 1.6; y += 0.14) h.sline(X, 0.1, 10.4, y, "o")
    },
    rear(h) {
      h.grille(-1.0, 1.0, 0.7, 1.85, 0.11)
      h.pair(1.02, 1.22, 0.8, 1.95, "R"); h.pair(1.02, 1.22, 1.6, 1.78, "Y")
      h.rect(-1.27, 1.27, 2.18, 2.32, "a"); h.rect(-1.27, 1.27, 2.34, 2.44, "A")
      h.glass(-1.0, 1.0, 2.75, 3.2)
      h.rect(-0.22, 0.22, 0.6, 0.68, "P", -0.1)
    },
    front(h) {
      h.glass(-1.18, 1.18, 1.62, 3.0); h.vline(0, 1.62, 3.0, "D")
      h.rect(-0.95, 0.95, 3.06, 3.34, "D"); for (let x = -0.8; x < 0.8; x += 0.16) h.rect(x, x + 0.1, 3.16, 3.24, "Y")
      h.grille(-0.6, 0.6, 0.6, 1.02, 0.1)
      h.pair(0.78, 0.96, 0.7, 0.95, "W"); h.pair(0.98, 1.16, 0.7, 0.95, "W"); h.pair(0.78, 1.16, 1.02, 1.1, "Y")
      h.rect(-1.27, 1.27, 1.3, 1.42, "a"); h.rect(-1.27, 1.27, 1.44, 1.52, "A")
    },
  },
}

for (const [name, V] of Object.entries(VEHICLES)) {
  pal({ ...COMMON, ...V.pal })
  ramps("k56789")
  sprite("traffic_" + name, { w: CW, h: CH }, (c) => { render(c, V, "rear") })
  sprite("traffic_" + name + "_front", { w: CW, h: CH }, (c) => { render(c, V, "front") })
  // straight-on rear view: symmetric, needs no flipping, sized to a fixed 64 px per metre
  const dims = straightDims(V)
  sprite("traffic_" + name + "_back", dims, (c) => {
    const sa = [A, B]; A = STRAIGHT.A; B = STRAIGHT.B
    render(c, V, "rear", undefined, STRAIGHT.S)
    A = sa[0]; B = sa[1]
  })
}

// ---------------- police cruiser (rear / front, light states) ----------------
const POLICE_PAL = {
  5: "#06070a", 6: "#101219", 7: "#1b1e28", 8: "#2c3140", 9: "#5a6278",           // black body
  q: "#6a6e78", r: "#a6abb6", s: "#d6dae2", u: "#eef0f4", v: "#ffffff",           // white doors / roof
  L: "#ff3a2a", l: "#ffb0a0", Q: "#16245a", K: "#3a8cff", j: "#b0d4ff", A: "#d8a830",
}
const WHITE = { near: "s", far: "s", side: "r", top: "u" }
const BAR = { z0: 1.92, z1: 2.2, y0: 1.42, y1: 1.56, x: 0.62 }
// lens segments across the bar: red, red, clear, blue, blue
const SEGS = [[-0.6, -0.37, "red"], [-0.36, -0.13, "red"], [-0.12, 0.12, "clear"], [0.13, 0.36, "blue"], [0.37, 0.6, "blue"]]

function lightbar(h, D, state) {
  const lit = { red: state === "red" || state === "on", blue: state === "blue" || state === "on" }
  const nz = D.flip ? BAR.z1 : BAR.z0, fz = D.flip ? BAR.z1 - 0.12 : BAR.z0 + 0.12
  const v = D.flip ? D.L - BAR.z1 : BAR.z0
  for (const [x0, x1, kind] of SEGS) {
    const on = kind === "clear" ? false : lit[kind]
    const lens = kind === "clear" ? "o" : kind === "red" ? (on ? "L" : "N") : (on ? "K" : "Q")
    h.rect(x0, x1, BAR.y0 + 0.02, BAR.y1 - 0.02, lens, v)
    if (on) {
      const cx = (x0 + x1) / 2
      h.rect(cx - 0.06, cx + 0.06, BAR.y0 + 0.05, BAR.y1 - 0.05, "p", v)            // white-hot core
      h.poly3([[x0, BAR.y1, nz], [x1, BAR.y1, nz], [x1, BAR.y1, fz], [x0, BAR.y1, fz]], kind === "red" ? "l" : "j")  // lit lens top
    }
  }
  // the bar's visible end (side face) is a blue lens
  h.poly3([[BAR.x, BAR.y0 + 0.02, BAR.z0 + 0.02], [BAR.x, BAR.y0 + 0.02, BAR.z1 - 0.02], [BAR.x, BAR.y1 - 0.02, BAR.z1 - 0.02], [BAR.x, BAR.y1 - 0.02, BAR.z0 + 0.02]], lit.blue ? "K" : "Q")
}

const POLICE = {
  pal: POLICE_PAL,
  L: 5.3, W: 1.9, wheels: { r: 0.34, axles: [1.1, 4.1], track: 0.8, tw: 0.24, hub: "D" },
  parts: [
    sym(0.95, 0.32, 0.94, 0, 5.3, BODY()),
    hexa({ x0b: -0.86, x1b: 0.86, x0t: -0.74, x1t: 0.74, y0: 0.94, y1: 1.42, z0b: 1.05, z1b: 3.35, z0t: 1.55, z1t: 2.95, ...WHITE,
      rearGlass: [0.07, 0.08, 0.1], frontGlass: [0.06, 0.06, 0.08], sideGlass: [[0.12, 0.48], [0.52, 0.86]], lip: "v", sideLip: "u" }),
    box(0.95, 1.07, 1.0, 1.12, 3.25, 3.4, RUBBER, { g: 1 }), box(-1.07, -0.95, 1.0, 1.12, 3.25, 3.4, RUBBER, { g: 1 }),
    box(0.8, 0.9, 0.94, 1.06, 3.3, 3.45, CHROME, { g: 1 }), box(-0.9, -0.8, 0.94, 1.06, 3.3, 3.45, CHROME, { g: 1 }),   // A-pillar spotlights
    sym(BAR.x, BAR.y0, BAR.y1, BAR.z0, BAR.z1, { near: "D", far: "D", side: "k", top: "m" }, { lip: "n", sideLip: "m" }),
    sym(0.97, 0.24, 0.44, -0.08, 0.1, CHROME, { only: "rear" }),
    sym(0.97, 0.24, 0.44, 5.2, 5.38, CHROME, { only: "front" }),
    sym(0.7, 0.3, 0.62, 5.38, 5.5, RUBBER, { only: "front" }),                 // push bumper
  ],
  side(h) {
    const X = 0.95
    h.sband(X, 1.6, 3.5, 0.34, 0.93, "u"); h.sline(X, 1.6, 3.5, 0.93, "v"); h.sline(X, 1.6, 3.5, 0.34, "r")   // white doors
    h.svert(X, 2.6, 0.36, 0.92, "q"); h.svert(X, 1.6, 0.34, 0.93, "5"); h.svert(X, 3.5, 0.34, 0.93, "5")
    h.sband(X, 2.05, 2.25, 0.62, 0.76, "A"); h.sline(X, 2.05, 2.25, 0.76, "Y")   // plain shield badge (no lettering)
    h.sline(X, 0.2, 5.1, 0.5, "D")
  },
  rear(h, D, state) {
    h.frame(-0.58, 0.58, 0.52, 0.93, "5")
    h.pair(0.52, 0.9, 0.6, 0.86, "R"); h.pair(0.52, 0.9, 0.6, 0.67, "N"); h.pair(0.52, 0.6, 0.67, 0.86, "p")
    h.rect(-0.22, 0.22, 0.36, 0.5, "P"); h.frame(-0.22, 0.22, 0.36, 0.5, "D")
    h.rect(0.55, 0.67, 0.18, 0.24, "k", -0.1)
    h.vline(-0.7, 0.94, 1.7, "D", 0.15)                                        // trunk whip antenna
    lightbar(h, D, state)
  },
  front(h, D, state) {
    h.grille(-0.44, 0.44, 0.5, 0.8, 0.07); h.vline(0, 0.5, 0.8, "n")
    h.pair(0.5, 0.68, 0.6, 0.8, "W"); h.pair(0.7, 0.88, 0.6, 0.8, "W"); h.pair(0.52, 0.88, 0.5, 0.56, "Y")
    for (const x of [-0.5, 0.5]) h.vline(x, 0.3, 0.62, "m", -0.2)
    lightbar(h, D, state)
  },
}

// overlay: keep only the light bar (its projected hull), same canvas/position as the rear sprite
function keepBarOnly(c, D) {
  const pts = []
  for (const x of [-BAR.x, BAR.x]) for (const y of [BAR.y0, BAR.y1]) for (const z of [BAR.z0, BAR.z1]) pts.push(D.q(x, y, z))
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], hi = []
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of [...pts].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p) }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1))
  const inside = (x, y) => hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], [x, y]) >= -1.2)
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (!inside(x + 0.5, y + 0.5)) c.px(x, y, "_")
}

pal({ ...COMMON, ...POLICE_PAL })
ramps("k56789", "qrsuv")
sprite("police_cruiser_rear", { w: CW, h: CH }, (c) => { render(c, POLICE, "rear", "off") })
sprite("police_cruiser_front", { w: CW, h: CH }, (c) => { render(c, POLICE, "front", "off") })
sprite("police_lights_off", { w: CW, h: CH }, (c) => { keepBarOnly(c, render(c, POLICE, "rear", "off")) })
sprite("police_lights_on", { w: CW, h: CH }, (c) => { keepBarOnly(c, render(c, POLICE, "rear", "on")) })
anim("police_cruiser_lights", { w: CW, h: CH, frames: 4, fps: 4 }, (c) => { render(c, POLICE, "rear", c.frame % 2 ? "blue" : "red") })
// light bar only, aligned to police_cruiser_rear: red flash, dark, blue flash, dark
anim("anim_police_lights", { w: CW, h: CH, frames: 4, fps: 8 }, (c) => { keepBarOnly(c, render(c, POLICE, "rear", ["red", "off", "blue", "off"][c.frame])) })

// straight-on rear police cruiser for the game's pseudo-3D road: light bar off / red / blue / both, fixed 64 px per metre
const POLICE_STRAIGHT = straightDims(POLICE)
for (const st of ["off", "red", "blue", "on"]) {
  sprite("police_cruiser_back_" + st, POLICE_STRAIGHT, (c) => {
    const sa = [A, B]; A = STRAIGHT.A; B = STRAIGHT.B
    render(c, POLICE, "rear", st, STRAIGHT.S)
    A = sa[0]; B = sa[1]
  })
}
