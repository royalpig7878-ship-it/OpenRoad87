# OPEN ROAD '87

An original retro first-person highway driving game in the spirit of 1980s arcade racers. Pseudo-3D road,
six cars with their own cockpits, traffic, police chases, arcade challenges, a career mode, a garage, procedural
80s audio, touch controls for phones, and a save system. Built with Phaser 4, TypeScript and Vite. All art is
original pixel art and all sound is synthesised in the browser (no audio files, nothing to license).

## Run it

```bash
npm install
npm run dev
```

Open the address it prints (default http://localhost:5173). `npm run dev` also serves your local network, so a
phone on the same Wi-Fi can open the printed network address.

Release build:

```bash
npm run build      # type-checks, then writes the game to dist/
npm run preview    # serves dist/ locally (default http://localhost:4173)
```

`dist/` is a static site: upload it to any web host (it uses relative paths, so it works in a sub-folder).

## Play

| Action | Keys | Touch |
|---|---|---|
| Accelerate / brake | W S or Up Down | right-hand pedals |
| Steer | A D or Left Right | left buttons or wheel |
| Gear up / down (manual) | Shift / Z | SHIFT +/- buttons |
| Pause | Esc | II button |
| Mute | X | SOUND button |

Main menu: **Arcade** (six scored challenges), **Career** (15 jobs, reputation and unlocks), **Garage** (buy,
upgrade and repair cars), **Settings** (volume, touch options, graphics, fullscreen, key rebinding, save export /
import / reset). Progress saves automatically in the browser. See `notes/CONTROLS.md` for everything.

## Check it

```bash
npm run test:sim        # headless tests of driving, traffic, world, police, economy, arcade, career, touch, audio, save
npm run assets:verify   # checks every art file (and the 4096 px mobile texture limit)
npm run bench           # per-frame allocation and draw-call benchmark
```

## Project layout

- `src/` game code: `road/` renderer and environments, `systems/` driving model, `vehicles/`, `traffic/`, `police/`,
  `economy/`, `arcade/`, `career/`, `audio/`, `controls/`, `save/`, `UI/`, `scenes/`
- `public/assets/` the art (PNG and JSON metadata)
- `scripts/` simulations, benchmark and asset tools
- `notes/` design, architecture, controls, art style, asset catalog, roadmap and the bug log

Known limitations and open items are listed in `notes/BUG_LOG.md`; what each milestone delivered is in
`notes/DEVELOPMENT_ROADMAP.md`.
