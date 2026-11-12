import Phaser from 'phaser';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../core/config';

/** How much weather to show: 0..1 each. */
export interface Weather {
  rain: number;
  fog: number;
}

/** The weather that goes with a time of day (only storms bring rain and thick haze for now). */
export function weatherForTime(time: string): Weather {
  return time === 'storm' ? { rain: 1, fog: 0.45 } : { rain: 0, fog: 0 };
}

export const lerpWeather = (a: Weather, b: Weather, t: number): Weather => ({
  rain: a.rain + (b.rain - a.rain) * t,
  fog: a.fog + (b.fog - a.fog) * t,
});

/** Texture keys the weather needs (loaded by PreloadScene). */
export const WEATHER_TEXTURES = { rain: 'fx_rain_overlay', splashes: 'fx_rain_splashes', fog: 'fx_fog_overlay', lightning: 'fx_lightning' } as const;

/**
 * Rain, fog banks and lightning drawn between the world and the cockpit (so they appear through the
 * windshield). Intensities ease in and out so weather changes gradually.
 */
export class WeatherRenderer {
  private rain: Phaser.GameObjects.Sprite;
  private splashes: Phaser.GameObjects.Sprite;
  private fogImg: Phaser.GameObjects.Image;
  private bolt: Phaser.GameObjects.Sprite;
  private flash: Phaser.GameObjects.Rectangle;
  private rainLevel = 0;
  private fogLevel = 0;
  private clock = 0;
  private nextStrike = 4;
  private boltTime = -1;
  private flashTime = 0;
  /** When true, skip the splash layer and lightning (cheaper on slow devices). */
  lite = false;

  /** Current eased intensities (read by the scene to thicken the road fog). */
  get level(): Weather {
    return { rain: this.rainLevel, fog: this.fogLevel };
  }

  constructor(scene: Phaser.Scene, horizonY: number) {
    // Depths: lightning 13, fog 14, rain 15, splashes 16, flash 17 (all below the cockpit at 20).
    this.bolt = scene.add.sprite(0, horizonY, WEATHER_TEXTURES.lightning, 0).setOrigin(0.5, 1).setDepth(13).setVisible(false);
    this.fogImg = scene.add.image(0, horizonY - 270, WEATHER_TEXTURES.fog).setOrigin(0, 0).setDepth(14).setAlpha(0);
    this.rain = scene.add.sprite(0, 0, WEATHER_TEXTURES.rain, 0).setOrigin(0, 0).setDepth(15).setAlpha(0);
    this.splashes = scene.add.sprite(0, 0, WEATHER_TEXTURES.splashes, 0).setOrigin(0, 0).setDepth(16).setAlpha(0);
    this.flash = scene.add.rectangle(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 0xffffff).setDepth(17).setAlpha(0);
  }

  /** `dim` (0..1) darkens rain at night; `target` is the weather to ease toward. */
  update(dt: number, target: Weather, dim = 1): void {
    this.clock += dt;
    const ease = Math.min(1, dt * 0.7);
    this.rainLevel += (target.rain - this.rainLevel) * ease;
    this.fogLevel += (target.fog - this.fogLevel) * ease;

    // Rain animation: the sheets are 8-frame loops (rain 16 fps, splashes 8 fps).
    this.rain.setFrame(Math.floor(this.clock * 16) % 8).setAlpha(this.rainLevel * 0.9 * dim);
    this.splashes.setFrame(Math.floor(this.clock * 8) % 8).setAlpha(this.lite ? 0 : this.rainLevel * 0.9 * dim);
    this.fogImg.setAlpha(this.fogLevel * 0.9);

    // Lightning during heavy rain: a bolt on the horizon plus a brief white flash.
    if (this.rainLevel > 0.5 && !this.lite) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 4 + Math.random() * 8;
        this.boltTime = 0;
        this.bolt.setX(120 + Math.random() * 720);
        this.flashTime = 0.12;
      }
    }
    if (this.boltTime >= 0) {
      this.boltTime += dt;
      const frame = Math.floor(this.boltTime * 12);
      if (frame > 3) {
        this.boltTime = -1;
        this.bolt.setVisible(false);
      } else {
        this.bolt.setFrame(frame).setVisible(true);
        if (frame === 2 && this.flashTime <= 0) this.flashTime = 0.1; // restrike flash
      }
    }
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.flash.setAlpha(this.flashTime > 0 ? 0.4 * (this.flashTime / 0.12) : 0);
  }

  destroy(): void {
    [this.rain, this.splashes, this.fogImg, this.bolt, this.flash].forEach((o) => o.destroy());
  }
}
