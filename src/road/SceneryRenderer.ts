import Phaser from 'phaser';
import { UNITS_PER_METRE } from '../traffic/TrafficData';
import { RoadRenderer } from './RoadRenderer';
import { RoadConfig } from './RoadTypes';
import { SceneryArt } from './environments/EnvironmentTypes';
import { TIME_TINT } from './TimeTint';
import { scale2xRows } from './PixelUpscale';

/**
 * Smoothed versions of scenery art (EPX upscaled), keyed `<texture>@2x` and `<texture>@4x`. The version is chosen so that one
 * art pixel covers roughly one screen pixel: plain art up to 1.3 screen px per art pixel, the 2x version up to 2.6, the 4x above.
 * (Plain art scaled by 1.75 would alternate 1 and 2 px wide pixels; scaled by 4 it is a field of big squares.)
 */
export const HD_SUFFIX = '@4x';
const HD2_FROM_K = 1.3;
const HD4_FROM_K = 2.6;
const HD_FACTOR = 4;
/** Source pixels scaled per slice of the incremental builder (checked against the time budget between slices). */
const HD_SLICE_PIXELS = 12000;

/** One smoothed-texture build in progress. */
interface HdJob {
  key: string;
  w: number;
  h: number;
  src: Uint32Array;
  up2: Uint32Array;
  up4: Uint32Array;
  stage: 0 | 1 | 2 | 3;
  row: number;
}
/** Art denser than this (signs at 64 px/m) never gets big enough to need it. */
const HD_MAX_DENSITY = 32;

/** Folder holding a scenery texture (road furniture and signs live in roads/, the rest in scenery/). */
export function sceneryTexturePath(key: string): string {
  const folder = key.startsWith('road_') || key.startsWith('sign_') ? 'roads' : 'scenery';
  return `assets/${folder}/${key}.png`;
}

/**
 * Draws roadside scenery as pooled sprites standing on the projected road. Nearest objects are placed first
 * (so a full pool drops the farthest), scaled by real metres, hidden below hill crests and faded by fog.
 */
export class SceneryRenderer {
  private sprites: Phaser.GameObjects.Image[] = [];
  private tint = 0xffffff;
  /** Most sprites drawn per frame (lowered on slow devices). */
  poolLimit = Infinity;
  /** Number of sprites drawn on the last frame (for debug output and tests). */
  drawn = 0;
  /** Use smoothed 4x art for close objects (set by graphics quality). */
  hd = true;
  /** Textures whose smoothed versions exist (both 2x and 4x). */
  private hdReady = new Set<string>();
  private hdQueue: string[] = [];
  private hdQueued = new Set<string>();

  constructor(
    private scene: Phaser.Scene,
    private road: RoadRenderer,
    private cfg: RoadConfig,
    private art: Record<string, SceneryArt>,
    poolSize = 260,
    private baseDepth = 2,
  ) {
    const any = Object.keys(art)[0];
    for (let i = 0; i < poolSize; i++) this.sprites.push(scene.add.image(0, 0, any).setVisible(false).setDepth(baseDepth));
  }

  setTimeOfDay(t: string): void {
    this.tint = TIME_TINT[t] ?? 0xffffff;
  }

  /**
   * Queues the smoothed 4x versions of these textures to be built, one per frame (so there is no single long hitch).
   * Objects switch to them as soon as they are ready; until then, or when far away, the plain art is used.
   */
  prepareHd(keys: string[]): void {
    for (const key of keys) {
      const art = this.art[key];
      if (!art || art.pxPerMetre >= HD_MAX_DENSITY || art.w * HD_FACTOR > 4096 || art.h * HD_FACTOR > 4096) continue;
      if (this.hdReady.has(key) || this.hdQueued.has(key)) continue;
      if (this.scene.textures.exists(key + HD_SUFFIX) && this.scene.textures.exists(key + '@2x')) {
        this.hdReady.add(key);
        continue;
      }
      this.hdQueued.add(key);
      this.hdQueue.push(key);
    }
  }

  /** The texture currently being built (it is processed a slice per frame). */
  private job: HdJob | null = null;

