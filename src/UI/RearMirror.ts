import Phaser from 'phaser';
import { lerpColor } from '../road/RoadPalettes';
import { RoadPalette } from '../road/RoadTypes';

type Pt = { x: number; y: number };

/** Sutherland-Hodgman clip of a polygon to an axis-aligned rectangle. */
function clipToRect(poly: Pt[], r: { x: number; y: number; w: number; h: number }): Pt[] {
  const edges: Array<[(p: Pt) => boolean, (a: Pt, b: Pt) => Pt]> = [
    [(p) => p.x >= r.x, (a, b) => ({ x: r.x, y: a.y + ((b.y - a.y) * (r.x - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= r.x + r.w, (a, b) => ({ x: r.x + r.w, y: a.y + ((b.y - a.y) * (r.x + r.w - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= r.y, (a, b) => ({ y: r.y, x: a.x + ((b.x - a.x) * (r.y - a.y)) / (b.y - a.y) })],
    [(p) => p.y <= r.y + r.h, (a, b) => ({ y: r.y + r.h, x: a.x + ((b.x - a.x) * (r.y + r.h - a.y)) / (b.y - a.y) })],
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (out.length === 0) break;
  }
  return out;
}

export interface MirrorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A vehicle behind the player, for the mirror (police pursuit / overtaking traffic in later milestones). */
export interface RearCar {
  /** Distance behind the player in world units (0 = alongside). */
  distance: number;
  /** Lateral position, -1..1 across the road. */
  x: number;
  color: number;
  /** Front-view texture of the vehicle (what you really see in a mirror) and its real width; omitted = plain box. */
  texture?: string;
  widthM?: number;
  /** Optional flashing red/blue bar (police). */
  lights?: boolean;
}

export interface MirrorState {
  /** Distance travelled along the track (drives the receding lane dashes). */
  position: number;
  /** Player lateral position, -1..1. */
  playerX: number;
  /** Curvature of the road just behind the car (mirrored for the reflection). */
  curveBehind: number;
  palette: RoadPalette;
  skyTop: number;
  time: number;
  cars: RearCar[];
}

/**
 * Live rear-view image drawn behind the (transparent) mirror glass of the cockpit:
 * sky, ground, a receding road with lane dashes, and any cars behind the player.
 */
export class RearMirror {
  private gfx: Phaser.GameObjects.Graphics;
  private sprites: Phaser.GameObjects.Image[] = [];
  private meta: Record<string, { bounds: { w: number } }>;

  /** Filled rectangle clipped to the mirror glass so nothing can spill onto the windshield. */
  private box(x: number, y: number, w: number, h: number, color: number): void {
    const r = this.rect;
    const x0 = Math.max(x, r.x), y0 = Math.max(y, r.y), x1 = Math.min(x + w, r.x + r.w), y1 = Math.min(y + h, r.y + r.h);
    if (x1 > x0 && y1 > y0) this.gfx.fillStyle(color, 1).fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /** Filled triangle clipped to the mirror glass. */
  private tri(color: number, alpha: number, a: Pt, b: Pt, c: Pt): void {
    const poly = clipToRect([a, b, c], this.rect);
    if (poly.length < 3) return;
    this.gfx.fillStyle(color, alpha);
    for (let i = 1; i < poly.length - 1; i++) this.gfx.fillTriangle(poly[0].x, poly[0].y, poly[i].x, poly[i].y, poly[i + 1].x, poly[i + 1].y);
  }

  constructor(scene: Phaser.Scene, private rect: MirrorRect, depth: number) {
    this.gfx = scene.add.graphics().setDepth(depth);
    this.meta = (scene.cache.json.get('traffic_meta') ?? {}) as Record<string, { bounds: { w: number } }>;
    for (let i = 0; i < 8; i++) this.sprites.push(scene.add.image(0, 0, '__DEFAULT').setVisible(false).setDepth(depth + 0.5));
  }

  update(s: MirrorState): void {
    const { x, y, w, h } = this.rect;
    const g = this.gfx;
    const pal = s.palette;
    g.clear();
    this.sprites.forEach((sp) => sp.setVisible(false));
    let used = 0;

    this.time = s.time * 1000;
    const horizon = y + Math.round(h * 0.42);
    const bottom = y + h;
    const H = bottom - horizon;
    const vx = x + w / 2 - s.curveBehind * 7;
    const roadHalf = w * 0.7; // half road width at the near plane (z = 1)
    const shift = -s.playerX * roadHalf * 0.55; // road slides opposite to the car's offset

    // Sky (two bands) and ground.
    const skyA = Math.round((horizon - y) * 0.6);
    this.box(x, y, w, skyA, s.skyTop);
    this.box(x, y + skyA, w, horizon - y - skyA, lerpColor(s.skyTop, pal.fog, 0.6));
    this.box(x, horizon, w, H, lerpColor(pal.grass[0], pal.fog, 0.25));

    const screenX = (xr: number, z: number) => Math.round(vx + (shift + xr * roadHalf) / z);
    const screenY = (z: number) => Math.round(horizon + H / z);
    const fog = (z: number) => Math.min(0.85, (z - 1) / 14);

    // Road as horizontal slices (keeps hard pixel edges and allows fog banding).
    const rows = 22;
    for (let i = rows - 1; i >= 0; i--) {
      const z0 = 1 + Math.pow(i / rows, 1.9) * 14;
      const z1 = 1 + Math.pow((i + 1) / rows, 1.9) * 14;
      const ya = screenY(z1), yb = screenY(z0);
      if (yb <= ya) continue;
      const band = Math.floor((s.position / 700 + i) % 2 + 2) % 2 === 0 ? 0 : 1;
      const f = fog(z0);
      const half = roadHalf / z0;
      const cx = vx + shift / z0;
      // paved shoulder + road
      this.box(Math.round(cx - half * 1.3), ya, Math.round(half * 2.6), yb - ya, lerpColor(pal.shoulder[band], pal.fog, f));
      this.box(Math.round(cx - half * 1.08), ya, Math.round(half * 2.16), yb - ya, lerpColor(pal.rumble[band], pal.fog, f));
      this.box(Math.round(cx - half), ya, Math.round(half * 2), yb - ya, lerpColor(pal.road[band], pal.fog, f));
    }
    // Edge lines and lane dashes.
    const stride = 900;
    const phase = (s.position % stride) / stride; // 0..1, grows as the car moves forward -> dashes recede
    for (let k = 0; k < 9; k++) {
      const za = 1 + Math.pow((k + phase) / 9, 1.6) * 14;
      const zb = 1 + Math.pow((k + phase + 0.45) / 9, 1.6) * 14;
      const ya = screenY(zb), yb = screenY(za);
      if (yb <= ya || yb > bottom) continue;
      const f = fog(za);
      for (const lane of [-1 / 3, 1 / 3]) {
        const xa = screenX(lane, za), xb = screenX(lane, zb);
        const col = lerpColor(pal.lane, pal.fog, f);
        this.tri(col, 1, { x: xa - 1, y: yb }, { x: xb - 1, y: ya }, { x: xb + 1, y: ya });
        this.tri(col, 1, { x: xa - 1, y: yb }, { x: xb + 1, y: ya }, { x: xa + 1, y: yb });
      }
    }
    for (const side of [-1, 1]) {
      const za = 1, zb = 15;
      this.tri(pal.edgeLine, 0.8, { x: screenX(side * 0.97, za) - 1, y: screenY(za) }, { x: screenX(side * 0.97, zb), y: screenY(zb) }, { x: screenX(side * 0.97, za) + 1, y: screenY(za) });
    }

    // Cars behind: far to near so near ones overlap.
    const cars = [...s.cars].sort((a, b) => b.distance - a.distance);
    for (const car of cars) {
      const z = 1 + Math.max(0, car.distance) / 450;
      if (z > 15) continue;
      const cx = screenX(car.x * 0.66, z);
      const base = screenY(z);
      const cw = Math.round((roadHalf * 0.3) / z);
      const ch = Math.round(cw * 0.62);
      const f = fog(z);
      const sp = car.texture && car.widthM && used < this.sprites.length && this.sprites[used].scene.textures.exists(car.texture) ? this.sprites[used] : null;
      if (sp) {
        used++;
        // The art is a three-quarter front view with the body running back to the right, which is how a car behind
        // and to your left looks. On the right of the mirror the body must run back to the left (toward the road's
        // vanishing point), so flip it there.
        this.placeCar(sp, car, cx, base, roadHalf / z, f, cx > vx);
        continue;
      }
      this.box(cx - cw, base - ch, cw * 2, ch, lerpColor(car.color, pal.fog, f));
      this.box(cx - Math.round(cw * 0.7), base - ch - Math.round(ch * 0.45), Math.round(cw * 1.4), Math.round(ch * 0.5), lerpColor(0x141418, pal.fog, f));
      const lamp = Math.max(1, Math.round(cw * 0.22));
      this.box(cx - cw + 1, base - Math.round(ch * 0.5), lamp, lamp, 0xfff2b0);
      this.box(cx + cw - lamp - 1, base - Math.round(ch * 0.5), lamp, lamp, 0xfff2b0);
      if (car.lights) {
        const red = Math.floor(s.time * 6) % 2 === 0;
        this.box(cx - Math.round(cw * 0.6), base - ch - Math.round(ch * 0.55), Math.round(cw * 1.2), Math.max(1, Math.round(ch * 0.15)), red ? 0xff2a2a : 0x2a60ff);
      }
    }
  }

  /** Draws a real front-view sprite for a vehicle, sized by its real width and cropped to the mirror glass. */
  private placeCar(sp: Phaser.GameObjects.Image, car: RearCar, cx: number, base: number, roadHalfPx: number, f: number, flip: boolean): void {
    sp.setTexture(flip ? this.mirrored(car.texture!) : car.texture!);
    const tw = sp.width, th = sp.height;
    const artW = this.meta[car.texture!]?.bounds.w ?? tw;
    const k = (car.widthM! * roadHalfPx * 0.2) / artW;
    const r = this.rect;
    // Crop (in texture pixels) to the part that lies inside the mirror rectangle.
    const left = cx - (tw / 2) * k, top = base - th * k;
    const x0 = Math.max(left, r.x), x1 = Math.min(left + tw * k, r.x + r.w);
    const y0 = Math.max(top, r.y), y1 = Math.min(base, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) return;
    // Phaser draws a cropped image where the uncropped one would be, so position the whole image and crop it.
    sp.setOrigin(0, 0).setScale(k).setPosition(left, top).setAlpha(1 - 0.7 * f).setVisible(true);
    sp.setCrop((x0 - left) / k, (y0 - top) / k, (x1 - x0) / k, (y1 - y0) / k);
    if (car.lights) {
      const red = Math.floor(this.time / 160) % 2 === 0;
      sp.setTint(red ? 0xffb0b0 : 0xb0c4ff);
    } else sp.clearTint();
  }

  private time = 0;

  /**
   * A left-right mirrored copy of a texture, made once on first use. (Phaser's flipX combined with the crop used to
   * keep cars inside the mirror glass made cropped, flipped cars vanish, so the flip is baked into a texture.)
   */
  private mirrored(key: string): string {
    const out = key + '_mirrored';
    const tm = this.gfx.scene.textures;
    if (tm.exists(out)) return out;
    const src = tm.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    tm.addCanvas(out, c);
    return out;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
