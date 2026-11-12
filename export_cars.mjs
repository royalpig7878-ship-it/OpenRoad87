// Exports the car side-view sprites (native 256x128, no scaling) from cars.px.js to ./final
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
const p = loadProject("cars.px.js")
const names = ["car_vortex_gt", "car_night_hawk", "car_apex_xr", "car_thunder_v8", "car_silverline_turbo", "car_phantom_x", "car_damage_light", "car_damage_medium", "car_damage_heavy", "police_cruiser_side"]
for (const n of names) { writePng(`final/${n}.png`, p.image(n)); console.log("wrote", n) }
