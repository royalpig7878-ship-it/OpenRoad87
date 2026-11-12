import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/config';
import { Environment, TimeOfDay } from './environments/EnvironmentTypes';
import { SKY_HORIZON_Y } from './SkyBackground';
import { TIME_TINT } from './TimeTint';

/** One environment's background at one time of day: tiling sky/mountain/strip layers. */
class Backdrop {
  private layers: Phaser.GameObjects.TileSprite[] = [];
  private parallax: number[] = [];
  private offsets: number[] = [];
  private baseY: number[] = [];

  constructor(scene: Phaser.Scene, env: Environment, time: TimeOfDay, horizonY: number) {
    const shift = horizonY - SKY_HORIZON_Y; // negative = art moves up so its baked horizon meets ours
    env.backdrop.layers.forEach((layer) => {
      const key = layer.key.replace('{t}', time);
      const tex = scene.textures.get(key).getSourceImage();
      const h = tex.height;
      const isSky = key.includes('_layer_sky');
      const y = layer.bottomAtHorizon ? horizonY - h + 2 : isSky ? Math.max(shift, -20) : shift;
      const ts = scene.add.tileSprite(0, y, VIRTUAL_WIDTH, h === VIRTUAL_HEIGHT ? VIRTUAL_HEIGHT : h, key).setOrigin(0, 0).setVisible(false);
      if (layer.tintByTime) ts.setTint(TIME_TINT[time]);
      this.layers.push(ts);
      this.parallax.push(layer.parallax);
      this.offsets.push(0);
      this.baseY.push(y);
    });
  }

  scroll(curveShift: number): void {
    this.layers.forEach((l, i) => {
      this.offsets[i] += curveShift * this.parallax[i] * 300;
      l.tilePositionX = Math.round(this.offsets[i]);
    });
  }

  /** Show with `alpha` (0 hides it); `depth` orders it against the other backdrop; `jolt` is road rumble. */
  show(alpha: number, depth: number, jolt: number): void {
    this.layers.forEach((l, i) => {
      l.setVisible(alpha > 0.001).setAlpha(alpha).setDepth(depth + i * 0.01);
      l.y = this.baseY[i] + jolt;
    });
  }

  destroy(): void {
    this.layers.forEach((l) => l.destroy());
    this.layers = [];
  }
}

/**
 * Shows the backdrop for the camera's environment and cross-fades to the neighbouring environment's
 * backdrop near zone boundaries. Backdrops are created on first use and cached.
 */
export class BackdropBlender {
  private cache = new Map<string, Backdrop>();

  constructor(private scene: Phaser.Scene, private horizonY: number) {}

  private get(env: Environment, time: TimeOfDay): Backdrop {
    const key = `${env.id}:${time}`;
    let b = this.cache.get(key);
    if (!b) {
      b = new Backdrop(this.scene, env, time, this.horizonY);
      this.cache.set(key, b);
    }
    return b;
  }

  /** `a` is drawn fully; `b` fades in over it with weight `t` (0 = not at all). */
  update(a: { env: Environment; time: TimeOfDay }, b: { env: Environment; time: TimeOfDay }, t: number, curveShift: number, jolt: number): void {
    const bdA = this.get(a.env, a.time);
    const bdB = t > 0.001 ? this.get(b.env, b.time) : null;
    for (const bd of this.cache.values()) {
      bd.scroll(curveShift);
      if (bd !== bdA && bd !== bdB) bd.show(0, 0, jolt);
    }
    bdA.show(1, 0, jolt);
    if (bdB && bdB !== bdA) bdB.show(t, 0.5, jolt);
  }

  destroy(): void {
    this.cache.forEach((b) => b.destroy());
    this.cache.clear();
  }
}
