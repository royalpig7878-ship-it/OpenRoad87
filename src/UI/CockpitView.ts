import Phaser from 'phaser';
import { BRAKE_FADE, DrivingState, REFERENCE_SPEED_KPH } from '../systems/DrivingModel';
import { VehicleSpec } from '../vehicles/VehicleSpec';
import { RoadPalette } from '../road/RoadTypes';
import { SWEEP, fuelAngle, rpmAngle, smooth, speedoAngle, tempAngle, warningStates, wheelDegrees } from './gaugeMath';
import { RearCar, RearMirror } from './RearMirror';
import { VIRTUAL_WIDTH } from '../core/config';

interface GaugePlacement {
  kind: string;
  sprite: string;
  x: number;
  y: number;
  radius: number;
}
/** Where one car's steering wheel goes (every car has its own wheel design and size). */
interface WheelPlacement {
  x: number;
  y: number;
  spokes: { x: number; y: number; frameWidth: number; frameHeight: number; degrees: number[] };
  /** The marker dot rides the rim: a (super)ellipse with radii rx, ry and exponent n (2 = ellipse, higher = squarer). */
  marker: { rx: number; ry: number; cx: number; cy: number; n?: number };
}
interface CockpitPlacement {
  markerColor: string;
  thick: number;
  gauges: GaugePlacement[];
  wheel?: WheelPlacement;
}
interface Placements {
  wheel: WheelPlacement;
  mirror: { x: number; y: number; w: number; h: number; glint: string };
  gauge_sweep_degrees: Record<string, [number, number]>;
  cockpits: Record<string, CockpitPlacement>;
}

type NeedleKind = 'rpm' | 'speedo' | 'fuel' | 'temp' | 'oil' | 'volts' | 'boost' | 'hour' | 'minute';

interface Needle {
  kind: NeedleKind;
  img: Phaser.GameObjects.Image;
  angle: number;
}

/** Warning lamp strip position (centre) and cell size, in 960x540 space. */
const WARN = { x: 483, y: 500, cellW: 22, cellH: 16 };
/** Gear indicator strip sits on the dash top, between the defrost vents. */
const GEAR = { x: 481, y: 316 };

/** Shared texture keys and per-vehicle key helpers. */
export const COCKPIT_TEXTURES = {
  placements: 'cockpit_placements',
  dash: (spec: VehicleSpec) => `${spec.cockpitAsset}_dash`,
  rim: (spec: VehicleSpec) => `steering_wheel_${spec.id}_rim`,
  spokes: (spec: VehicleSpec) => `steering_wheel_${spec.id}_spokes`,
  needle: 'gauge_needle',
  warnings: 'dashboard_warnings',
  gear: 'gear_indicator',
  glint: 'mirror_glint',
} as const;

/** Skyline colour at the top of the rear-view mirror for each time of day. */
export const SKY_TOP: Record<string, number> = { day: 0x3a76d0, sunset: 0x6a3a78, night: 0x050818, storm: 0x3a4048 };

/** Loads the shared cockpit pieces (call from PreloadScene.preload). */
export function loadSharedCockpitAssets(load: Phaser.Loader.LoaderPlugin): void {
  load.json(COCKPIT_TEXTURES.placements, 'assets/cockpits/placements.json');
  load.image(COCKPIT_TEXTURES.needle, 'assets/cockpits/gauge_needle.png');
  load.image(COCKPIT_TEXTURES.gear, 'assets/cockpits/gear_indicator.png');
  load.image(COCKPIT_TEXTURES.glint, 'assets/cockpits/mirror_glint.png');
  load.spritesheet(COCKPIT_TEXTURES.warnings, 'assets/cockpits/dashboard_warnings.png', { frameWidth: 22, frameHeight: 16 });
}

/**
 * Makes sure the textures for one vehicle's cockpit are loaded (dash, wheel rim, spoke frames, gauge faces).
 * Cockpit art is large, so only the vehicles actually driven are loaded.
 */
