// Writes final/traffic.json: pixels-per-metre and real size for each traffic sprite,
// so the game can scale every vehicle consistently with distance.
import { readFileSync, writeFileSync } from "node:fs"
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
const src = readFileSync("traffic.px.js", "utf8") + "\nreturn { VEHICLES, view, POLICE }"
const noop = () => {}
const { VEHICLES, view, POLICE } = new Function("pal", "ramps", "sprite", "sheet", "anim", src)(noop, noop, noop, noop, noop)
const p = loadProject("traffic.px.js"), out = {}
for (const [k, V] of Object.entries(VEHICLES)) for (const mode of ["rear", "front"]) {
  const name = "traffic_" + k + (mode === "front" ? "_front" : ""), img = p.image(name)
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[y * img.w + x] & 255) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  out[name] = { pxPerMetre: +view(V, mode).s.toFixed(3), widthM: V.W, lengthM: V.L, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, bottomCentre: { x: Math.round((x0 + x1) / 2), y: y1 } }
}
// straight-on rear sprites (fixed 64 px/m, symmetric, no flipping needed)
for (const [k, V] of Object.entries(VEHICLES)) {
  const name = "traffic_" + k + "_back", img = p.image(name)
  writePng("final/" + name + ".png", img)
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[y * img.w + x] & 255) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  out[name] = { pxPerMetre: 64, widthM: V.W, lengthM: V.L, size: { w: img.w, h: img.h }, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, bottomCentre: { x: Math.round((x0 + x1) / 2), y: y1 } }
}
// straight-on police cruiser (light bar off / red / blue / both)
for (const st of ["off", "red", "blue", "on"]) {
  const name = "police_cruiser_back_" + st, img = p.image(name)
  writePng("final/" + name + ".png", img)
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[y * img.w + x] & 255) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  out[name] = { pxPerMetre: 64, widthM: POLICE.W, lengthM: POLICE.L, size: { w: img.w, h: img.h }, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, bottomCentre: { x: Math.round((x0 + x1) / 2), y: y1 } }
}
writeFileSync("final/traffic.json", JSON.stringify(out, null, 2))
for (const [n, v] of Object.entries(out)) console.log(n.padEnd(30), "px/m", v.pxPerMetre, "bounds", JSON.stringify(v.bounds))
