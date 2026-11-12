import { RoadConfig, RoadPoint, RoadSegment } from './RoadTypes';

/** Standard curve strengths. */
export const Curve = { None: 0, Easy: 2, Medium: 4, Hard: 6, Hairpin: 9 } as const;
/** Hill heights in segments-of-rise (multiplied by segment length). */
export const Hill = { None: 0, Low: 20, Medium: 40, High: 60 } as const;

const easeIn = (a: number, b: number, t: number) => a + (b - a) * Math.pow(t, 2);
const easeOut = (a: number, b: number, t: number) => a + (b - a) * (1 - Math.pow(1 - t, 2));
const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

const emptyPoint = (): RoadPoint => ({
  world: { x: 0, y: 0, z: 0 },
  camera: { x: 0, y: 0, z: 0 },
  screen: { x: 0, y: 0, w: 0, scale: 0 },
});

/**
 * Builds a looping list of road segments from configurable sections
 * (straights, curves, hills). Data-driven so any environment can supply its own road.
 */
export class TrackBuilder {
  readonly segments: RoadSegment[] = [];

  constructor(private readonly cfg: RoadConfig) {}

  private lastY(): number {
    return this.segments.length === 0 ? 0 : this.segments[this.segments.length - 1].p2.world.y;
  }

  private addSegment(curve: number, y: number, barrier: boolean): void {
    const n = this.segments.length;
    const p1 = emptyPoint();
    const p2 = emptyPoint();
    p1.world.y = this.lastY();
    p1.world.z = n * this.cfg.segmentLength;
    p2.world.y = y;
    p2.world.z = (n + 1) * this.cfg.segmentLength;
    this.segments.push({
      index: n,
      p1,
      p2,
      curve,
      band: Math.floor(n / this.cfg.rumbleLength) % 2 === 0 ? 0 : 1,
      barrier,
      barrierSide: 0,
      looped: false,
      fog: 0,
      clip: 0,
      scenery: [],
      zone: 0,
    });
  }

  /**
   * Adds a road section: `enter` segments easing into the curve/height change,
   * `hold` segments at full strength, `leave` segments easing out.
   * `rise` is the total height change (in world units) over the whole section.
   */
  addSection(enter: number, hold: number, leave: number, curve: number, rise = 0, barrier = false): this {
    const startY = this.lastY();
    const endY = startY + rise;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total), barrier);
    for (let n = 0; n < hold; n++) this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total), barrier);
    for (let n = 0; n < leave; n++) this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total), barrier);
    return this;
  }

  straight(length = 25): this {
    return this.addSection(length, length, length, 0, 0);
  }

  curve(length: number, curve: number, rise = 0, barrier = true): this {
    const third = Math.max(1, Math.floor(length / 3));
    return this.addSection(third, third, third, curve, rise, barrier);
  }

  /** Rolling hill: rises then returns to the starting height. */
  hill(length: number, height: number, curve = 0): this {
    const half = Math.max(1, Math.floor(length / 2));
    this.addSection(half, 0, 0, curve, height * this.cfg.segmentLength);
    return this.addSection(half, 0, 0, curve, -height * this.cfg.segmentLength);
  }

  /** Sustained climb/descent in a straight line. */
  slope(length: number, height: number, curve = 0, barrier = false): this {
    const third = Math.max(1, Math.floor(length / 3));
    return this.addSection(third, third, third, curve, height * this.cfg.segmentLength, barrier);
  }

  /** Limits barriers on segments from `fromIndex` on to one side (e.g. guardrails only on the sea side). */
  restrictBarriers(fromIndex: number, side: -1 | 1): this {
    for (let i = fromIndex; i < this.segments.length; i++) this.segments[i].barrierSide = side;
    return this;
  }

  /** Finishes the track so it loops: eases the road back to height 0. */
  close(length = 40): this {
    const back = -this.lastY();
    const third = Math.max(1, Math.floor(length / 3));
    return this.addSection(third, third, third, 0, back);
  }

  get trackLength(): number {
    return this.segments.length * this.cfg.segmentLength;
  }
}

export { easeIn, easeOut, easeInOut };
