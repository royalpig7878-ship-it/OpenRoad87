import { Rng } from '../../traffic/Rng';
import { UNITS_PER_METRE } from '../../traffic/TrafficData';
import { RoadConfig, RoadSegment } from '../RoadTypes';
import { SceneryArt, SceneryItem, Zone } from './EnvironmentTypes';

/** Lateral distance (road-half-widths) of the paved shoulder's outer edge plus a margin: nothing is placed closer. */
const CLEAR_EDGE = 1.8;

export interface PlaceOptions {
  seed: number;
  /** Segments over which scenery density fades at a zone boundary (when there is more than one zone). */
  transition: number;
}

/** Smallest lateral position at which an object of this size stays off the road. */
export function minLateral(art: SceneryArt, scale: number, cfg: RoadConfig): number {
  const halfWidthUnits = (art.w / art.pxPerMetre / 2) * scale * UNITS_PER_METRE;
  // Only the outer part of very wide sprites matters visually; allow slight overlap onto the shoulder.
  return CLEAR_EDGE + (halfWidthUnits / cfg.roadWidth) * 0.95;
}

/**
 * Fills `segment.scenery` for the whole world from each zone's rules, deterministically (seeded).
 * Density fades toward zone boundaries so one environment's objects thin out as the next one's appear.
 */
export function placeScenery(segments: RoadSegment[], zones: Zone[], art: Record<string, SceneryArt>, cfg: RoadConfig, opts: PlaceOptions): void {
  for (const seg of segments) seg.scenery = [];

  zones.forEach((zone, zi) => {
    const rng = new Rng(opts.seed + zi * 977);
    const T = opts.transition;
    const fade = (i: number) => (zones.length > 1 ? Math.min(1, (i - zone.start + 1) / T, (zone.end - i) / T) : 1);
    const add = (i: number, texture: string, lateralMin: number, lateralMax: number, side: -1 | 1, scaleRange: [number, number]) => {
      const a = art[texture];
      if (!a) return;
      const scale = rng.range(scaleRange[0], scaleRange[1]);
      const lat = Math.max(rng.range(lateralMin, lateralMax), minLateral(a, scale, cfg));
      segments[i].scenery.push({ texture, x: side * lat, scale });
    };

    for (const rule of zone.env.scenery) {
      if (rule.center) {
        let at = zone.start + rng.range(rule.spacing[0], rule.spacing[1]);
        while (at < zone.end - 5) {
          const i = Math.floor(at);
          if (rng.next() < fade(i) && art[rule.textures[0]]) segments[i].scenery.push({ texture: rule.textures[rng.int(rule.textures.length)], x: 0, scale: 1 });
          at += rng.range(rule.spacing[0], rule.spacing[1]);
        }
        continue;
      }
      const sides: Array<-1 | 1> = rule.side === -1 ? [-1] : rule.side === 1 ? [1] : [-1, 1];
      for (const side of sides) {
        let cursor = zone.start + rng.range(0, rule.spacing[1]);
        while (cursor < zone.end) {
          const i = Math.floor(cursor);
          if (rng.next() < fade(i)) {
            const tex = rule.textures[rng.int(rule.textures.length)];
            add(i, tex, rule.lateral[0], rule.lateral[1], side, rule.scale ?? [1, 1]);
          }
          cursor += Math.max(1, rng.range(rule.spacing[0], rule.spacing[1]));
        }
      }
    }

    // Road furniture: warning signs ahead of curves, speed/info signs, mile markers.
    const signs = zone.env.signs;
    if (signs) {
      for (let i = zone.start + 25; i < zone.end - 5; i++) {
        const entering = Math.abs(segments[i].curve) >= 3 && Math.abs(segments[i - 1].curve) < 3;
        if (entering && rng.next() < 0.8) add(i - 22, signs.curve, 1.85, 1.95, 1, [1, 1]);
      }
      let next = zone.start + rng.range(60, 140);
      let k = 0;
      while (next < zone.end - 10) {
        if (rng.next() < fade(Math.floor(next))) add(Math.floor(next), signs.speed[k++ % signs.speed.length], 1.85, 1.95, 1, [1, 1]);
        next += rng.range(150, 260);
      }
    }
    for (let i = zone.start + 50; i < zone.end - 10; i += 100) add(i, 'road_mile_marker', 1.76, 1.8, 1, [1, 1]);
  });
}

export type { SceneryItem };
