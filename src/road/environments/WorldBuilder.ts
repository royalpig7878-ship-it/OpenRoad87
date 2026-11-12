import { lerpPalette, paletteForTime } from '../RoadPalettes';
import { RoadConfig, RoadPalette, RoadSegment } from '../RoadTypes';
import { TrackBuilder } from '../TrackBuilder';
import { Environment, SceneryArt, TimeOfDay, Zone } from './EnvironmentTypes';
import { placeScenery } from './SceneryPlacer';

/** Segments on each side of a zone boundary over which colours/backdrop/scenery blend. */
export const TRANSITION_SEGMENTS = 60;

export interface World {
  segments: RoadSegment[];
  zones: Zone[];
  trackLength: number;
}

/**
 * Builds the road for one or more environments chained end to end (each zone is the environment's own road
 * layout), then places scenery for every zone. Palettes are applied separately so the time of day can change.
 */
export function buildWorld(cfg: RoadConfig, envs: Environment[], art: Record<string, SceneryArt>, seed = 87): World {
  const builder = new TrackBuilder(cfg);
  const zones: Zone[] = [];
  for (const env of envs) {
    const start = builder.segments.length;
    env.buildTrack(builder);
    zones.push({ env, start, end: builder.segments.length });
  }
  zones.forEach((z, zi) => {
    for (let i = z.start; i < z.end; i++) builder.segments[i].zone = zi;
  });
  placeScenery(builder.segments, zones, art, cfg, { seed, transition: TRANSITION_SEGMENTS });
  return { segments: builder.segments, zones, trackLength: builder.trackLength };
}

/** Which zone a segment is in and, near a boundary, which neighbour it is blending with (t in 0..0.5). */
export function blendAt(world: World, index: number): { zone: number; neighbour: number; t: number } {
  const { zones } = world;
  const zi = world.segments[index].zone;
  const z = zones[zi];
  const n = zones.length;
  if (n === 1) return { zone: zi, neighbour: zi, t: 0 };
  const T = TRANSITION_SEGMENTS;
  const dStart = index - z.start;
  const dEnd = z.end - 1 - index;
  if (dStart < T) return { zone: zi, neighbour: (zi - 1 + n) % n, t: 0.5 * (1 - dStart / T) };
  if (dEnd < T) return { zone: zi, neighbour: (zi + 1) % n, t: 0.5 * (1 - dEnd / T) };
  return { zone: zi, neighbour: zi, t: 0 };
}

/**
 * Assigns every segment its palette for the given time of day: the zone's own colours, blended with the
 * neighbouring zone's across boundaries. `timeFor` lets a zone keep its own time (e.g. the night expressway).
 */
export function applyPalettes(world: World, timeFor: (env: Environment) => TimeOfDay): void {
  const base = new Map<number, RoadPalette>();
  const paletteOf = (zi: number) => {
    let p = base.get(zi);
    if (!p) {
      const env = world.zones[zi].env;
      p = env.fixedLook ? env.palette : paletteForTime(env.palette, timeFor(env));
      base.set(zi, p);
    }
    return p;
  };
  const cache = new Map<string, RoadPalette>();
  world.segments.forEach((seg, i) => {
    const { zone, neighbour, t } = blendAt(world, i);
    const q = Math.round(t * 20); // quantise so segments share palette objects
    if (neighbour === zone || q === 0) {
      seg.palette = paletteOf(zone);
      return;
    }
    const key = `${zone}:${neighbour}:${q}`;
    let p = cache.get(key);
    if (!p) {
      p = lerpPalette(paletteOf(zone), paletteOf(neighbour), q / 20);
      cache.set(key, p);
    }
    seg.palette = p;
  });
}
