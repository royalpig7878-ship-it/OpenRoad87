// Copies scenery sprites to ./final and writes final/scenery.json (scale + anchor per asset).
import { readFileSync, writeFileSync, copyFileSync } from "node:fs"
const noop = () => {}
const src = readFileSync("scenery.px.js", "utf8") + "\nreturn META"
const META = new Function("pal", "ramps", "sprite", "sheet", "anim", src)(noop, noop, noop, noop, noop)
for (const n of Object.keys(META)) copyFileSync(`out/sprites/${n}.png`, `final/${n}.png`)
writeFileSync("final/scenery.json", JSON.stringify({
  _note: "pxPerMetre: world scale the art was drawn at (null for tiling background layers). Objects: place the bottom-centre pixel on the ground. Backgrounds tile horizontally (left and right edges match).",
  assets: META,
}, null, 2))
console.log(Object.keys(META).length, "assets exported")
