# Asset Catalog

Milestone 2 status: **all 172 pre-existing files (now 225 after the Milestone 5 cockpit work) from `final/` are now inside the project at `public/assets/`**, grouped by category, and verified by `npm run assets:verify` (files non-empty, PNGs decode, JSON parses, metadata references resolve, cockpit windshields transparent and dashboards opaque). The generated `public/assets/manifest.json` lists every file with dimensions.

Source of truth for generation remains the `*.px.js` / `export*.mjs` workshop in the project root (writes to `final/`). After re-exporting, copy files into `public/assets/` and re-run the verify script.

| Folder | Files | Contents |
|---|---|---|
| `cockpits/` | 71 | Original 6 cockpit frames (960x540, wheel baked in, kept) and the **layered** set used by the game: per car `cockpit_<car>_dash` (wheel-less; windshield **and mirror glass** transparent), `steering_wheel_<car>_rim` (606x390 static rim), `steering_wheel_<car>_spokes` (spritesheet 2424x624, 11 frames 606x208, spokes+hub turned -30..+30 deg in 6-degree steps) and themed gauge faces `gauge_<car>_<kind>` (rpm, speedo, fuel, temp, oil, volts, boost, clock; no needle). Shared: `gauge_needle` 52x6, `gear_indicator` 88x30, `dashboard_warnings` (7 frames 22x16), `dashboard_buttons`, `mirror_glint` 232x40, `anim_turn_signals`, `anim_headlights`, `anim_steering_wheel` (5 frames 256x256, reserved for the mobile virtual wheel), generic `gauge_speedometer/rpm/fuel/temperature` and `steering_wheel` (superseded, kept), `placements.json` |
| `vehicles/` | 9 | 6 player cars (256x128 side view) + `car_damage_light/medium/heavy` overlays (256x128) |
| `traffic/` | 13 | sedan, sports_car, station_wagon, delivery_van, bus, semi_truck; each side + `_front` (192x128); `traffic.json` (real-world size, bounds, anchor) |
| `police/` | 10 | `police_cruiser_side` 256x128, `_front`/`_rear` 192x128, `police_cruiser_lights` (4x 192x128), `police_lights_on/off`, `police_helicopter` + `_anim` (4x 192x128) with JSON atlases |
| `roads/` | 16 | bridge, tunnel, toll booth, concrete barrier, guardrail, lamppost, mile marker; signs: exit, fuel, rest area, speed limit (generic/65/75), warning curve/grade/mountain pass |
| `scenery/` | 49 | Mountain pass (`scenery_*`: far/near mountain layers, pines, rocks, guardrail, sign, tunnel); Coastal (`coastal_*`); Desert (`desert_*`); Forest (`forest_*`); Countryside (`country_*`); Sky (`sky_day/sunset/night/storm` full image + `_layer_sky/far/near`); `scenery.json`, `sky.json` |
| `effects/` | 19 | rain overlay/splashes (8 frames 960x540), fog, headlight glow, speed lines (4 frames), tire smoke, dust, collision sparks, crash smoke/impact (8 frames 128x128), lightning (4x 256x300); `anim_*` duplicates; `anims.json`, `fx.json` |
| `UI/` | 18 | buttons (normal/selected/disabled 240x48), 9-slice panel (480x320) + header, 32x32 icons (speed, fuel, damage, engine, tire, brake, transmission, repair, coin, trophy, checkpoint, police alert); `ui.json` |
| `menus/` | 19 | 960x540 backgrounds: title, arcade, career, garage, vehicle select, pause, results, game over; garage and dealer art (background, lift, workbench, toolbox, mechanic, salesman); career trophy/medal/trophy room; `career.json` |
| `audio/` | 0 | none by design: all audio is synthesised in code (`src/audio/`, Milestone 13) |

## Known notes
- `anim_tire_smoke`, `anim_sparks`, `anim_lightning` are byte-identical copies of `fx_tire_smoke`, `fx_collision_sparks`, `fx_lightning`; `anim_rain` mirrors `fx_rain_overlay` (same frame size). The rain overlay, rain splash and `anim_rain` sheets were re-gridded in Milestone 12 from 8x1 (7680 px wide) to 4x2 (3840x1080) so no texture exceeds 4096 px; frame size is still 960x540. Kept because `anims.json` references them; use one set in code.
- `road_guardrail` and `scenery_guardrail` differ slightly; both kept.
- The original `cockpit_<car>.png` frames have the wheel baked in; the game uses the `_dash` variants (no wheel) so the wheel can rotate. Originals are kept. Gauge faces are baked with a resting needle; the game draws the `gauge_*` face over it, then a live needle.
- The Milestone 3 road renderer will need ground/road textures drawn procedurally (no road-surface tiles exist as PNGs); this is by design, not a missing asset.
- Not covered: pixel bitmap font, audio, favicon/app icon.
- Visual review in this milestone: spot-checked a cockpit, a car and desert scenery (consistent style). Not every file was inspected visually.

## Traffic usage (Milestone 6)
The game uses the **rear-view** sprites `traffic_<type>.png` (192x128, 3/4 view from above-behind) for same-direction traffic, with `traffic.json` supplying pxPerMetre and anchor. The `traffic_<type>_front.png` oncoming views are loaded by nothing yet (reserved for oncoming/police use).

### Traffic: straight-on rear sprites (added after Milestone 6 tuning)
`traffic_<type>_back.png` (6 files) replace the 3/4 views for same-direction traffic. Generated from `traffic.px.js` (straight-on projection, slight roof, fixed 64 px per metre, symmetric so no flipping) by `export_traffic.mjs`; the canvas size varies per vehicle (sedan ~139x106, semi truck ~178x299), recorded in `traffic.json` (`size`, `pxPerMetre`, `bottomCentre`). The 3/4 rear (`traffic_<type>.png`) and front views remain in the project, unused by traffic. Total assets: 231.

### Police sprites for the road (Milestone 8)
`police/police_cruiser_back_{off,red,blue,on}.png` (140x110-ish, 64 px per metre, straight-on rear view; light bar off / red / blue / both), generated from `traffic.px.js` by `export_traffic.mjs`; sizes in `traffic/traffic.json`. The older 3/4 police sprites and helicopter art remain unused by the road. Total assets: 235.
