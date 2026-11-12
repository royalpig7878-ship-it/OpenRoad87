# System Architecture

## Stack
Vite + TypeScript (strict) + Phaser. `npm i phaser` installed **v4.2.1** (the brief says Phaser 3); the API used so far is identical. If strict v3 is required, run `npm i phaser@3` — no code changes expected for Milestone 1.

## Layout
```
src/
  main.ts          entry, creates the game
  core/            config constants, Phaser game config
  scenes/          Boot, Preload, MainMenu, Placeholder
  systems/ vehicles/ road/ traffic/ police/ UI/ controls/ audio/ career/ economy/ save/ data/
                   (empty, reserved for later milestones)
public/assets/     runtime assets: vehicles cockpits roads scenery traffic police UI menus effects audio
notes/              design + process docs
```
Root also holds the **art workshop** (`*.px.js`, `export*.mjs`, `final/`, `out/`) which generates pixel art with the external `claude-pxl` tool (imported from `C:/Users/Owner/claude-pxl`). It is source material, not part of the game build; finished PNGs are copied into `public/assets/`.

## Rendering and scaling
- Fixed virtual resolution 960x540 (`core/config.ts`).
- `Phaser.Scale.FIT` + `CENTER_BOTH` keeps aspect ratio with letterboxing.
- `pixelArt: true`, `roundPixels: true`, `antialias: false`, and CSS `image-rendering: pixelated` for nearest-neighbour scaling. Scaling is fractional (not integer-snapped); sprites are scaled uniformly only.

## Scene flow
Boot -> Preload (loads menu assets, progress bar) -> MainMenu -> Placeholder (stub for unbuilt modes).

## Conventions
Scene keys and texture keys live in `core/config.ts`. Keep files small and one-responsibility. Desktop and mobile share gameplay systems; only the input layer (`controls/`) differs.

## Build
`npm run dev`, `npm run build` (typecheck + production bundle to `dist/`), `npm run preview`.

## Road system (Milestone 3) — `src/road/`
| File | Role |
|---|---|
| `RoadTypes.ts` | `RoadSegment`, `RoadPoint`, `RoadPalette`, `RoadConfig`, `CameraState` |
| `TrackBuilder.ts` | Builds looping segment lists from sections: `straight`, `curve`, `hill`, `slope`, `close`; eased curve/height transitions |
| `RoadRenderer.ts` | Projects segments (camera depth from FOV), culls hidden/back-facing segments, draws far->near into a Phaser Graphics; exposes `findSegment`, `heightAt`, `trackLength` |
| `RoadPalettes.ts` | Palettes (`MountainDay`, `MountainByTime`), `tintPalette`, `lerpColor` |
| `SkyBackground.ts` | 3 tiling sky layers scrolled by curve x speed with parallax from `sky.json` |
| `TestTrack.ts` | `DEFAULT_ROAD_CONFIG` and a varied test road |

