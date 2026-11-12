// Copies menu backgrounds (out/menus, from menus.mjs) and UI components (ui.px.js) to final/, writes final/ui.json.
import { loadProject, writePng } from "file:///C:/Users/Owner/claude-pxl/src/index.ts"
import fs from "node:fs"
const p = await loadProject("ui.px.js")
const names = ["ui_button_normal", "ui_button_selected", "ui_button_disabled", "ui_panel", "ui_panel_header", "ui_coin", "ui_fuel", "ui_repair", "ui_engine", "ui_tire",
  "ui_brake", "ui_transmission", "ui_speed", "ui_damage", "ui_police_alert", "ui_checkpoint", "ui_trophy"]
const meta = { components: {}, menus: {} }
for (const n of names) {
  const im = p.image(n); let corner = 0
  for (const [x, y] of [[0, 0], [im.w - 1, 0], [0, im.h - 1], [im.w - 1, im.h - 1]]) corner += im.data[y * im.w + x] & 255
  writePng(`final/${n}.png`, im)
  meta.components[n] = { file: `${n}.png`, size: [im.w, im.h] }
  console.log(n.padEnd(20), `${im.w}x${im.h}`, corner ? "CORNER OPAQUE" : "transparent corners")
}
meta.components.ui_button_normal.text_area = meta.components.ui_button_selected.text_area = meta.components.ui_button_disabled.text_area = [16, 6, 208, 34]
meta.components.ui_panel.nine_slice = { left: 16, top: 16, right: 16, bottom: 16 }
meta.components.ui_panel.content_area = [16, 16, 448, 288]
meta.components.ui_panel_header.text_area = [86, 9, 308, 22]
meta.components.ui_panel_header.three_slice = { left: 84, right: 84 }
meta.text_colors = { on_charcoal: "#e8dcc0", on_selected: "#ffd36a", on_disabled: "#6b7079", on_cream_plate: "#1b1c21" }
const notes = {
  menu_title_background: "logo space upper-left (approx 40,30 - 470,230)",
  menu_arcade_background: "", menu_career_background: "", menu_garage_background: "draw the selected car on the lit bay, wheels around y 470-500",
  menu_vehicle_select: "draw the car centred on the turntable, wheels around y 430-450", menu_game_over: "",
  menu_results: "", menu_pause: "translucent overlay; draw over the frozen game frame",
}
for (const [n, note] of Object.entries(notes)) { fs.copyFileSync(`out/menus/${n}.png`, `final/${n}.png`); meta.menus[n] = { file: `${n}.png`, size: [960, 540], ...(note && { note }) } }
fs.writeFileSync("final/ui.json", JSON.stringify(meta, null, 2))
console.log("menus copied:", Object.keys(notes).length)
