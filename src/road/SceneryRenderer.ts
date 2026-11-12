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
const NO_RAIL: number[] = [];
/** Objects further than this many segments ahead are not clipped by rails (see update). */
const RAIL_CLIP_SEGMENTS = 60;
const RAIL_CLIP_FADE = 20;

/**
 * Highest point (smallest screen y) of the rail in front of a sprite standing at segment `n` (counted from the
 * camera), within its screen span [l, r]. The rail is a continuous line between neighbouring segments (not separate
 * points), so the cut-off slides smoothly as the road moves. "In front" is decided by segment order, not screen
 * rows, so it does not flicker when far segments round to the same pixel row. Infinity when no rail is in front.
 * `baseY` is the object's ground line on screen.
 */
function railClip(rail: number[], l: number, r: number, n: number, baseY: number): number {
  let best = Infinity;
  for (let i = 0; i < rail.length; i += 4) {
    const na = rail[i + 3];
    if (na >= n) break; // near to far: the rest is level with or behind the sprite
    const xa = rail[i], ta = rail[i + 1];
    // Rail standing higher up the screen than the object's base is on a hill crest in front: the crest already
    // hides the object (hill clip), and counting the rail there too made the cut flick as the crest moved.
    if (rail[i + 2] < baseY - 0.5) continue;
    const linked = i + 4 < rail.length && rail[i + 7] === na + 1 && rail[i + 6] >= baseY - 0.5;
    if (!linked) {
      if (xa >= l && xa <= r && ta < best) best = ta;
      continue;
    }
    const xb = rail[i + 4], tb = rail[i + 5];
    const lo = Math.max(l, Math.min(xa, xb));
    const hi = Math.min(r, Math.max(xa, xb));
    if (lo > hi) continue;
    const dx = xb - xa;
    if (Math.abs(dx) < 1e-6) best = Math.min(best, ta, tb);
    else best = Math.min(best, ta + ((tb - ta) * (lo - xa)) / dx, ta + ((tb - ta) * (hi - xa)) / dx);
  }
  return best;
}

export class SceneryRenderer {
  private sprites: Phaser.GameObjects.Image[] = [];
  /** Reused per frame: [x, top, groundY, n, ...] of the rails on each side, near to far (no per-frame garbage). */
  private railL: number[] = [];
  private railR: number[] = [];
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
    // Guardrail/fence points of this and nearer segments, per side: an object behind a rail has its lower part
    // hidden where the rail passes in front of it (sprites are always drawn over the road, so without this
    // grass, rocks and signs standing behind a rail were painted on top of it).
    const railL = this.railL, railR = this.railR;
    railL.length = railR.length = 0;
    for (let n = 1; n < drawDistance && used < limit; n++) {
      const seg = segs[(base + n) % segs.length];
      const rl = this.road.edgeRail(seg, -1);
      if (rl) railL.push(rl.x, rl.top, seg.p1.screen.y, n);
      const rr = this.road.edgeRail(seg, 1);
      if (rr) railR.push(rr.x, rr.top, seg.p1.screen.y, n);
      if (seg.scenery.length === 0 || seg.p1.camera.z <= near) continue;
      const p = seg.p1.screen;
      const pxPerMetre = ((p.scale * width) / 2) * UNITS_PER_METRE;
      for (const item of seg.scenery) {
        if (used >= limit) break;
        const art = this.art[item.texture];
        if (!art) continue;
        const k = (pxPerMetre / art.pxPerMetre) * item.scale; // continuous: snapped steps made objects grow in jumps
        if (k < 0.06) continue;
        const x = p.x + (p.scale * item.x * roadWidth * width) / 2;
        const half = (art.w * k) / 2;
        if (x + half < 0 || x - half > width) continue;

        // Hidden below the nearest hill crest, and below any nearer rail top passing in front of it.
        let clipY = seg.clip;
        const rail = item.x < -1.2 ? railL : item.x > 1.2 ? railR : NO_RAIL; // overpasses span the road: never clipped
        // Near the horizon the rail is only a few pixels tall and screen rows round off, so clipping there flickered
        // more than it helped: only objects within RAIL_CLIP_SEGMENTS are cut by rails in front of them.
        // The cut fades in over RAIL_CLIP_FADE segments so an object does not pop as it comes into range.
        if (rail.length && n < RAIL_CLIP_SEGMENTS) {
          const ry = railClip(rail, x - half * 0.8, x + half * 0.8, n, p.y);
          if (ry < p.y) clipY = Math.min(clipY, p.y - (p.y - ry) * Math.min(1, (RAIL_CLIP_SEGMENTS - n) / RAIL_CLIP_FADE));
        }
        const rows = art.h + (clipY - p.y) / k; // art rows above the clip line
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
        // Crop to the exact line (not whole art rows): rounding up to rows made the cut-off flick one row up and
        // down as the road moved, which showed as a shimmer along rails and hill crests.
        else spr.setCrop(0, 0, art.w * f, rows * f);
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
