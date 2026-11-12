import { UNITS_PER_METRE } from '../traffic/TrafficData';
import Phaser from 'phaser';
import { CameraState, RoadConfig, RoadPalette, RoadPoint, RoadSegment } from './RoadTypes';
import { lerpColor } from './RoadPalettes';

/** Where a road-standing object appears on screen (see RoadRenderer.projectSprite). */
export interface SpriteProjection {
  x: number;
  /** Screen y of the ground contact point. */
  y: number;
  /** Projection scale: screen pixels per world unit = scale * width / 2. */
  scale: number;
  /** Anything below this screen y is hidden behind a hill crest. */
  clipY: number;
  fog: number;
  segmentsAhead: number;
}

/**
 * Segment-based pseudo-3D road renderer.
 * Projects road segments to the screen with perspective, draws back-to-front clipped
 * by the nearest hill crest, and supports curves, hills, shoulders, lane markings and barriers.
 * Draws into a Phaser Graphics object; the sky/horizon is a separate layer behind it.
 */
export class RoadRenderer {
  /** Distance from the camera to the projection plane. */
  private readonly cameraDepth: number;
  private palette: RoadPalette;
  private fogScale = 1;
  private drawDistanceOverride: number | null = null;
  /** Screen-space info for the segment under the camera, used by gameplay/HUD. */
  currentSegment!: RoadSegment;

  constructor(
    private readonly gfx: Phaser.GameObjects.Graphics,
    readonly segments: RoadSegment[],
    private readonly cfg: RoadConfig,
    palette: RoadPalette,
  ) {
    this.cameraDepth = 1 / Math.tan(((cfg.fieldOfView / 2) * Math.PI) / 180);
    this.palette = palette;
  }

  /** How many segments ahead are drawn (lowered automatically on slow devices). */
  get drawDistance(): number {
    return this.drawDistanceOverride ?? this.cfg.drawDistance;
  }

  setDrawDistance(n: number): void {
    this.drawDistanceOverride = Math.min(this.cfg.drawDistance, Math.max(60, Math.round(n)));
  }

  /** Multiplier on the configured fog density (storms thicken the haze). */
  setFogScale(scale: number): void {
    this.fogScale = scale;
  }

  setPalette(p: RoadPalette): void {
    this.palette = p;
  }

  /** Nearest camera distance at which a segment is drawn (the projection plane distance). */
  get nearPlane(): number {
    return this.cameraDepth;
  }

  get trackLength(): number {
    return this.segments.length * this.cfg.segmentLength;
  }

  findSegment(z: number): RoadSegment {
    const n = Math.floor(z / this.cfg.segmentLength) % this.segments.length;
    return this.segments[n < 0 ? n + this.segments.length : n];
  }

  /** Road height (world units) at distance z along the track. */
  heightAt(z: number): number {
    const seg = this.findSegment(z);
    const pct = (z % this.cfg.segmentLength) / this.cfg.segmentLength;
    return seg.p1.world.y + (seg.p2.world.y - seg.p1.world.y) * pct;
  }

  private project(p: RoadPoint, camX: number, camY: number, camZ: number): void {
    const { width, height, horizonY, roadWidth } = this.cfg;
    p.camera.x = p.world.x - camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = p.world.z - camZ;
    const scale = this.cameraDepth / p.camera.z;
    p.screen.scale = scale;
    p.screen.x = Math.round(width / 2 + (scale * p.camera.x * width) / 2);
    p.screen.y = Math.round(horizonY - (scale * p.camera.y * height) / 2);
    p.screen.w = Math.round((scale * roadWidth * width) / 2);
  }

  /** Filled quad between two scanlines, each given as a centre x and half-width. */
  private quad(x1: number, y1: number, w1: number, x2: number, y2: number, w2: number, color: number): void {
    const g = this.gfx;
    g.fillStyle(color, 1);
    g.fillTriangle(x1 - w1, y1, x2 - w2, y2, x2 + w2, y2);
    g.fillTriangle(x1 - w1, y1, x2 + w2, y2, x1 + w1, y1);
  }

