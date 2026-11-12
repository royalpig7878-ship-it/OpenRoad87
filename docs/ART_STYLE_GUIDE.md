# Art Style Guide

Derived from the existing asset set (reviewed in Milestone 2). New art must match it.

## Look
- Enhanced 1980s pixel art: dithered gradients, clear dark outlines, hand-placed highlights, no blur, no vector or photoreal rendering.
- Synthwave-leaning palette: warm orange/magenta sunsets, purple shadows, deep navy cockpit interiors, red/amber instrument lighting.
- Light comes from the upper-left / sun side; shadows fall to the right and use purple, not black.

## Scale and perspective
- Native art is authored at the 960x540 virtual resolution. Never scale sprites non-uniformly; use integer or uniform scale only.
- Vehicle and scenery sprites carry a **world scale** (`pxPerMetre` in `traffic.json` / `scenery.json`). Place objects by their bottom-centre pixel on the ground.
- Vehicle side views are 256x128 (player), traffic/police 192x128 (side, front, rear views). Signs are 128x192. Tiling backgrounds are 960 wide and tile horizontally.

## Sprites and sheets
- Individual sprites have transparent backgrounds. Backgrounds and full-screen overlays are 960x540.
- Animation sheets are horizontal strips: width = frame width x frame count. Frame sizes, counts and fps are in `effects/anims.json`, `effects/fx.json` and in ASSET_CATALOG.md.
- Cockpits are **layered**: the windshield area is transparent so the road renders behind; the dashboard/frame is the foreground. Gauge needles and the steering wheel are separate sprites placed using `cockpits/placements.json`.

## Rules
1. Consistent filenames: `category_name[_variant].png` in lower snake_case.
2. Every asset must appear in the catalog and pass `npm run assets:verify`.
3. No placeholder art without listing it in the catalog.
4. Menu typography: currently a system monospace font (temporary). A pixel bitmap font should be added to match the art.