export function ensureCockpitAssets(scene: Phaser.Scene, spec: VehicleSpec): Promise<void> {
  const p = scene.cache.json.get(COCKPIT_TEXTURES.placements) as Placements;
  const missing: string[] = [];
  const img = (key: string) => {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `assets/cockpits/${key}.png`);
      missing.push(key);
    }
  };
  img(COCKPIT_TEXTURES.dash(spec));
  img(COCKPIT_TEXTURES.rim(spec));
  for (const g of p.cockpits[spec.cockpitAsset].gauges) img(g.sprite);
  const sp = COCKPIT_TEXTURES.spokes(spec);
  if (!scene.textures.exists(sp)) {
    const wp = p.cockpits[spec.cockpitAsset].wheel ?? p.wheel;
    scene.load.spritesheet(sp, `assets/cockpits/${sp}.png`, { frameWidth: wp.spokes.frameWidth, frameHeight: wp.spokes.frameHeight });
    missing.push(sp);
  }
  if (missing.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
}

/** Per-frame inputs describing the world behind and around the car. */
export interface CockpitFrame {
  headlights: boolean;
  /** Driver-selected turn signal: -1 left, 1 right, 0 off. Steering hard also signals when this is 0. */
  signal: -1 | 0 | 1;
  manual: boolean;
  palette: RoadPalette;
  timeOfDay: string;
  position: number;
  curveBehind: number;
  rearCars: RearCar[];
  /** Is a car beside the player on the left or right (in the blind spot)? */
  side?: { left: boolean; right: boolean };
}

/** Damage (percent) at which the windshield shows its first, second and third stage of cracks. Light scrapes leave the glass clean. */
export const CRACK_STAGES = [40, 65, 85] as const;

/**
 * The first-person cockpit overlay. Layers (back to front):
 * rear-view scene -> dash frame (windshield and mirror glass transparent) -> windshield damage -> gauge faces ->
 * needles -> warning lamps -> wheel rim -> spokes/hub -> gear display.
 */
export class CockpitView {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private needles: Needle[] = [];
  private lamps: Phaser.GameObjects.Image[] = [];
  private spokes!: Phaser.GameObjects.Image;
  private markerBack!: Phaser.GameObjects.Rectangle;
  private markerFront!: Phaser.GameObjects.Rectangle;
  private gearBox!: Phaser.GameObjects.Graphics;
  private gearHighlight!: Phaser.GameObjects.Rectangle;
  private cracks!: Phaser.GameObjects.Graphics;
  private arrows: Phaser.GameObjects.Image[] = [];
  private sideLamps!: Phaser.GameObjects.Graphics;
  private mirror!: RearMirror;
  private placements!: Placements;
  private wheelDeg = 0;
  private wheelPlacement!: WheelPlacement;
  private temp = 0.4;
  private boost = 0;
  private volts = 12.6;
  private time = 0;
  private drawnCrackStage = -1;
  private loadToken = 0;

  constructor(private scene: Phaser.Scene, private spec: VehicleSpec, private depth = 20) {
    this.placements = scene.cache.json.get(COCKPIT_TEXTURES.placements) as Placements;
    this.build();
  }