  /** Reads a queued texture's pixels and starts its job. */
  private startJob(key: string): HdJob | null {
    const tm = this.scene.textures;
    if (!tm.exists(key) || typeof document === 'undefined') return null;
    const img = tm.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const src = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer);
    return { key, w, h, src, up2: new Uint32Array(w * h * 4), up4: new Uint32Array(w * h * 16), stage: 0, row: 0 };
  }

  /** Adds a texture made from packed pixels. */
  private addPixels(key: string, px: Uint32Array, w: number, h: number): void {
    const tm = this.scene.textures;
    if (tm.exists(key)) return;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d')!;
    const od = octx.createImageData(w, h);
    new Uint32Array(od.data.buffer).set(px);
    octx.putImageData(od, 0, 0);
    tm.addCanvas(key, out);
  }

  /**
   * Advances the smoothed-texture builder by about `budgetMs`. A texture takes four steps (scale to 2x, add it, scale to 4x,
   * add it); the scaling is done in slices and each texture upload gets a frame of its own, so no frame has a long hitch.
   */
  private stepHd(budgetMs = 4): void {
    const t0 = performance.now();
    do {
      if (!this.job) {
        const key = this.hdQueue.shift();
        if (!key) return;
        this.job = this.startJob(key);
        if (!this.job) continue;
      }
      const j = this.job;
      if (j.stage === 0) {
        j.row = scale2xRows(j.src, j.w, j.h, j.up2, j.row, Math.min(j.h, j.row + Math.max(1, Math.floor(HD_SLICE_PIXELS / j.w))));
        if (j.row >= j.h) { j.stage = 1; j.row = 0; }
      } else if (j.stage === 1) {
        this.addPixels(j.key + '@2x', j.up2, j.w * 2, j.h * 2);
        j.stage = 2;
        return; // the upload gets its own frame
      } else if (j.stage === 2) {
        const w2 = j.w * 2, h2 = j.h * 2;
        j.row = scale2xRows(j.up2, w2, h2, j.up4, j.row, Math.min(h2, j.row + Math.max(1, Math.floor(HD_SLICE_PIXELS / w2))));
        if (j.row >= h2) j.stage = 3;
      } else {
        this.addPixels(j.key + HD_SUFFIX, j.up4, j.w * 4, j.h * 4);
        this.hdReady.add(j.key);
        this.job = null;
        return;
      }
    } while (performance.now() - t0 < budgetMs);
  }

  /** Call after road.render(). */
  update(jolt: number): void {
    if (this.hd) this.stepHd();
    const { width, roadWidth } = this.cfg;
    const drawDistance = this.road.drawDistance;
    const segs = this.road.segments;
    const base = this.road.currentSegment.index;
    const near = this.road.nearPlane;
    let used = 0;

    const limit = Math.min(this.poolLimit, this.sprites.length);
    for (let n = 1; n < drawDistance && used < limit; n++) {
      const seg = segs[(base + n) % segs.length];
      if (seg.scenery.length === 0 || seg.p1.camera.z <= near) continue;
      const p = seg.p1.screen;
      const pxPerMetre = ((p.scale * width) / 2) * UNITS_PER_METRE;
      for (const item of seg.scenery) {
        if (used >= limit) break;
        const art = this.art[item.texture];
        if (!art) continue;
        const k = Math.round(((pxPerMetre / art.pxPerMetre) * item.scale) * 16) / 16;
        if (k < 0.06) continue;
        const x = p.x + (p.scale * item.x * roadWidth * width) / 2;
        const half = (art.w * k) / 2;
        if (x + half < 0 || x - half > width) continue;

        const rows = art.h + (seg.clip - p.y) / k; // art rows above the hill-crest clip line
        if (rows <= 0) continue;
        const spr = this.sprites[used++];
        // Close objects use the smoothed 4x texture (drawn at a quarter of the scale), so their pixels are not huge squares.
        const f = this.hd && k >= HD2_FROM_K && this.hdReady.has(item.texture) ? (k >= HD4_FROM_K ? HD_FACTOR : 2) : 1;
        spr.setTexture(f === 4 ? item.texture + HD_SUFFIX : f === 2 ? item.texture + '@2x' : item.texture);
        spr.setOrigin(0.5, 1);
        spr.setScale(k / f);
        spr.setPosition(Math.round(x), Math.round(p.y) + jolt);
        // Objects that get very close dissolve rather than looming as huge blocky pixels.
        const close = k > 4 && item.texture !== 'road_bridge' ? Math.max(0, 1 - (k - 4) / 2) : 1; // overpasses stay solid as you pass under
        spr.setAlpha((1 - 0.9 * seg.fog * seg.fog) * close);
        spr.setTint(this.tint);
        spr.setDepth(this.baseDepth + 1 - n / drawDistance);
        if (rows >= art.h) spr.setCrop();
        else spr.setCrop(0, 0, art.w * f, Math.ceil(rows * f));
        spr.setVisible(true);
      }
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
    this.drawn = used;
  }

  destroy(): void {
    this.sprites.forEach((s) => s.destroy());
    this.sprites = [];
  }
}
