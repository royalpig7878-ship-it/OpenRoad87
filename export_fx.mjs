// Copies FX strips/overlays to final/ and writes final/fx.json (frame sizes, counts, fps, anchors).
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import fs from "node:fs"
const p = await loadProject("fx.px.js")
const DEF = {
  fx_rain_overlay: { blend: "normal", loop: true, anchor: "screen" },
  fx_rain_splashes: { blend: "normal", loop: true, anchor: "screen (windshield)" },
  fx_fog_overlay: { blend: "normal", anchor: "screen; fog bank peaks at horizon y 270", tileable: "horizontal" },
  fx_dust: { loop: true, anchor: "emitter at (52,84) in frame" },
  fx_tire_smoke: { loop: true, anchor: "tyre contact at (40,86) in frame; plume drifts right (flip for left)" },
  fx_collision_sparks: { loop: false, anchor: "impact point = frame centre (64,64)" },
  fx_crash_smoke: { loop: true, anchor: "smoke source at (62,112) in frame" },
  fx_crash_impact: { loop: false, anchor: "impact point = frame centre (64,64)", sequence: ["flash", "small sparks", "impact burst", "large sparks", "smoke begins", "smoke expands", "smoke dissipates", "fading particles"] },
  fx_lightning: { loop: false, anchor: "bottom of frame on the horizon (y 262)", sequence: ["strike", "flicker", "restrike", "residual"], note: "pair frames 0 and 2 with a brief full-screen white flash" },
  fx_headlight_glow: { blend: "add or normal", anchor: "screen; vanishing point (480,262)" },
  fx_speed_lines: { blend: "normal", loop: true, anchor: "screen; radiate from (480,262)" },
}
const meta = {}
for (const [n, d] of Object.entries(DEF)) {
  let img, frames = 1, fw, fh, fps = null
  try { const fr = p.frames(n); frames = fr.length; fw = fr[0].img.w; fh = fr[0].img.h; fps = Math.round(1000 / fr[0].ms)
    img = { w: fw * frames, h: fh, data: new Uint32Array(fw * frames * fh) }
    fr.forEach((f, i) => { for (let y = 0; y < fh; y++) img.data.set(f.img.data.subarray(y * fw, y * fw + fw), y * img.w + i * fw) })
  } catch { frames = 1; img = p.image(n); fw = img.w; fh = img.h }
  let opaque = 0; for (const v of img.data) if ((v & 255) === 255) opaque++
  writePng(`final/${n}.png`, img)
  meta[n] = { file: `${n}.png`, frame: [fw, fh], frames, ...(fps && { fps }), ...d }
  console.log(n.padEnd(22), `${img.w}x${img.h}`, `frames ${frames}`, `fully-opaque px ${(100 * opaque / img.data.length).toFixed(2)}%`)
}
fs.writeFileSync("final/fx.json", JSON.stringify(meta, null, 2))
