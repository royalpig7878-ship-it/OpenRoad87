// Builds cockpits.px.js and exports 2x nearest-neighbour PNGs + placements.json to ./final
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"

const S = 2
const p = loadProject("cockpits.px.js")
mkdirSync("final", { recursive: true })

// Re-evaluate the art file with no-op DSL stubs just to read its layout tables.
const src = readFileSync("cockpits.px.js", "utf8").replace(/globalThis\.__OPENROAD = /, "return ")
const noop = () => {}
const L = new Function("pal", "sprite", "scene", "ramps", src)(noop, noop, noop, noop)
if (!L) throw new Error("layout data not exposed by cockpits.px.js")

const ids = Object.values(L.THEMES).map((T) => T.name.replace("cockpit_", ""))
const names = [
  ...ids.map((id) => `cockpit_${id}`),
  ...ids.map((id) => `cockpit_${id}_dash`),
  "steering_wheel",
  ...ids.map((id) => `steering_wheel_${id}_rim`),
  ...ids.map((id) => `steering_wheel_${id}_spokes`),
  ...Object.values(L.THEMES).flatMap((T) => T.gauges.map((g) => `gauge_${T.name.replace("cockpit_", "")}_${g.k}`)),
  "gauge_speedometer", "gauge_rpm", "gauge_fuel", "gauge_temperature", "gauge_needle",
  "gear_indicator", "dashboard_warnings", "dashboard_buttons", "mirror_glint",
]
for (const n of names) {
  const img = p.image(n)
  const out = { w: img.w * S, h: img.h * S, data: new Uint32Array(img.w * img.h * S * S) }
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.data[y * out.w + x] = img.data[Math.floor(y / S) * img.w + Math.floor(x / S)]
  writePng(`final/${n}.png`, out)
  console.log(n, out.w + "x" + out.h)
}

// Placement data (960x540 coordinates). Centres are pixel centres of the drawn element.
const c = (v) => v * S + 1
// Every car has its own wheel (size, shape, spokes), so each cockpit carries its own wheel placement.
function wheelPlacement(G) {
  const F = L.frameDims(G)
  return {
    x: c(G.cx), y: c(G.cy),
    spokes: { x: (G.cx - (G.rx + 1)) * S, y: (G.cy + 4 - F.hu) * S, frameWidth: F.fw * S, frameHeight: F.fh * S, degrees: L.WHEEL_DEG },
    marker: { rx: G.rx * S * (1 - G.thick / 2), ry: G.ry * S * (1 - G.thick / 2), cx: c(G.cx), cy: c(G.cy), n: G.n },
  }
}
const out = {
  _note: "All coordinates in 960x540 space. Gauge sprites are per-cockpit faces (no needle) placed with origin 0.5,0.5 at the centre. Needle: gauge_needle.png pivots at (2,2) and points right at rotation 0. Wheel: static rim sprite placed centred at wheel.x/y; spoke/hub frames come from a spritesheet (frameWidth/Height, origin 0,0 at spokes.x/y); marker dot rides the rim ellipse.",
  wheel: wheelPlacement(L.WHEEL),
  mirror: { x: 682, y: 58, w: 232, h: 40, glint: "mirror_glint" },
  gauge_sweep_degrees: {
    rpm: [135, 405], speedo: [135, 405], fuel: [210, 330], temp: [210, 330],
    oil: [210, 330], volts: [210, 330], boost: [180, 360],
  },
  cockpits: {},
}
for (const T of Object.values(L.THEMES)) {
  const id = T.name.replace("cockpit_", "")
  out.cockpits[T.name] = {
    markerColor: T.pal.e,
    thick: T.thick,
    wheel: wheelPlacement(T.wheel),
    gauges: T.gauges.map((g) => ({ kind: g.k, sprite: `gauge_${id}_${g.k}`, x: c(g.x), y: c(g.y), radius: g.r * S })),
  }
}
writeFileSync("final/placements.json", JSON.stringify(out, null, 2))
console.log("placements.json written")
