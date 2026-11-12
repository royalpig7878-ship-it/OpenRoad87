import { RoadPalette } from './RoadTypes';

/** Mountain-pass daytime palette. Environments (Milestone 7) add their own. */
export const MountainDay: RoadPalette = {
  road: [0x5a5d66, 0x535660],
  grass: [0x6f9a4a, 0x628c40],
  rumble: [0xd8d2c0, 0xb83a3a],
  shoulder: [0x8a8478, 0x807a6e],
  lane: 0xf2eedc,
  edgeLine: 0xf2eedc,
  barrier: [0xb8bcc4, 0x9096a0],
  barrierTop: 0xe8ecf2,
  fog: 0xc4dcf2,
};

/** Linear blend of two 0xRRGGBB colours. t=0 -> a, t=1 -> b. */
export function lerpColor(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}

/** Returns a copy of `base` with every colour blended toward `tint` and fog set to `fog`. */
export function tintPalette(base: RoadPalette, tint: number, amount: number, fog: number): RoadPalette {
  const t = (c: number) => lerpColor(c, tint, amount);
  const t2 = (p: [number, number]): [number, number] => [t(p[0]), t(p[1])];
  return {
    road: t2(base.road),
    grass: t2(base.grass),
    rumble: t2(base.rumble),
    shoulder: t2(base.shoulder),
    lane: t(base.lane),
    edgeLine: t(base.edgeLine),
    barrier: t2(base.barrier),
    barrierTop: t(base.barrierTop),
    fog,
    groundLeft: base.groundLeft ? t2(base.groundLeft) : undefined,
  };
}

/** Time-of-day variants of the mountain palette (fog colours match the sky art's horizon band). */
export const MountainByTime = {
  day: MountainDay,
  sunset: tintPalette(MountainDay, 0xd0603a, 0.35, 0xe8a070),
  night: tintPalette(MountainDay, 0x0a1030, 0.7, 0x141c3c),
  storm: tintPalette(MountainDay, 0x3a4048, 0.5, 0x6a7078),
};

/** How each time of day recolours a daytime palette: tint colour, strength, and the fog/horizon colour. */
export const TIME_LOOK = {
  day: null,
  sunset: { tint: 0xd0603a, amount: 0.35, fog: 0xe8a070 },
  night: { tint: 0x0a1030, amount: 0.7, fog: 0x141c3c },
  storm: { tint: 0x3a4048, amount: 0.5, fog: 0x6a7078 },
} as const;

/** The palette for an environment at a given time of day (day returns the palette unchanged). */
export function paletteForTime(base: RoadPalette, time: keyof typeof TIME_LOOK): RoadPalette {
  const look = TIME_LOOK[time];
  return look ? tintPalette(base, look.tint, look.amount, look.fog) : base;
}

/** Blend two palettes: t = 0 gives a, t = 1 gives b. */
export function lerpPalette(a: RoadPalette, b: RoadPalette, t: number): RoadPalette {
  const m = (x: number, y: number) => lerpColor(x, y, t);
  const m2 = (x: [number, number], y: [number, number]): [number, number] => [m(x[0], y[0]), m(x[1], y[1])];
  return {
    road: m2(a.road, b.road),
    grass: m2(a.grass, b.grass),
    rumble: m2(a.rumble, b.rumble),
    shoulder: m2(a.shoulder, b.shoulder),
    lane: m(a.lane, b.lane),
    edgeLine: m(a.edgeLine, b.edgeLine),
    barrier: m2(a.barrier, b.barrier),
    barrierTop: m(a.barrierTop, b.barrierTop),
    fog: m(a.fog, b.fog),
    // The sea only exists in one of the two? fade it by blending toward the other side's grass.
    groundLeft: a.groundLeft || b.groundLeft ? m2(a.groundLeft ?? a.grass, b.groundLeft ?? b.grass) : undefined,
  };
}
