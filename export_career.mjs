// Copies garage / career art to final/ and writes final/career.json.
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import fs from "node:fs"
const p = await loadProject("career.px.js")
const D = {
  garage_background: { kind: "background", note: "floor y 342+; keep the car in the lit bay between the amber lines (x ~290-670, wheels ~y 470-500)" },
  dealer_showroom: { kind: "background", note: "floor y 352+; car centred around x 480, wheels ~y 470" },
  career_trophy_room: { kind: "background", note: "centre wall and rug left free for UI / featured trophy" },
  garage_lift: { kind: "prop", note: "front arm pads top at y ~202; place a car side sprite so its sills rest there" },
  garage_toolbox: { kind: "prop", anchor: "bottom centre (casters) at y 173" },
  garage_workbench: { kind: "prop", anchor: "feet at y 158" },
  garage_mechanic: { kind: "character", anchor: "feet at y 136", height_px: 130 },
  dealer_salesman: { kind: "character", anchor: "feet at y 136", height_px: 130 },
  career_trophy: { kind: "icon/prop" },
  career_medal: { kind: "icon/prop" },
}
const meta = {}
for (const [n, d] of Object.entries(D)) {
  const im = p.image(n); let t = 0
  for (const v of im.data) if (!(v & 255)) t++
  writePng(`final/${n}.png`, im); meta[n] = { file: `${n}.png`, size: [im.w, im.h], ...d }
  console.log(n.padEnd(20), `${im.w}x${im.h}`, d.kind === "background" ? `transparent px ${t}` : `transparent ${(100 * t / im.data.length).toFixed(0)}%`)
}
fs.writeFileSync("final/career.json", JSON.stringify(meta, null, 2))