  /** Switches cockpit; loads the new vehicle's art first if needed (the old cockpit stays until it is ready). */
  async setVehicle(spec: VehicleSpec): Promise<void> {
    const token = ++this.loadToken;
    await ensureCockpitAssets(this.scene, spec);
    if (token !== this.loadToken || !this.scene.sys.isActive()) return;
    this.spec = spec;
    this.destroy();
    this.build();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  private build(): void {
    const scene = this.scene;
    const d = this.depth;
    const P = this.placements;
    const layout = P.cockpits[this.spec.cockpitAsset];
    this.drawnCrackStage = -1;

    // Rear-view scene sits behind the dash; the glass is a transparent hole in the dash art.
    this.mirror = new RearMirror(scene, P.mirror, d - 1);
    this.add(scene.add.image(VIRTUAL_WIDTH / 2, 270, COCKPIT_TEXTURES.dash(this.spec)).setDepth(d));
    this.add(scene.add.image(P.mirror.x, P.mirror.y, P.mirror.glint).setOrigin(0, 0).setDepth(d + 1));
    this.cracks = this.add(scene.add.graphics().setDepth(d + 0.5));

    // Gauge faces cover the resting needle baked into the dash, then live needles sit on top.
    this.needles = [];
    for (const g of layout.gauges) {
      this.add(scene.add.image(g.x, g.y, g.sprite).setDepth(d + 1));
      const mk = (kind: NeedleKind, len: number, start: number) => {
        const img = scene.add.image(g.x, g.y, COCKPIT_TEXTURES.needle).setOrigin(2.5 / 52, 2.5 / 6).setCrop(0, 0, Math.min(52, len), 6).setDepth(d + 2);
        this.add(img);
        this.needles.push({ kind, img, angle: start });
      };
      const len = Math.round(g.radius * 0.9);
      if (g.kind === 'clock') {
        mk('hour', Math.round(g.radius * 0.5), -90);
        mk('minute', Math.round(g.radius * 0.8), -90);
      } else {
        const sweep = P.gauge_sweep_degrees[g.kind] ?? SWEEP.fuel;
        mk(g.kind as NeedleKind, len, sweep[0]);
      }
    }

    // Warning lamps: 7 frames, drawn only when lit (the dash already has them dim).
    this.lamps = [];
    const left = WARN.x - (7 * WARN.cellW) / 2;
    for (let i = 0; i < 7; i++) {
      const lamp = scene.add.image(left + WARN.cellW * (i + 0.5), WARN.y, COCKPIT_TEXTURES.warnings, i).setDepth(d + 3).setVisible(false);
      this.lamps.push(lamp);
      this.add(lamp);
    }

    // Wheel: static rim, rotating spokes/hub (frame per angle) and a marker dot riding the rim ellipse.
    this.wheelPlacement = layout.wheel ?? P.wheel;
    const wheel = this.wheelPlacement;
    // Spokes and hub go behind the rim, so the rim covers the ends of the spokes.
    this.spokes = this.add(scene.add.image(wheel.spokes.x, wheel.spokes.y, COCKPIT_TEXTURES.spokes(this.spec), 0).setOrigin(0, 0).setDepth(d + 4));
    this.add(scene.add.image(wheel.x, wheel.y, COCKPIT_TEXTURES.rim(this.spec)).setDepth(d + 4.5));
    const mc = Phaser.Display.Color.HexStringToColor(layout.markerColor).color;
    this.markerBack = this.add(scene.add.rectangle(0, 0, 10, 8, 0x050507).setDepth(d + 6));
    this.markerFront = this.add(scene.add.rectangle(0, 0, 6, 4, mc).setDepth(d + 7));
    this.wheelDeg = 0;

    // Gear indicator strip with a highlight over the active letter, plus a 7-segment gear number.
    this.add(scene.add.image(GEAR.x, GEAR.y, COCKPIT_TEXTURES.gear).setDepth(d + 5));
    this.gearHighlight = this.add(scene.add.rectangle(GEAR.x, GEAR.y, 14, 22).setStrokeStyle(2, 0xffd23f).setDepth(d + 6));
    this.gearBox = this.add(scene.add.graphics().setDepth(d + 6));

    // Car-beside lamps at the bottom corners of the windshield: they only show while a car is beside you.
    this.sideLamps = this.add(scene.add.graphics().setDepth(d + 3));
    this.arrows = [];
    // Left and right turn-signal arrows flanking the gear display (the strip lamp lights for either side).
    for (const side of [-1, 1]) {
      const x = side < 0 ? GEAR.x - 68 : GEAR.x + 112;
      this.add(scene.add.rectangle(x, GEAR.y, 32, 22, 0x08060f).setStrokeStyle(2, 0x3a3548).setDepth(d + 5));
      const arrow = scene.add.image(x, GEAR.y, COCKPIT_TEXTURES.warnings, 5).setDepth(d + 6).setFlipX(side < 0).setTint(0x1d3a26);
      this.arrows.push(arrow);
      this.add(arrow);
    }
  }

  /** Per-frame update from the driving state. */
  update(s: DrivingState, dt: number, f: CockpitFrame): void {
    this.time += dt;
    const spec = this.spec;
    const rpmNorm = Phaser.Math.Clamp((s.rpm - spec.idleRpm) / (spec.redlineRpm - spec.idleRpm), 0, 1);

    // Engine temperature comes from the driving model (redlining heats it; see DrivingModel.updateHeat).
    // A blown engine pegs the needle.
    this.temp = s.engineBlown ? 1 : s.engineTemp;
    // Turbo boost spools with throttle and revs (slow rise, quick drop).
    const boostTarget = s.throttle * Phaser.Math.Clamp((rpmNorm - 0.25) / 0.6, 0, 1);
    this.boost = smooth(this.boost, boostTarget, boostTarget > this.boost ? 1.6 : 4, dt);
    // Charging voltage: sags at idle, steady when running, collapses on a wrecked car.
    const voltTarget = (12.4 + 1.5 * Math.min(1, rpmNorm * 4)) * (s.damage > 85 ? 0.75 : 1) + Math.sin(this.time * 5) * 0.08;
    this.volts = smooth(this.volts, voltTarget, 3, dt);
    // Oil pressure follows revs and falls away on a damaged engine.
    const oil = Phaser.Math.Clamp((0.3 + 0.45 * rpmNorm) * (s.damage > 60 ? 1 - (s.damage - 60) / 55 : 1), 0.05, 1);
    const now = new Date();
    const minute = now.getMinutes() + now.getSeconds() / 60;

    const sweepOf = (k: string): [number, number] => this.placements.gauge_sweep_degrees[k] ?? SWEEP.fuel;
    const along = (k: string, frac: number) => {
      const [a, b] = sweepOf(k);
      return a + (b - a) * Phaser.Math.Clamp(frac, 0, 1);
    };
    for (const n of this.needles) {
      let target: number;
      let rate = 14;
      switch (n.kind) {
        case 'rpm': target = rpmAngle(s.rpm) + Math.sin(this.time * 41) * 0.8; rate = 22; break;
        case 'speedo': target = speedoAngle(s.speedKph); break;
        case 'fuel': target = fuelAngle(s.fuel, spec.fuelCapacity); rate = 3; break;
        case 'temp': target = tempAngle(this.temp); rate = 3; break;
        case 'oil': target = along('oil', oil); rate = 6; break;
        case 'volts': target = along('volts', (this.volts - 8) / 8); rate = 6; break;
        case 'boost': target = along('boost', this.boost); rate = 8; break;
        case 'minute': target = -90 + minute * 6; rate = 40; break;
        default: target = -90 + ((now.getHours() % 12) + minute / 60) * 30; rate = 40;
      }
      n.angle = smooth(n.angle, target, rate, dt);
      n.img.setAngle(Math.round(n.angle));
    }

    // Turn signal: the driver's selection, or automatic while steering hard.
    const signal: -1 | 0 | 1 = f.signal !== 0 ? f.signal : Math.abs(s.steerAngle) > 0.3 ? (Math.sign(s.steerAngle) as -1 | 1) : 0;
    const blinkOn = Math.floor(this.time * 2.5) % 2 === 0;
    this.arrows[0]?.setTint(signal < 0 && blinkOn ? 0x4cff7a : 0x1d3a26);
    this.arrows[1]?.setTint(signal > 0 && blinkOn ? 0x4cff7a : 0x1d3a26);

    // Warning lamps.
    const lit = warningStates({
      damage: s.damage,
      fuelFrac: s.fuel / spec.fuelCapacity,
      braking: s.brake > 0.5 && s.speedKph > 5,
      engineTemp: s.engineTemp,
      overheated: s.overheated,
      engineBlown: s.engineBlown,
      brakeFade: s.brakeTemp >= BRAKE_FADE,
      signal,
      headlights: f.headlights,
      time: this.time,
    });
    this.lamps.forEach((l, i) => l.setVisible(lit[i]));

    // Steering wheel: follow the driver's intent (undo the speed-based reduction), ease, pick the nearest frame.
    const sens = 1 - 0.5 * Math.min(1, s.speedKph / REFERENCE_SPEED_KPH);
    this.wheelDeg = smooth(this.wheelDeg, wheelDegrees(s.steerAngle / sens), 16, dt);
    this.updateWheel();

    this.updateCracks(s.damage);
    this.mirror.update({
      position: f.position,
      playerX: s.playerX,
      curveBehind: f.curveBehind,
      palette: f.palette,
      skyTop: SKY_TOP[f.timeOfDay] ?? SKY_TOP.day,
      time: this.time,
      cars: f.rearCars,
    });
    this.drawGear(s, f.manual);
    this.drawSideLamps(f.side, signal);
  }

  private drawSideLamps(side: CockpitFrame['side'], signal: -1 | 0 | 1): void {
    const g = this.sideLamps;
    g.clear();
    if (!side) return;
    const flash = Math.floor(this.time * 6) % 2 === 0;
    const draw = (dir: -1 | 1) => {
      const cx = dir < 0 ? 62 : 898, y = 262;
      const col = signal === dir && !flash ? 0x7a1a14 : 0xff3b30;   // flashes when you signal toward the car
      g.fillStyle(0x050507, 0.85).fillRoundedRect(cx - 34, y - 14, 68, 28, 6).lineStyle(2, 0x3a3d46, 1).strokeRoundedRect(cx - 34, y - 14, 68, 28, 6);
      g.fillStyle(col, 1);
      g.fillRect(cx - 8 * dir - 8, y - 5, 16, 9).fillRect(cx - 8 * dir - 5, y - 9, 10, 5);
      g.fillStyle(0x050507, 1).fillRect(cx - 8 * dir - 6, y - 8, 4, 3).fillRect(cx - 8 * dir + 2, y - 8, 4, 3);
      g.fillStyle(col, 1).fillTriangle(cx + 14 * dir, y - 8, cx + 14 * dir, y + 8, cx + 26 * dir, y);
    };
    if (side.left) draw(-1);
    if (side.right) draw(1);
  }

  private updateWheel(): void {
    const { degrees } = this.wheelPlacement.spokes;
    let best = 0;
    for (let i = 1; i < degrees.length; i++) if (Math.abs(degrees[i] - this.wheelDeg) < Math.abs(degrees[best] - this.wheelDeg)) best = i;
    this.spokes.setFrame(best);
    // The marker dot rides the rim at the same angle the spokes are turned to (the rim may be squarer than an ellipse).
    const m = this.wheelPlacement.marker;
    const th = ((-90 + degrees[best]) * Math.PI) / 180;
    const e = 2 / (m.n ?? 2);
    const mx = Math.round(m.cx + m.rx * Math.sign(Math.cos(th)) * Math.abs(Math.cos(th)) ** e);
    const my = Math.round(m.cy + m.ry * Math.sign(Math.sin(th)) * Math.abs(Math.sin(th)) ** e);
    this.markerBack.setPosition(mx, my);
    this.markerFront.setPosition(mx, my);
  }

  /** Spider-web cracks in the windshield that grow with damage (3 stages, at these damage percentages). */
  private updateCracks(damage: number): void {
    const stage = damage >= CRACK_STAGES[2] ? 3 : damage >= CRACK_STAGES[1] ? 2 : damage >= CRACK_STAGES[0] ? 1 : 0;
    if (stage === this.drawnCrackStage) return;
    this.drawnCrackStage = stage;
    const g = this.cracks;
    g.clear();
    if (stage === 0) return;
    // Deterministic pseudo-random so the pattern is stable.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const origin = { x: 700, y: 215 };
    const rays = [4, 8, 12][stage - 1];
    const reach = [70, 130, 190][stage - 1];
    const m = this.placements.mirror;
    // Visible windshield area (inside the frame), excluding the rear-view mirror.
    const inGlass = (px: number, py: number) =>
      px > 30 && px < 930 && py > 40 && py < 292 && !(px > m.x - 14 && px < m.x + m.w + 14 && py < m.y + m.h + 14);
    const drawLine = (pts: { x: number; y: number }[], col: number, alpha: number, off: number) => {
      g.lineStyle(1, col, alpha);
      g.beginPath();
      g.moveTo(pts[0].x + off, pts[0].y + off);
      for (const p of pts.slice(1)) g.lineTo(p.x + off, p.y + off);
      g.strokePath();
    };
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2 + rnd() * 0.5;
      const pts = [{ x: origin.x, y: origin.y }];
      let { x, y } = origin;
      const segs = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < segs; k++) {
        const len = (reach / segs) * (0.6 + rnd() * 0.8);
        x += Math.cos(ang + (rnd() - 0.5) * 0.7) * len;
        y += Math.sin(ang + (rnd() - 0.5) * 0.7) * len;
        if (!inGlass(x, y)) break; // cracks stop at the windshield frame and the mirror
        pts.push({ x: Math.round(x), y: Math.round(y) });
      }
      if (pts.length < 2) continue;
      drawLine(pts, 0x1a2230, 0.5, 1);
      drawLine(pts, 0xe8f2ff, 0.85, 0);
    }
    // Concentric web rings.
    for (let r = 1; r <= stage + 1; r++) {
      const rr = (reach / (stage + 2)) * r;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        const j = rr * (0.85 + rnd() * 0.3);
        const px = origin.x + Math.cos(a) * j, py = origin.y + Math.sin(a) * j * 0.8;
        if (inGlass(px, py)) pts.push({ x: Math.round(px), y: Math.round(py) });
      }
      if (pts.length > 1) drawLine(pts, 0xe8f2ff, 0.45, 0);
    }
  }

  private drawGear(s: DrivingState, manual: boolean): void {
    // Strip letters P R N D 2 1: each cell ~14px wide starting 4px in (sprite is 88 wide).
    const cell = (i: number) => GEAR.x - 44 + 4 + 14 * i + 6;
    let idx: number;
    if (s.speedKph < 2 && s.throttle < 0.05 && !manual) idx = 2; // N
    else if (manual && s.gear <= 2) idx = s.gear === 1 ? 5 : 4;
    else idx = 3; // D
    this.gearHighlight.setPosition(cell(idx), GEAR.y);

    // 7-segment gear digit to the right of the strip.
    const g = this.gearBox;
    g.clear();
    const x0 = GEAR.x + 52, y0 = GEAR.y - 13;
    g.fillStyle(0x08060f, 1).fillRect(x0 - 3, y0 - 3, 26, 32);
    g.lineStyle(2, 0x3a3548, 1).strokeRect(x0 - 3, y0 - 3, 26, 32);
    const on = manual ? 0xffd23f : 0x4de1ff;
    drawSegDigit(g, s.gear, x0 + 2, y0 + 2, 14, 22, on);
  }

  destroy(): void {
    this.mirror?.destroy();
    this.objects.forEach((o) => o.destroy());
    this.objects = [];
    this.needles = [];
    this.lamps = [];
    this.arrows = [];
  }
}

// Segment layout: a b c d e f g
const SEGMENTS: Record<number, string> = {
  1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 0: 'abcdef',
};

function drawSegDigit(g: Phaser.GameObjects.Graphics, n: number, x: number, y: number, w: number, h: number, color: number): void {
  const t = 3;
  const half = Math.floor(h / 2);
  const rects: Record<string, [number, number, number, number]> = {
    a: [x, y, w, t], b: [x + w - t, y, t, half], c: [x + w - t, y + half, t, half], d: [x, y + h - t, w, t],
    e: [x, y + half, t, half], f: [x, y, t, half], g: [x, y + half - 1, w, t],
  };
  g.fillStyle(color, 1);
  for (const seg of SEGMENTS[n] ?? '') {
    const [rx, ry, rw, rh] = rects[seg];
    g.fillRect(rx, ry, rw, rh);
  }
}
