# Controls

## Desktop (planned for driving; Milestone 4+)
| Action | Keys |
|---|---|
| Accelerate | W / Up |
| Brake | S / Down |
| Steer left / right | A / Left, D / Right |
| Gear up / down | Shift / Z |
| Pause | Esc |

Keys can be changed in SETTINGS > KEY BINDINGS (saved automatically). X and a few browser keys are reserved.

## Menus (implemented, Milestone 1)
- Keyboard: Up/Down or W/S to move, Enter or Space to select, Esc/Enter to go back on placeholder screens.
- Mouse/touch: hover/tap a button.
- Gamepad: D-pad or left stick to move, A to select (code in place; untested without hardware).

## Mobile (Milestone 12)
Landscape touch controls (shown automatically on touch devices; on desktop they appear after the first touch). Up to 4 fingers at once.
| Control | Where | Notes |
|---|---|---|
| Steer | bottom left | two big arrow buttons, or a virtual wheel (tap WHEEL / BUTTONS above it to switch); the wheel turns with your finger and springs back |
| Gas | bottom right (tall pedal) | analogue: press nearer the bottom for more throttle |
| Brake | left of the gas | |
| SHIFT + / - | right edge | manual mode only |
| AUTO / MANUAL | above the shift buttons | toggles the transmission |
| Pause | top right | shows tappable RESUME / QUIT during arcade runs |
Hold a finger on a control and slide away: it stays pressed until you lift. Portrait phones show a "rotate to landscape" screen.

## Road test scene (temporary, Milestone 3)
W/Up gas, S/Down brake, A/D steer, Space toggles auto-throttle, T cycles day/sunset/night/storm, Esc returns to menu.

## Driving (implemented in Milestone 4; the extra keys below belong to the developer Road Test scene, which is only in development builds)
Keyboard: W/Up accelerate, S/Down brake, A/D or Left/Right steer, Shift gear up, Z gear down (manual mode only; Ctrl is avoided because Ctrl+W closes the browser tab), Esc exit. Bindings are data (`controls/Bindings.ts`) so they can be made configurable in Settings.
Gamepad (standard mapping): RT/A accelerate, LT/B/X brake, left stick or D-pad steer, RB gear up, LB gear down, Start pause (untested without hardware).
Road Test extras: M toggle auto/manual, 1-6 pick car, R refuel + repair, T sky, Space cruise throttle.
Turn signals (Road Test): Q left, E right (press again to cancel; self-cancels after you turn and straighten). Steering hard blinks the matching side automatically.

Traffic (Road Test): K cycle traffic level (easy/normal/hard/extreme), N traffic on/off.

Environments (Road Test): B cycles the seven environments and the chained Journey; T cycles time of day (auto = each environment's own, then day, sunset, night, storm).

Weather: set the time of day to storm with T (auto -> day -> sunset -> night -> storm) to see rain, fog and lightning.

Police (Road Test): L police on/off, Y cycle police level (Highway Patrol .. Elite), F force a pursuit now. Speeding past the posted limit (+20 km/h) or crashing builds heat; passing a patrol car at speed starts a chase.

Garage: Up/Down select a row, Left/Right change the active car (workshop), Tab switches showroom/workshop, Enter or the big button buys / upgrades / repairs, D drives, Esc goes back, (in development builds only, C adds $10,000 for testing). Mouse/touch: tap a row to select it (tap again to act) and use the on-screen buttons.

Arcade: Up/Down choose a challenge, Left/Right choose the road, Enter start, Esc back. During a run: Esc pauses (Esc resume, Q quit). Results: Enter retry, Esc arcade menu, M main menu.

Career: Up/Down choose a job, Enter start, G garage, Esc back. Locked or unqualified jobs show why on the board.

Sound: X toggles mute everywhere. A SOUND ON / OFF button is on the main menu (top right) and in the arcade pause menu for touch screens. Sound starts after your first click, key press or touch (a browser rule).

Settings (main menu > SETTINGS): Up/Down select, Left/Right change a value, Enter acts (open key bindings, export/import, reset), Esc goes back; tap a row to select and tap < > to change. In KEY BINDINGS press Enter (or tap) on an action, then the new key; Esc cancels.
