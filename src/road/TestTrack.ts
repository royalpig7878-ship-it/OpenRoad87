import { RoadConfig } from './RoadTypes';
import { TrackBuilder, Curve } from './TrackBuilder';

/** Default road geometry (960x540, horizon matches the sky art). */
export const DEFAULT_ROAD_CONFIG: RoadConfig = {
  width: 960,
  height: 540,
  // Raised from the sky art's baked 262 so more road shows through the windshield (sky layers are shifted to match).
  horizonY: 215,
  roadWidth: 2000,
  segmentLength: 200,
  rumbleLength: 3,
  lanes: 3,
  fieldOfView: 100,
  cameraHeight: 1000,
  drawDistance: 300,
  fogDensity: 5,
};

/** The mountain-pass road: S-bends, a hairpin, hills and a long climb. Appends to `t` and ends back at height 0. */
export function mountainSections(t: TrackBuilder): void {
  t.straight(20)
    .hill(60, 4)
    .curve(50, Curve.Easy)
    .straight(15)
    .curve(60, -Curve.Medium)
    .curve(60, Curve.Medium)
    .hill(80, 6)
    .curve(50, Curve.Hard, 0)
    .straight(20)
    .slope(80, 12, Curve.Easy)
    .curve(70, -Curve.Hard, 0)
    .curve(40, Curve.Hairpin, 0)
    .slope(80, -12, -Curve.Easy)
    .hill(40, 3, Curve.Medium)
    .curve(50, -Curve.Easy)
    .straight(30)
    .close(40);
}

/** A varied test road: straights, easy/hard curves, S-bends, hills, a hairpin and a long climb. */
export function buildTestTrack(cfg: RoadConfig): TrackBuilder {
  const t = new TrackBuilder(cfg);
  t.straight(20)
    .hill(60, 4)
    .curve(50, Curve.Easy)
    .straight(15)
    .curve(60, -Curve.Medium)
    .curve(60, Curve.Medium)
    .hill(80, 6)
    .curve(50, Curve.Hard, 0)
    .straight(20)
    .slope(80, 12, Curve.Easy)
    .curve(70, -Curve.Hard, 0)
    .curve(40, Curve.Hairpin, 0)
    .slope(80, -12, -Curve.Easy)
    .hill(40, 3, Curve.Medium)
    .curve(50, -Curve.Easy)
    .straight(30)
    .close(40);
  return t;
}
