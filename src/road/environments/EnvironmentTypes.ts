import { RoadPalette } from '../RoadTypes';
import { TrackBuilder } from '../TrackBuilder';

export type TimeOfDay = 'day' | 'sunset' | 'night' | 'storm';

/** One placed roadside object. `x` is the lateral position in road-half-widths from the centre line. */
export interface SceneryItem {
  texture: string;
  x: number;
  /** Extra size multiplier on top of the art's real-world scale. */
  scale: number;
}

/** A rule describing how often a kind of scenery appears beside the road. */
export interface SceneryRule {
  textures: string[];
  /** Gap between objects in segments, [min, max]. */
  spacing: [number, number];
  /** Distance from the centre line in road-half-widths, [min, max] (the placer also keeps wide objects off the road). */
  lateral: [number, number];
  scale?: [number, number];
  /** -1 = left only, 1 = right only, 0/undefined = both. */
  side?: -1 | 0 | 1;
  /** Stand on the road's centre line instead of beside it (overpasses); ignores `lateral` and `side`. */
  center?: boolean;
}

/** One horizontally tiling background layer. */
export interface BackdropLayer {
  /** Texture key; `{t}` is replaced by the time of day (e.g. sky_{t}_layer_far). */
  key: string;
  parallax: number;
  /** Place the layer's bottom edge on the horizon instead of aligning art coordinates (for strips). */
  bottomAtHorizon?: boolean;
  /** Tint the layer by time of day (for art that exists only in day colours). */
  tintByTime?: boolean;
}

export interface BackdropSpec {
  layers: BackdropLayer[];
}

export interface Environment {
  id: string;
  name: string;
  /** Daytime road/ground colours; time-of-day variants are derived from it. */
  palette: RoadPalette;
  /** Posted speed limit in mph (matches the road-sign art); police care once you exceed it by a margin. */
  speedLimitMph: number;
  /** Time of day this environment is set in unless the player overrides it. */
  defaultTime: TimeOfDay;
  /** Appends this environment's road to the builder (should end with `close`). */
  buildTrack: (t: TrackBuilder) => void;
  scenery: SceneryRule[];
  backdrop: BackdropSpec;
  /** Always drawn in its own colours: ignores the time-of-day tint (the neon level). */
  fixedLook?: boolean;
  /** Warning signs before curves, speed limits and mile markers. */
  signs?: { curve: string; speed: string[] };
}

/** A stretch of the world belonging to one environment. */
export interface Zone {
  env: Environment;
  /** First segment index (inclusive) and end index (exclusive). */
  start: number;
  end: number;
}

/** Art metadata needed for placing scenery without touching Phaser. */
export interface SceneryArt {
  w: number;
  h: number;
  pxPerMetre: number;
}