  /**
   * Screen placement for something standing on the road `distance` world units ahead of the camera,
   * `xUnits` road-half-widths from the centre line. Uses the projection from the latest render() call.
   * Returns null when it is behind the camera or beyond the draw distance.
   */
  projectSprite(cameraPosition: number, distance: number, xUnits: number): SpriteProjection | null {
    const { segmentLength, roadWidth, width } = this.cfg;
    const drawDistance = this.drawDistance;
    if (distance <= 0 || !this.currentSegment) return null;
    const L = this.trackLength;
    const absZ = (((cameraPosition + distance) % L) + L) % L;
    const seg = this.segments[Math.floor(absZ / segmentLength)];
    const n = (seg.index - this.currentSegment.index + this.segments.length) % this.segments.length;
    if (n >= drawDistance || n < 1) return null;
    const pct = (absZ % segmentLength) / segmentLength;
    const a = seg.p1.screen, b = seg.p2.screen;
    const scale = a.scale + (b.scale - a.scale) * pct;
    return {
      x: a.x + (b.x - a.x) * pct + (scale * xUnits * roadWidth * width) / 2,
      y: a.y + (b.y - a.y) * pct,
      scale,
      clipY: seg.clip,
      fog: seg.fog,
      segmentsAhead: n,
    };
  }

  /** Car heading (road-half-widths per metre) as sideways world units per world unit forward. */
  private headingSlope(heading: number): number {
    return (heading * this.cfg.roadWidth) / UNITS_PER_METRE;
  }

  /** How far (screen pixels) a heading swings things at the horizon; the backdrop moves by this much. */
  yawPixels(heading: number): number {
    return (this.headingSlope(heading) * this.cameraDepth * this.cfg.width) / 2;
  }

  /** Reused each frame: the segments that are visible, nearest first. */
  private visibleBuf: RoadSegment[] = [];

  /**
   * Level of detail: far-away segments skip details that would be under a pixel wide (rumble strips, edge lines, lane
   * dashes). 1 is the default; larger values cull more (set by graphics quality) to save draw calls on slow devices.
   */
  lod = 1;