Conventions: world units where one segment = 200, half road width = 2000, camera height 1000, 300-segment draw distance. `playerX` is -1..+1 across the paved road (beyond ±1 is shoulder/off-road). Horizon is at y=215 (raised from the sky art's baked 262 so the windshield shows more road; `SkyBackground` shifts the sky layers to match). Quads are drawn as two triangles (no anti-aliasing) to keep edges pixel-crisp.
Future roads/environments supply their own `TrackBuilder` data and `RoadPalette`.

## Driving, vehicles and input (Milestone 4)
| File | Role |
|---|---|
| `vehicles/VehicleSpec.ts`, `VehicleRoster.ts` | Vehicle data (price, top speed, acceleration, handling, braking, fuel, damage resistance, RPM range, engine sound id, cockpit/artwork keys) and the 6 starting cars |
| `systems/Transmission.ts` | 6 gears, auto/manual, shift timing, RPM calculation, torque curve/rev limiter |
| `systems/DrivingModel.ts` | Pure-TS physics (no Phaser): `update(dt, input, roadSample)` returns `DrivingState` incl. events (`shift`, `barrier_hit`, `out_of_fuel`). `WORLD_UNITS_PER_KPH = 45` links speed to the road renderer |
| `road/RoadLayout.ts` | Lateral road zones (road/rumble/shoulder) shared by renderer geometry and gameplay |
| `controls/` | `InputState` (what gameplay reads), `Bindings`, `KeyboardInput`, `GamepadInput`, `InputManager` (merges sources; touch will register via `addSource`) |
| `scripts/sim-driving.ts` | Headless regression checks, `npm run test:sim` |

Handling feel: lateral movement ∝ speed x steering (reduced at high speed), centrifugal push ∝ curve x speed², both scaled by the car's `handling` and surface grip.

## Cockpit (Milestone 5) — `src/UI/`
`CockpitView` builds layers over the road: dash frame (`cockpit_<car>_dash`, transparent windshield) -> gauge faces (placements from `cockpits/placements.json`) -> needles (`gauge_needle`, cropped to gauge radius, pivot at pixel 2,2) -> warning lamps (`dashboard_warnings` spritesheet, 22x16 frames) -> steering wheel (`steering_wheel_<car>`, rotated about its centre at 481,533, +/-22 deg, 2-degree steps) -> gear strip and 7-segment digit. `gaugeMath.ts` holds pure angle/warning logic. Dials are in mph with the printed scale (0-160 mph, 0-8000 rpm); faster/higher-revving cars swing slightly past the scale.

### Cockpit polish additions
`UI/RearMirror.ts` draws the mirror view behind the dash (depth below the transparent glass); `CockpitView.update(state, dt, CockpitFrame)` now takes the road palette, time of day, track position, curve behind and a `rearCars` list. `ensureCockpitAssets(scene, spec)` lazy-loads a car's cockpit textures; `loadSharedCockpitAssets` loads the shared pieces in PreloadScene. The wheel is now a static rim plus spoke/hub frames (+/-30 deg, 6-degree steps) and a marker dot on the rim ellipse; the older description above of a single rotated wheel sprite is superseded. Wheel frames/placements come from `cockpits/placements.json` (generated by `export.mjs`).

## Traffic (Milestone 6) — `src/traffic/`
| File | Role |
|---|---|
| `TrafficData.ts` | 6 `TrafficType`s (size, speed range, spawn weight), `UNITS_PER_METRE = 381` (one 3.5 m lane = 1333 world units), difficulty presets, `difficultyForLevel` |
| `TrafficManager.ts` | Pure TypeScript (no Phaser): pooled cars, spawn/populate, AI (following, lane changes), collisions/near-miss/pass events, `rearCars()` for the mirror. Seeded by `Rng.ts` for reproducibility |
| `TrafficRenderer.ts` | Pooled sprites placed by `RoadRenderer.projectSprite()`; scale from `traffic.json` pxPerMetre snapped to 1/16; crop below hill crests; fog alpha; time-of-day tint |
`DrivingModel.applyTrafficHit()` turns a `TrafficHit` into damage, speed loss and a lateral shove. `RoadSegment.clip` stores the per-frame crest clip used for hiding sprites. Rules of thumb: lateral hit threshold 0.34 road-half-widths, near miss under 0.56, cars keep ~1.2 s following distance.

## Environments (Milestone 7) — `src/road/environments/`
| File | Role |
|---|---|
| `EnvironmentTypes.ts` | `Environment` (palette, track, scenery rules, backdrop, signs), `SceneryRule`, `Zone` |
| `Environments.ts` | The seven environments (the last, Neon City, ignores time of day) as data; `ENVIRONMENTS` is the journey order |
| `SceneryPlacer.ts` | Seeded roadside placement into `segment.scenery`; keeps wide sprites off the road; signs and mile markers |
| `WorldBuilder.ts` | `buildWorld` chains environments into one road with zones; `applyPalettes` gives each segment its (blended) palette; `blendAt` reports the transition at a segment |
Rendering: `road/SceneryRenderer.ts` (pooled sprites from `RoadRenderer.projectSprite`-style data), `road/BackdropRenderer.ts` (per-environment backdrops cached and cross-faded), `road/TimeTint.ts`. `RoadSegment` gained `scenery`, `palette` and `zone`; `RoadPalette` gained optional `groundLeft` (sea). Time-of-day palettes come from `paletteForTime` (tint + horizon fog colour).

Weather (`road/WeatherRenderer.ts`): rain (depth 15), splashes (16), fog bank (14), lightning (13) and flash (17) sit below the cockpit (20); `weatherForTime` maps time of day to rain/fog and `RoadRenderer.setFogScale` thickens the road haze. `RoadSegment.barrierSide` (-1/0/1) restricts guardrails to one side; `TrackBuilder.restrictBarriers` sets it; `RoadSample.barrierSide` carries it to the driving model.

## Police (Milestone 8) — `src/police/`, `UI/PursuitHud.ts`
| File | Role |
|---|---|
| `PoliceData.ts` | Four `PoliceLevel`s, the cruiser `TrafficType`, siren textures, speeding tolerance and heat limit |
| `PoliceManager.ts` | Pure TypeScript state machine: idle (heat, patrol cruisers) -> pursuit (chase, block, escalate, bust/escape meters, scoring) -> busted/escaped -> cooldown; cruisers are `TrafficCar`s so `TrafficRenderer` draws them and traffic avoids them (`traffic.extras`) |
| `UI/PursuitHud.ts` | Heat/limit indicator, pursuit banner and bars, result card, siren glow (depth 17.5, under the cockpit) |
The scene feeds the manager the player's sample plus incidents (traffic hits, guardrail hits, near misses) and the current environment's `speedLimitKph`; police collisions go through `DrivingModel.applyTrafficHit`.

## Economy and garage (Milestone 9) — `src/economy/`, `scenes/GarageScene.ts`
| File | Role |
|---|---|
| `UpgradeData.ts` | Seven upgrade categories, level costs, repair cost formula |
| `VehicleTuning.ts` | `applyUpgrades(baseSpec, levels)` -> the spec the driving model actually uses; stat bar maxima |
| `Profile.ts` | `PlayerProfile` (money, reputation, owned cars with upgrades and damage); buy / upgrade / repair / select; versioned serialisation with defensive loading |
| `currentProfile.ts` | The session's shared profile (`getProfile`/`setProfile`); the save system will load into it |
`GarageScene` (showroom + workshop) and `startDrive` (loads the chosen car's cockpit art, then starts the drive scene; used by the garage and the main menu's road test). `DrivingModel.setVehicle(spec, damage)` and the new optional `VehicleSpec.shiftTime` carry upgrades and damage into driving.

## Arcade (Milestone 10) — `src/arcade/`
| File | Role |
|---|---|
| `Challenges.ts` | The six `ChallengeDef`s (rules data, default road, traffic/police settings, medal scores) |
| `ArcadeSession.ts` | Pure TypeScript: countdown, clock, distance, checkpoints, speed meter, crashes/near misses/escapes, scoring, medals, outcome |
| `Gates.ts` | Generates the gate textures and places/clears gate scenery on the road |
UI: `ArcadeHud`, `ArcadeMenuScene`, `ResultsScene`. The drive scene (`RoadTestScene`) turns into an arcade run when started with a `challengeId` (`startDrive(..., { challengeId, envId })`): it creates the session and HUD, locks input during the countdown, moves gates, records the score in the profile (`recordScore`) and opens the results screen.

## Career (Milestone 11) — `src/career/`
| File | Role |
|---|---|
| `Jobs.ts` | `JobDef` (client, tier, requirements, pay, arcade `ChallengeDef`) and the 15 jobs; pay multipliers |
| `Career.ts` | Ranks, road unlock levels, `checkRequirements`, `jobStatus`, `payFor`/`repFor`, `completeJob` (applies pay/fine/reputation/records and reports rank-ups and unlocks) |
`CareerScene` is the job board; `RoadTestScene` runs a job when started with `jobId` (same session/HUD as arcade) and applies `completeJob` at the end; `ResultsScene` shows the payout block. `PlayerProfile.completedJobs` stores progress.

## Mobile controls (Milestone 12) — `src/controls/`, `src/save/Settings.ts`, `src/systems/QualityManager.ts`
- `TouchLayout.ts`: control rectangles in 960x540 game space, wheel geometry, hit testing, pedal/wheel maths (pure).
- `TouchState.ts`: pure multitouch state machine (finger id -> control it owns; analogue pedal; spring-back wheel; one-shot pulses for gear/pause/auto-manual). Produces an `InputState`; unit-tested by `npm run sim:touch`.
- `TouchControls.ts`: the Phaser overlay (drawing + pointer wiring), added to `InputManager` as an `InputSource`, so driving code is unchanged. `InputState` gained `toggleTransmission`.
- `QualityManager.ts`: High/Medium/Low profiles (draw distance, scenery pool, full/lite weather) with fps-based auto stepping; `RoadRenderer.setDrawDistance`, `SceneryRenderer.poolLimit` and `WeatherRenderer.lite` are its levers.
- `Settings.ts`: `GameSettings` in localStorage (`openroad87.settings.v1`), parsed defensively.
- `index.html`: portrait "rotate your device" overlay; `touch-action: none` on the page.

## Audio (Milestone 13) — `src/audio/`
All sound is synthesised with WebAudio (no files). Layers, from pure logic up to the browser:
- Pure and headless-tested: `audioMath.ts` (engine profiles per car, RPM to pitch/brightness/loudness, mixing rules for tyres/wind/rumble/rain/traffic/siren, Doppler, siren tone), `MusicData.ts` (tracks as data compiled to per-step note events, `StepClock`), `driveFrame.ts` (builds the audio inputs from game state: traffic proximity, nearest siren, looped-track distances).
- WebAudio, taking any `BaseAudioContext` (so it can render offline in tests): `synth.ts` (noise, tones, drum and instrument voices), `Voices.ts` (continuous voices: engine, noise loops, tyre, siren, traffic drone), `Sfx.ts` (one-shot effects by name), `MusicPlayer.ts` (look-ahead scheduler and crossfades).
- `AudioManager.ts`: the singleton `audio`. Owns the AudioContext (created on the first user gesture), the buses (sfx and music into a master with a compressor), settings volumes, mute (X key), tab-hidden suspend, `playMusic()`, `sfx()`, `duckMusic()`. Until audio unlocks every call is a no-op and a requested track starts on unlock.
- `DriveAudio.ts`: per-drive session created by `RoadTestScene`: builds voices lazily, re-targets them 30 times a second from a `DriveAudioFrame`, switches engine when the car changes, silences on pause; `TRIM` holds measured per-layer loudness trims.
- Scenes call `audio.sfx(...)` / `audio.playMusic(...)`; `UI/MuteButton.ts` is the shared tap-to-mute label. A dev-only `window.__audio` handle exists for browser tests.
- Tests: `npm run sim:audio` (headless) plus offline-render checks run in the browser pane.

## Save system (Milestone 14) — `src/save/`
- `SaveFile.ts` (pure): the file envelope `{format, version, savedAt, checksum, data:{profile, settings, bindings}}`, `encodeSave` / `decodeSave` (never throws; returns `ok | repaired | invalid`, the issues found, and always a complete valid `SaveData`), the `MIGRATIONS` table, FNV-1a `checksum`.
- `SaveBackend.ts`: the storage interface (`read/write/remove`) with `LocalStorageBackend`, `MemoryBackend` (fallback and tests) and `createDefaultBackend`. This is the seam for a future cloud backend.
- `SaveManager.ts`: the singleton `saveManager`. `load()` (main > backup > salvage > fresh, keeps damaged copies under `.corrupt` / `.future`, imports the old settings key once), `save()` (skips unchanged state, keeps the previous good save as `.bak`, verifies the write, restores on failure), `start()` (2 s dirty-check autosave, save on settings/bindings change, flush on page hide), `exportText` / `importText`, `resetProgress` / `resetAll`. `main.ts` loads before the game starts.
- `Settings.ts` and `ControlPrefs.ts` hold the live settings and key bindings and notify the save manager on change; `Bindings.ts` gained `parseBindings`, `bindKey` (conflict handling) and `keyLabel`. `InputManager` reads the saved bindings.
- `scenes/SettingsScene.ts`: the settings UI. Dev-only `window.__save` handle for browser tests. Keys: `openroad87.save`, `.bak`, `.corrupt`, `.future`.
