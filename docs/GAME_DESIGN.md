# OPEN ROAD '87 — Game Design

Original retro highway driving game inspired by the spirit of 1980s cockpit racers. All art, audio, names and code are original.

## Pillars
1. **Driving feel first.** First-person cockpit, pseudo-3D road, convincing speed.
2. **Same systems on desktop and mobile.** Input is abstracted; gameplay never knows the device.
3. **Enhanced 1980s pixel art.** Consistent palette, lighting, sprite scale; nearest-neighbour scaling only.

## Technical targets
- Phaser 3-compatible API, TypeScript (strict), Vite, HTML5 Canvas/WebGL. (Installed Phaser resolves to v4.2.1 — see SYSTEM_ARCHITECTURE.md.)
- Virtual resolution 960x540, landscape, aspect-ratio-preserving FIT scaling.
- LocalStorage saves (behind a swappable interface).

## Modes
- **Arcade:** time trial, checkpoints, distance, traffic survival, high speed, police escape. Score = distance, speed, near misses, checkpoints, time left, escapes.
- **Career:** jobs -> money + reputation -> repair / buy / upgrade -> unlock roads -> harder events.

## Vehicles
Vortex GT, Night Hawk, Apex XR, Thunder V8, Silverline Turbo, Phantom X. Each has price, top speed, acceleration, handling, braking, fuel capacity, damage resistance, engine sound, cockpit and artwork.

## Environments
Mountain Pass, Desert Highway, Coastal Highway, Forest Highway, Countryside, Night Expressway (day / sunset / night / weather variants).

## Status
Milestone 1 (foundation + main menu) complete. See DEVELOPMENT_ROADMAP.md.
