// Writes the 9 anim_*.png strips to final/ and final/anims.json.
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import fs from "node:fs"
const P = { anims: await loadProject("anims.px.js"), fx: await loadProject("fx.px.js"), traffic: await loadProject("traffic.px.js") }
const LIST = [
  ["anim_steering_wheel", "anims", "anim_steering_wheel", { frames_deg: [-30, -15, 0, 15, 30], loop: false, note: "pick frame by steering input; pivot = frame centre (128,128)" }],
  ["anim_headlights", "anims", "anim_headlights", { sequence: ["off", "on", "high-beam flash", "on"], loop: true }],
  ["anim_police_lights", "traffic", "anim_police_lights", { sequence: ["red", "dark", "blue", "dark"], loop: true, note: "light bar only; frame-aligned overlay for police_cruiser_rear" }],
  ["anim_turn_signals", "anims", "anim_turn_signals", { sequence: ["bright", "on", "off", "off"], loop: true, note: "one amber lamp; place per side" }],
  ["anim_tire_smoke", "fx", "fx_tire_smoke", { loop: true, same_as: "fx_tire_smoke.png" }],
  ["anim_sparks", "fx", "fx_collision_sparks", { loop: false, same_as: "fx_collision_sparks.png" }],
  ["anim_dust", "fx", "anim_dust", { loop: true, note: "6-frame version of fx_dust" }],
  ["anim_rain", "fx", "fx_rain_overlay", { loop: true, same_as: "fx_rain_overlay.png" }],
  ["anim_lightning", "fx", "fx_lightning", { loop: false, same_as: "fx_lightning.png", note: "bottom of frame on the horizon (y 262)" }],
]
const meta = {}
for (const [out, proj, src, extra] of LIST) {
  const fr = P[proj].frames(src), fw = fr[0].img.w, fh = fr[0].img.h, n = fr.length
  const im = { w: fw * n, h: fh, data: new Uint32Array(fw * n * fh) }
  fr.forEach((f, i) => { for (let y = 0; y < fh; y++) im.data.set(f.img.data.subarray(y * fw, y * fw + fw), y * im.w + i * fw) })
  writePng(`final/${out}.png`, im)
  meta[out] = { file: `${out}.png`, frame: [fw, fh], frames: n, fps: Math.round(1000 / fr[0].ms), ...extra }
  console.log(out.padEnd(20), `${im.w}x${im.h}`, `${n} frames`)
}
fs.writeFileSync("final/anims.json", JSON.stringify(meta, null, 2))
