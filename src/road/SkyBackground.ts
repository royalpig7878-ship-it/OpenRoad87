import Phaser from 'phaser';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from '../core/config';

export type TimeOfDay = 'day' | 'sunset' | 'night' | 'storm';

/** Parallax factors from scenery/sky.json (sky, far mountains, near hills). */
const PARALLAX = [0.02, 0.08, 0.2];
/** Horizon row baked into the sky art (scenery/sky.json "horizonY"). */
export const SKY_HORIZON_Y = 262;

export const skyTextureKeys = (t: TimeOfDay) => [`sky_${t}_layer_sky`, `sky_${t}_layer_far`, `sky_${t}_layer_near`];

/** Three horizontally-tiling sky layers that scroll as the road curves. */
export class SkyBackground {
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private offsets = [0, 0, 0];
  /** Resting y of each layer: mountains/hills follow the horizon, the sky gradient moves less so the sun stays visible. */
  private baseY: number[];

  constructor(scene: Phaser.Scene, time: TimeOfDay, horizonY: number = SKY_HORIZON_Y) {
    const shift = horizonY - SKY_HORIZON_Y; // negative = art moves up
    this.baseY = [Math.max(shift, -20), shift, shift];
    for (const key of skyTextureKeys(time)) {
      const ts = scene.add.tileSprite(0, this.baseY[this.layers.length], VIRTUAL_WIDTH, VIRTUAL_HEIGHT, key).setOrigin(0, 0);
      this.layers.push(ts);
    }
  }

  /** `curveShift` is curve * speedPercent * dt; layers move by their parallax factor. */
  scroll(curveShift: number): void {
    this.layers.forEach((l, i) => {
      // Accumulate in floats so slow drifts aren't lost to pixel rounding, then snap for crisp pixels.
      this.offsets[i] += curveShift * PARALLAX[i] * 300;
      l.tilePositionX = Math.round(this.offsets[i]);
    });
  }

  /** Vertical offset in pixels (used for road-surface rumble). */
  setOffsetY(y: number): void {
    this.layers.forEach((l, i) => (l.y = this.baseY[i] + y));
  }

  destroy(): void {
    this.layers.forEach((l) => l.destroy());
    this.layers = [];
  }

  setDepth(d: number): void {
    this.layers.forEach((l) => l.setDepth(d));
  }
}