  render(cam: CameraState): void {
    const { width, height, horizonY, segmentLength, lanes, roadWidth, cameraHeight, fogDensity } = this.cfg;
    const drawDistance = this.drawDistance;
    const basePal = this.palette;
    const g = this.gfx;
    const trackLength = this.trackLength;

    const base = this.findSegment(cam.position);
    this.currentSegment = base;
    const basePercent = (cam.position % segmentLength) / segmentLength;
    const playerY = base.p1.world.y + (base.p2.world.y - base.p1.world.y) * basePercent;
    const camY = playerY + cameraHeight;
    const camX = cam.playerX * roadWidth;

    const pal = base.palette ?? basePal; // colours at the camera (the ground fill and horizon haze)
    g.clear();
    // Ground fill below the horizon (covers anything not reached by segments).
    g.fillStyle(lerpColor(pal.grass[0], pal.fog, 0.8), 1);
    g.fillRect(0, horizonY, width, height - horizonY);

    let x = 0;
    // The camera looks where the car points: a heading off the road's direction swings the whole road sideways.
    let dx = -(base.curve * basePercent) - this.headingSlope(cam.heading ?? 0) * segmentLength;
    let maxY = height;

    // Project nearest -> farthest, accumulating curve offsets. Visible segments go into a reused buffer (no per-frame garbage).
    const visible = this.visibleBuf;
    let visibleCount = 0;
    for (let n = 0; n < drawDistance; n++) {
      const seg = this.segments[(base.index + n) % this.segments.length];
      seg.looped = seg.index < base.index;
      seg.fog = 1 - 1 / Math.exp((n / drawDistance) * (n / drawDistance) * fogDensity * this.fogScale);

      this.project(seg.p1, camX - x, camY, cam.position - (seg.looped ? trackLength : 0));
      this.project(seg.p2, camX - x - dx, camY, cam.position - (seg.looped ? trackLength : 0));
      x += dx;
      dx += seg.curve;

      seg.clip = maxY;
      // Behind the camera, back-facing, or hidden behind a nearer hill crest.
      if (seg.p1.camera.z <= this.cameraDepth || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxY) continue;
      visible[visibleCount++] = seg;
      maxY = seg.p2.screen.y;
    }

    // Draw far -> near so nearer segments overlap farther ones.
    for (let i = visibleCount - 1; i >= 0; i--) {
      const seg = visible[i];
      const p1 = seg.p1.screen;
      const p2 = seg.p2.screen;
      const fog = seg.fog;
      const b = seg.band;
      const pal = seg.palette ?? basePal; // per-segment colours blend across environment boundaries
      const pf = pal.fog;

      // Ground band spanning the full screen width.
      g.fillStyle(lerpColor(pal.grass[b], pf, fog), 1);
      g.fillRect(0, p2.y, width, Math.max(1, p1.y - p2.y));
      // Optional different ground on the left (the sea): from the screen edge to a shore line that follows the road.
      if (pal.groundLeft) {
        const s1 = Math.max(0, Math.min(width, p1.x - p1.w * 2.2));
        const s2 = Math.max(0, Math.min(width, p2.x - p2.w * 2.2));
        if (s1 > 0 || s2 > 0) {
          g.fillStyle(lerpColor(pal.groundLeft[b], pf, fog), 1);
          g.fillTriangle(0, p1.y, s1, p1.y, s2, p2.y);
          g.fillTriangle(0, p1.y, s2, p2.y, 0, p2.y);
        }
      }

      const rumble1 = p1.w / Math.max(6, 2 * lanes);
      const rumble2 = p2.w / Math.max(6, 2 * lanes);
      const shoulder1 = p1.w * 0.45;
      const shoulder2 = p2.w * 0.45;

      // Painter's algorithm: one wide shoulder quad, a narrower rumble quad on top, then the road on top of both.
      // (Same picture as separate left/right strips, with 3 quads instead of 5.)
      const lod = this.lod;
      this.quad(p1.x, p1.y, p1.w + rumble1 + shoulder1, p2.x, p2.y, p2.w + rumble2 + shoulder2, lerpColor(pal.shoulder[b], pf, fog));
      if (p1.w >= 6 * lod) this.quad(p1.x, p1.y, p1.w + rumble1, p2.x, p2.y, p2.w + rumble2, lerpColor(pal.rumble[b], pf, fog));
      this.quad(p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, lerpColor(pal.road[b], pf, fog));

      // Solid edge lines.
      const edge1 = p1.w - Math.max(1, p1.w / 40);
      const edge2 = p2.w - Math.max(1, p2.w / 40);
      const ew1 = Math.max(1, p1.w / 60);
      const ew2 = Math.max(1, p2.w / 60);
      if (p1.w >= 10 * lod) {
        this.quad(p1.x - edge1, p1.y, ew1, p2.x - edge2, p2.y, ew2, lerpColor(pal.edgeLine, pf, fog));
        this.quad(p1.x + edge1, p1.y, ew1, p2.x + edge2, p2.y, ew2, lerpColor(pal.edgeLine, pf, fog));
      }

      // Dashed lane dividers on light bands only.
      if (b === 0 && p1.w >= 14 * lod) {
        const lm1 = Math.max(1, p1.w / Math.max(10, 8 * lanes));
        const lm2 = Math.max(1, p2.w / Math.max(10, 8 * lanes));
        const lw1 = (p1.w * 2) / lanes;
        const lw2 = (p2.w * 2) / lanes;
        let lx1 = p1.x - p1.w + lw1;
        let lx2 = p2.x - p2.w + lw2;
        for (let lane = 1; lane < lanes; lane++, lx1 += lw1, lx2 += lw2) this.quad(lx1, p1.y, lm1 / 2, lx2, p2.y, lm2 / 2, lerpColor(pal.lane, pf, fog));
      }

      // Roadside barriers (guardrail) beyond the shoulder.
      if (seg.barrier) {
        const bx1 = p1.w + rumble1 + shoulder1;
        const bx2 = p2.w + rumble2 + shoulder2;
        const rail = 260; // world-unit height of the rail
        const h1 = (seg.p1.screen.scale * rail * height) / 2;
        const h2 = (seg.p2.screen.scale * rail * height) / 2;
        const col = lerpColor(pal.barrier[b], pf, fog);
        const top = lerpColor(pal.barrierTop, pf, fog);
        for (let si = 0; si < (seg.barrierSide === 0 ? 2 : 1); si++) {
          const side = seg.barrierSide === 0 ? (si === 0 ? -1 : 1) : seg.barrierSide;
          const ax1 = p1.x + side * bx1;
          const ax2 = p2.x + side * bx2;
          const half1 = Math.max(1, p1.w / 30);
          // Rail face: a band between 40% and 90% of the rail height (sloped quad, near edge -> far edge).
          g.fillStyle(col, 1);
          g.fillTriangle(ax1, p1.y - h1 * 0.4, ax1, p1.y - h1 * 0.9, ax2, p2.y - h2 * 0.9);
          g.fillTriangle(ax1, p1.y - h1 * 0.4, ax2, p2.y - h2 * 0.9, ax2, p2.y - h2 * 0.4);
          // Post at the near end and a bright top edge.
          g.fillStyle(top, 1);
          g.fillTriangle(ax1, p1.y - h1 * 0.9, ax1, p1.y - h1 * 0.95, ax2, p2.y - h2 * 0.95);
          g.fillTriangle(ax1, p1.y - h1 * 0.9, ax2, p2.y - h2 * 0.95, ax2, p2.y - h2 * 0.9);
          if (b === 0) g.fillRect(ax1 - half1 / 2, p1.y - h1 * 0.95, Math.max(1, half1 / 2), h1 * 0.95);        }
      }
    }
  }
}
