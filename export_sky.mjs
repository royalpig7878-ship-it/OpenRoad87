// Copies sky layers to final/ and writes final/sky.json; checks tiling + opacity.
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import fs from "node:fs"
const p = await loadProject("sky.px.js")
const T = ["day", "sunset", "night", "storm"], HZ = 262
const ch = (v, s) => (v >>> s) & 255
const diff = (a, b) => Math.abs(ch(a, 24) - ch(b, 24)) + Math.abs(ch(a, 16) - ch(b, 16)) + Math.abs(ch(a, 8) - ch(b, 8)) + Math.abs(ch(a, 0) - ch(b, 0))
const meta = { horizonY: HZ, size: [960, 540], tileable: "horizontal", draw_order: ["layer_sky", "layer_far", "layer_near"],
  parallax: { layer_sky: 0.02, layer_far: 0.08, layer_near: 0.2 }, times: {} }
for (const t of T) {
  meta.times[t] = { composite: `sky_${t}.png` }
  for (const n of [`sky_${t}`, `sky_${t}_layer_sky`, `sky_${t}_layer_far`, `sky_${t}_layer_near`]) {
    const img = p.image(n); let seam = 0, inner = 0, transp = 0
    for (let y = 0; y < img.h; y++) {
      const r = y * img.w
      seam += diff(img.data[r + img.w - 1], img.data[r]); inner += diff(img.data[r + 479], img.data[r + 480])
      for (let x = 0; x < img.w; x++) if ((img.data[r + x] & 255) === 0) transp++
    }
    console.log(n.padEnd(24), "seamΔ", seam, "innerΔ", inner, "transparent px", transp)
    writePng(`final/${n}.png`, img)
    if (n !== `sky_${t}`) meta.times[t][n.replace(`sky_${t}_`, "")] = `${n}.png`
  }
}
fs.writeFileSync("final/sky.json", JSON.stringify(meta, null, 2))
