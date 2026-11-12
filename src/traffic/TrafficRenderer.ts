import Phaser from 'phaser';
import { RoadRenderer } from '../road/RoadRenderer';
import { RoadConfig } from '../road/RoadTypes';
import { TrafficCar } from './TrafficManager';
import { UNITS_PER_METRE } from './TrafficData';
import { TIME_TINT } from '../road/TimeTint';

/** One entry of traffic/traffic.json (the art's scale and anchor). */
export interface TrafficArtInfo {
  pxPerMetre: number;
  bottomCentre: { x: number; y: number };
  /** Sprite canvas size in art pixels (varies per vehicle). */
  size: { w: number; h: number };
}

/** Per-time-of-day tint applied to traffic sprites (multiplies the art). */
export const TRAFFIC_TINT = TIME_TINT;

/**
 * Draws traffic as scaled sprites standing on the projected road. Pooled: sprites are created once and
 * reassigned each frame. The art is a straight-on rear view (symmetric, so no flipping); sprites are hidden by
 * nearer hill crests and faded by fog.
 */
export class TrafficRenderer {
  private sprites: Phaser.GameObjects.Image[] = [];
  private tint = 0xffffff;

  constructor(
    scene: Phaser.Scene,
    private road: RoadRenderer,
    private cfg: RoadConfig,
    private art: Record<string, TrafficArtInfo>,
    poolSize: number,
    private baseDepth = 2,
  ) {
    for (let i = 0; i < poolSize; i++) {
      this.sprites.push(scene.add.image(0, 0, 'traffic_sedan_back').setVisible(false).setDepth(baseDepth));
    }
  }

  setTimeOfDay(t: string): void {
    this.tint = TRAFFIC_TINT[t] ?? 0xffffff;
  }

  /** Call after road.render() each frame. `jolt` is the road-rumble offset so cars shake with the road. */
  update(cars: TrafficCar[], cameraPosition: number, trackLength: number, jolt: number): void {
    let used = 0;
    for (const c of cars) {
      if (!c.active || used >= this.sprites.length) continue;
      const ahead = (((c.z - cameraPosition) % trackLength) + trackLength) % trackLength;
      if (ahead <= 0 || ahead > trackLength / 2) continue;
      const proj = this.road.projectSprite(cameraPosition, ahead, c.x);
      if (!proj) continue;
      const texture = c.texture ?? c.type.texture;
      const info = this.art[texture];
      if (!info) continue;

      // Screen pixels per metre / art pixels per metre.
      const pxPerMetre = ((proj.scale * this.cfg.width) / 2) * UNITS_PER_METRE;
      // Continuous scale: snapping it to 1/16 steps made far cars grow in visible jumps (25-33% at a time) as
      // you closed in, which looked like glitchy car movement.
      const k = pxPerMetre / info.pxPerMetre;
      if (k < 0.06) continue;

      const spr = this.sprites[used++];
      const { w: tw, h: th } = info.size;
      const gy = info.bottomCentre.y + 1;
      spr.setTexture(texture);
      spr.setOrigin((info.bottomCentre.x + 0.5) / tw, gy / th);
      spr.setScale(k);
      spr.setPosition(Math.round(proj.x), Math.round(proj.y) + jolt);
      spr.setAlpha(1 - 0.9 * proj.fog * proj.fog);
      spr.setTint(this.tint);
      spr.setDepth(this.baseDepth + 1 - proj.segmentsAhead / this.road.drawDistance);

      // Hide the part below a nearer hill crest.
      const visibleRows = gy + (proj.clipY - proj.y) / k;
      if (visibleRows >= th) spr.setCrop();
      else if (visibleRows <= 0) {
        spr.setVisible(false);
        continue;
      } else spr.setCrop(0, 0, tw, Math.ceil(visibleRows));
      spr.setVisible(true);
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
  }

  destroy(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites = [];
  }
}
