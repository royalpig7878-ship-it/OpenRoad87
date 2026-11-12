export type QualityLevel = 'high' | 'medium' | 'low';

/** What each quality level changes. Higher levels draw farther and keep more sprites and weather effects. */
export interface QualityProfile {
  drawDistance: number;
  sceneryPool: number;
  /** Rain splashes and lightning bolts (the expensive weather layers). */
  fullWeather: boolean;
  /** Road level-of-detail multiplier (see RoadRenderer.lod): higher skips more far-away road detail. */
  roadLod: number;
  /** Smoothed 4x versions of scenery art for objects that are close to the camera (uses more memory). */
  hdScenery: boolean;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  high: { drawDistance: 300, sceneryPool: 260, fullWeather: true, roadLod: 1, hdScenery: true },
  medium: { drawDistance: 230, sceneryPool: 180, fullWeather: true, roadLod: 1.8, hdScenery: false },
  low: { drawDistance: 170, sceneryPool: 110, fullWeather: false, roadLod: 3, hdScenery: false },
};

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];
const WINDOW_S = 2; // measure the average frame rate over this long
const DROP_BELOW_FPS = 45;
const RAISE_ABOVE_FPS = 57;
const RAISE_AFTER_S = 12; // must stay smooth this long before stepping quality back up
const COOLDOWN_S = 5; // minimum time between drops

/**
 * Adaptive graphics quality. Watches the frame rate and steps quality down when it stays low, and back up
 * after a long smooth stretch. Pure logic (no Phaser); the drive scene applies the level it reports.
 */
export class QualityManager {
  level: QualityLevel;
  private auto: boolean;
  private acc = 0;
  private smooth = 0;
  private cooldown = 0;

  constructor(start: QualityLevel = 'high', auto = true) {
    this.level = start;
    this.auto = auto;
  }

  get profile(): QualityProfile {
    return QUALITY[this.level];
  }

  setLevel(level: QualityLevel, auto = false): void {
    this.level = level;
    this.auto = auto;
    this.acc = this.smooth = 0;
  }

  /** Feed one frame. Returns true if the level changed this frame. */
  update(dt: number, fps: number): boolean {
    if (!this.auto) return false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.acc += dt;
    // Time spent at a smooth frame rate; any dip resets the streak.
    this.smooth = fps >= RAISE_ABOVE_FPS ? this.smooth + dt : 0;
    if (this.acc < WINDOW_S) return false;
    const avg = fps; // the caller passes a smoothed frame rate (Phaser's actualFps)
    this.acc = 0;
    const i = ORDER.indexOf(this.level);
    if (avg < DROP_BELOW_FPS && i < ORDER.length - 1 && this.cooldown === 0) {
      this.level = ORDER[i + 1];
      this.cooldown = COOLDOWN_S;
      this.smooth = 0;
      return true;
    }
    if (this.smooth >= RAISE_AFTER_S && i > 0) {
      this.level = ORDER[i - 1];
      this.smooth = 0;
      this.cooldown = COOLDOWN_S;
      return true;
    }
    return false;
  }
}
