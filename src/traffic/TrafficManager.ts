import { WORLD_UNITS_PER_KPH } from '../systems/DrivingModel';
import { Rng } from './Rng';
import {
  DIFFICULTY,
  PLAYER_LENGTH_M,
  PLAYER_WIDTH_M,
  TRAFFIC_TYPES,
  TrafficDifficulty,
  TrafficType,
  UNITS_PER_METRE,
} from './TrafficData';

/** One pooled traffic vehicle. Reused: `active` is false while it sits in the pool. */
export interface TrafficCar {
  id: number;
  active: boolean;
  type: TrafficType;
  /** Distance along the track, world units. */
  z: number;
  /** Lateral position, -1..1 across the paved road. */
  x: number;
  /** Lateral position it is steering toward (lane centre). */
  targetX: number;
  speedKph: number;
  cruiseKph: number;
  /** Relative distance to the player on the previous frame (to detect passing). */
  prevRel: number;
  hitCooldown: number;
  laneCooldown: number;
  /** True once the player has overtaken this car (for the pass counter). */
  passed: boolean;
  /** Optional texture overriding `type.texture` (police cars switch light-bar frames). */
  texture?: string;
}

export interface PlayerSample {
  position: number;
  playerX: number;
  speedKph: number;
}

export interface TrafficHit {
  car: TrafficCar;
  /** Closing speed, km/h (always >= 8 so that even bumps hurt a little). */
  impactKph: number;
  /** True when the player ran into the back of the car. */
  rearEnd: boolean;
  /** Which side of the player the car is on: -1 left, 1 right. */
  side: -1 | 1;
  carSpeedKph: number;
}

export interface NearMiss {
  car: TrafficCar;
  /** Lateral gap in road-half-width units (smaller = closer). */
  clearance: number;
  relSpeedKph: number;
}

export interface TrafficEvents {
  hits: TrafficHit[];
  nearMisses: NearMiss[];
  /** Cars the player overtook this frame. */
  passes: TrafficCar[];
}

export interface TrafficOptions {
  trackLength: number;
  lanes: number;
  segmentLength: number;
  /** How far ahead (in segments) cars are visible; spawning happens near this distance. */
  drawDistance: number;
  poolSize?: number;
  seed?: number;
  difficulty?: TrafficDifficulty;
}

export interface TrafficStats {
  passed: number;
  nearMisses: number;
  hits: number;
}

const LATERAL_HIT = 0.34; // |dx| below this (road-half-width units) overlaps the player's body
const NEAR_MISS_LATERAL = 0.56; // passing closer than this without touching counts as a near miss
const LANE_SPEED = 0.45; // lateral road-widths per second during a lane change
const DESPAWN_BEHIND = 9000;
/** Cars in the visible stretch of road at density 1.0. */
const CARS_PER_DENSITY = 14;
/** Lane discipline: the left lane is the fast lane, the right lane the slow one. */
const LANE_SPEED_BIAS = [1.12, 1.0, 0.88];

/**
 * Pooled, rule-driven traffic: spawns cars in the distance, cruises them at their own speeds,
 * keeps spacing, changes lanes when blocked (only into clear gaps), recycles passed cars,
 * and reports collisions and near misses against the player. No Phaser dependency.
 */
export class TrafficManager {
  readonly cars: TrafficCar[] = [];
  /** Other road users (e.g. police) that traffic should avoid and keep clear of. */
  extras: TrafficCar[] = [];
  readonly stats: TrafficStats = { passed: 0, nearMisses: 0, hits: 0 };
  private readonly events: TrafficEvents = { hits: [], nearMisses: [], passes: [] };
  difficulty: TrafficDifficulty;
  private rng: Rng;
  private spawnTimer = 0;
  private spawnReach: number;
  private needsPopulate = true;

  constructor(private opts: TrafficOptions) {
    this.rng = new Rng(opts.seed ?? 1987);
    this.difficulty = opts.difficulty ?? DIFFICULTY.normal;
    this.spawnReach = opts.drawDistance * opts.segmentLength * 0.95;
    const n = opts.poolSize ?? 40;
    for (let i = 0; i < n; i++) {
      this.cars.push({
        id: i, active: false, type: TRAFFIC_TYPES[0], z: 0, x: 0, targetX: 0, speedKph: 0, cruiseKph: 0,
        prevRel: 0, hitCooldown: 0, laneCooldown: 0, passed: false,
      });
    }
  }

  setDifficulty(d: TrafficDifficulty): void {
    this.difficulty = d;
  }

  reset(): void {
    this.cars.forEach((c) => (c.active = false));
    this.stats.passed = this.stats.nearMisses = this.stats.hits = 0;
    this.spawnTimer = 0;
    this.needsPopulate = true;
  }

  get activeCount(): number {
    let n = 0;
    for (const c of this.cars) if (c.active) n++;
    return n;
  }

  /** Lane centre in road-half-width units. */
  laneX(i: number): number {
    return -1 + (2 * i + 1) / this.opts.lanes;
  }

  /** Signed distance from `from` to `to` along the looping track, in (-L/2, L/2]. */
  rel(to: number, from: number): number {
    const L = this.opts.trackLength;
    const d = (((to - from) % L) + L) % L;
    return d > L / 2 ? d - L : d;
  }

  private halfLengthUnits(c: TrafficCar): number {
    return (c.type.lengthM * UNITS_PER_METRE) / 2;
  }

  // ------------------------------------------------------------------ update

  update(dtRaw: number, player: PlayerSample): TrafficEvents {
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    // One events object is reused every frame (callers read it immediately), so no garbage is created here.
    const events = this.events;
    events.hits.length = 0;
    events.nearMisses.length = 0;
    events.passes.length = 0;
    const L = this.opts.trackLength;

    // Think + move.
    for (const c of this.cars) {
      if (!c.active) continue;
      this.think(c, dt, player);
      c.z = (c.z + c.speedKph * WORLD_UNITS_PER_KPH * dt) % L;
      c.hitCooldown = Math.max(0, c.hitCooldown - dt);
    }

    // Player interaction and recycling.
    for (const c of this.cars) {
      if (!c.active) continue;
      const rel = this.rel(c.z, player.position);
      this.interact(c, rel, player, events);
      c.prevRel = rel;
      if (rel > this.spawnReach * 1.15 || rel < -DESPAWN_BEHIND) c.active = false;
    }

    // Fill the road ahead on the first frame so the player doesn't start on an empty highway.
    if (this.needsPopulate) {
      this.needsPopulate = false;
      this.populate(player);
    }

    // Spawn.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const desired = Math.round(this.difficulty.density * CARS_PER_DENSITY);
      let ahead = 0;
      for (const c of this.cars) if (c.active && this.rel(c.z, player.position) > 0) ahead++;
      for (let tries = 0; tries < 4 && ahead < desired; tries++) if (this.spawnAhead(player)) ahead++;
      if (player.speedKph < 60 && this.rng.next() < 0.15) this.spawnBehind(player);
      else if (player.speedKph >= 60 && this.behindCount(player) < 2 && this.rng.next() < 0.12 * this.difficulty.density) this.spawnOvertaker(player);
      this.spawnTimer = (0.25 + this.rng.next() * 0.6) / Math.max(0.4, this.difficulty.density);
    }
    return events;
  }

  // ---------------------------------------------------------------------- AI

  private think(c: TrafficCar, dt: number, player: PlayerSample): void {
    const followDist = 1600 + c.speedKph * 30;
    let aheadSpeed = Infinity;
    let aheadDist = Infinity;
    let aheadHalf = 0;
    const consider = (z: number, x: number, speed: number, half: number) => {
      if (Math.abs(x - c.x) >= 0.5) return;
      const dz = this.rel(z, c.z); // distance from my centre to theirs
      if (dz > 0 && dz < followDist + 800 && dz < aheadDist) {
        aheadDist = dz;
        aheadSpeed = speed;
        aheadHalf = half;
      }
    };
    for (const o of this.cars) if (o.active && o !== c) consider(o.z, o.x, o.speedKph, this.halfLengthUnits(o));
    for (const o of this.extras) if (o.active) consider(o.z, o.x, o.speedKph, this.halfLengthUnits(o));
    consider(player.position, player.playerX, player.speedKph, (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2);

    let target = c.cruiseKph;
    const blocked = aheadDist < followDist;
    if (blocked) {
      target = Math.min(target, aheadSpeed);
      if (aheadDist < followDist * 0.5) target = Math.min(target, aheadSpeed - 8);
      if (aheadDist < 900) target = Math.min(target, aheadSpeed - 20);
    }
    target = Math.max(0, target);
    // Emergency braking when very close; and traffic never drives through the car in front.
    const close = aheadDist < this.halfLengthUnits(c) + aheadHalf + 1500;
    const rate = target < c.speedKph ? (close ? 90 : 45) : 18;
    c.speedKph += Math.max(-rate * dt, Math.min(rate * dt, target - c.speedKph));
    if (aheadDist < this.halfLengthUnits(c) + aheadHalf + 400) c.speedKph = Math.min(c.speedKph, aheadSpeed);

    // Lane changes: only into gaps that are clear ahead and behind (including the player).
    c.laneCooldown -= dt;
    if (c.laneCooldown <= 0 && Math.abs(c.x - c.targetX) < 0.02) {
      const wantPass = blocked && c.cruiseKph > aheadSpeed + 10;
      if (wantPass || this.rng.next() < this.difficulty.laneChangeChance * 0.5) {
        const lane = this.laneIndex(c.x);
        const options = [lane - 1, lane + 1].filter((l) => l >= 0 && l < this.opts.lanes);
        // Prefer a random free lane.
        for (let i = options.length - 1; i > 0; i--) {
          const j = this.rng.int(i + 1);
          [options[i], options[j]] = [options[j], options[i]];
        }
        for (const l of options) {
          if (this.laneClear(c, l, player)) {
            c.targetX = this.laneX(l);
            break;
          }
        }
        c.laneCooldown = wantPass ? 1.2 : 2.5 + this.rng.next() * 3;
      } else c.laneCooldown = 0.5;
    }
    const dx = c.targetX - c.x;
    c.x += Math.max(-LANE_SPEED * dt, Math.min(LANE_SPEED * dt, dx));
  }

  laneIndex(x: number): number {
    return Math.min(this.opts.lanes - 1, Math.max(0, Math.round(((x + 1) * this.opts.lanes - 1) / 2)));
  }

  /** True if moving car `c` into lane `lane` would not cut anyone up. */
  laneClear(c: TrafficCar, lane: number, player: PlayerSample): boolean {
    const xl = this.laneX(lane);
    const check = (z: number, x: number, tx: number, speed: number, halfLen: number): boolean => {
      if (Math.abs(x - xl) >= 0.5 && Math.abs(tx - xl) >= 0.5) return true;
      const dz = this.rel(z, c.z);
      const need = this.halfLengthUnits(c) + halfLen;
      if (dz >= 0) return dz > need + 1200 + Math.max(0, c.speedKph - speed) * 40;
      return -dz > need + 1200 + Math.max(0, speed - c.speedKph) * 60;
    };
    for (const o of this.cars) {
      if (!o.active || o === c) continue;
      if (!check(o.z, o.x, o.targetX, o.speedKph, this.halfLengthUnits(o))) return false;
    }
    for (const o of this.extras) {
      if (o.active && !check(o.z, o.x, o.targetX, o.speedKph, this.halfLengthUnits(o))) return false;
    }
    return check(player.position, player.playerX, player.playerX, player.speedKph, (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2);
  }

  // ------------------------------------------------------------ interactions

  private interact(c: TrafficCar, rel: number, player: PlayerSample, events: TrafficEvents): void {
    const dx = c.x - player.playerX;
    const adx = Math.abs(dx);
    const half = (this.halfLengthUnits(c) + (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2) * 0.85;
    const closing = player.speedKph - c.speedKph;

    // Collision.
    if (c.hitCooldown <= 0 && Math.abs(rel) < half && adx < LATERAL_HIT + Math.max(0, (c.type.widthM - 1.8) * 0.09)) {
      const rearEnd = rel > 0;
      const side: -1 | 1 = dx < 0 ? -1 : 1;
      const impactKph = Math.max(8, Math.abs(closing) + (rearEnd ? 0 : 5));
      events.hits.push({ car: c, impactKph, rearEnd, side, carSpeedKph: c.speedKph });
      this.stats.hits++;
      c.hitCooldown = 1.5;
      // The car is shoved along and sideways, and brakes if it was hit from behind.
      if (rearEnd) c.speedKph += Math.min(25, Math.max(0, closing) * 0.25);
      else c.speedKph = Math.max(0, Math.min(c.speedKph, player.speedKph * 0.9));
      c.x += side * 0.1;
      c.targetX = this.laneX(this.laneIndex(c.x));
      return;
    }

    // Passing / near miss: evaluated at the moment the car and player draw level.
    const crossed = (c.prevRel > 0 && rel <= 0) || (c.prevRel < 0 && rel >= 0);
    if (crossed && Math.abs(c.prevRel) < 4000) {
      if (c.prevRel > 0 && !c.passed) {
        c.passed = true;
        this.stats.passed++;
        events.passes.push(c);
      }
      if (c.hitCooldown <= 0 && adx >= LATERAL_HIT && adx < NEAR_MISS_LATERAL && Math.abs(closing) > 25 && player.speedKph > 60) {
        events.nearMisses.push({ car: c, clearance: adx, relSpeedKph: Math.abs(closing) });
        this.stats.nearMisses++;
      }
    }
  }

  // ------------------------------------------------------------------ spawn

  /** Cruising speed for a new car of `type` in `lane` (left lane faster, right lane slower). */
  private cruiseFor(type: TrafficType, lane: number): number {
    const bias = this.opts.lanes === 3 ? LANE_SPEED_BIAS[lane] : 1;
    return this.rng.range(type.minKph, type.maxKph) * this.difficulty.speedMult * bias;
  }

  private pickType(): TrafficType {
    let total = 0;
    for (const t of TRAFFIC_TYPES) total += t.weight;
    let r = this.rng.next() * total;
    for (const t of TRAFFIC_TYPES) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return TRAFFIC_TYPES[0];
  }

  private free(): TrafficCar | undefined {
    return this.cars.find((c) => !c.active);
  }

  /** True if a car of `type` fits at distance `z` in `lane` without crowding another car. */
  private spawnClear(z: number, lane: number, type: TrafficType): boolean {
    const x = this.laneX(lane);
    for (const o of this.cars) {
      if (!o.active || Math.abs(o.x - x) > 0.5) continue;
      const gap = 3600 + (type.lengthM * UNITS_PER_METRE) / 2 + this.halfLengthUnits(o);
      if (Math.abs(this.rel(o.z, z)) < gap) return false;
    }
    return true;
  }

  private place(car: TrafficCar, type: TrafficType, z: number, lane: number, speed: number): void {
    car.active = true;
    car.type = type;
    car.z = ((z % this.opts.trackLength) + this.opts.trackLength) % this.opts.trackLength;
    car.x = car.targetX = this.laneX(lane);
    car.cruiseKph = speed;
    car.speedKph = speed;
    car.prevRel = 0;
    car.hitCooldown = 0;
    car.laneCooldown = 1 + this.rng.next() * 3;
    car.passed = false;
  }

  private spawnAhead(player: PlayerSample): boolean {
    const car = this.free();
    if (!car) return false;
    const type = this.pickType();
    const lane = this.rng.int(this.opts.lanes);
    const z = player.position + this.spawnReach * (0.7 + 0.3 * this.rng.next());
    if (!this.spawnClear(z, lane, type)) return false;
    this.place(car, type, z, lane, this.cruiseFor(type, lane));
    return true;
  }

  /** Scatter the initial traffic across the visible road (never right on top of the player). */
  private populate(player: PlayerSample): void {
    const desired = Math.round(this.difficulty.density * CARS_PER_DENSITY);
    let placed = 0;
    for (let tries = 0; tries < desired * 6 && placed < desired; tries++) {
      const car = this.free();
      if (!car) return;
      const type = this.pickType();
      const lane = this.rng.int(this.opts.lanes);
      const z = player.position + this.rng.range(5000, this.spawnReach * 0.9);
      if (!this.spawnClear(z, lane, type)) continue;
      this.place(car, type, z, lane, this.cruiseFor(type, lane));
      placed++;
    }
  }

  /** Occasionally a fast car appears behind a slow player so the mirror has something to show. */
  private spawnBehind(player: PlayerSample): void {
    const car = this.free();
    if (!car) return;
    const type = this.pickType();
    const lane = this.rng.int(this.opts.lanes);
    const z = player.position - this.rng.range(5500, 8000);
    if (!this.spawnClear(z, lane, type)) return;
    this.place(car, type, z, lane, Math.max(type.minKph, player.speedKph + 40));
  }

  private behindCount(player: PlayerSample): number {
    let n = 0;
    for (const c of this.cars) if (c.active && this.rel(c.z, player.position) < 0) n++;
    return n;
  }

  /** A faster car appears behind a moving player, closes up, and overtakes (or sits in the mirror). */
  private spawnOvertaker(player: PlayerSample): void {
    const car = this.free();
    if (!car) return;
    const type = this.pickType();
    const lane = this.rng.int(this.opts.lanes);
    const z = player.position - this.rng.range(6000, 8500);
    if (!this.spawnClear(z, lane, type)) return;
    const speed = Math.max(type.minKph, player.speedKph + this.rng.range(20, 50)) * Math.min(1.1, this.difficulty.speedMult);
    this.place(car, type, z, lane, speed);
  }

  /** Cars behind the player within mirror range, for the rear-view mirror. The distance is from the driver to the car's front. */
  rearCars(player: PlayerSample, range = 6500): { distance: number; x: number; color: number; texture: string; widthM: number }[] {
    const out: { distance: number; x: number; color: number; texture: string; widthM: number }[] = [];
    for (const c of this.cars) {
      if (!c.active) continue;
      const rel = this.rel(c.z, player.position);
      // Distance to the car's FRONT (what you see in the mirror), not its middle: a 15 m semi whose middle is 5 m
      // behind you is still alongside your car.
      if (rel < 0 && rel > -range) out.push({ distance: Math.max(0, -rel - this.halfLengthUnits(c)), x: c.x, color: c.type.mirrorColor, texture: c.type.texture.replace('_back', '_front'), widthM: c.type.widthM });
    }
    return out;
  }

  /** Is a car beside the player in the next lane (side -1 = left, 1 = right)? Covers the blind spot: from about 8 m behind the player's rear to 2 m ahead of the front. */
  carBeside(player: PlayerSample, side: -1 | 1): boolean {
    const laneW = 2 / this.opts.lanes;
    const tx = player.playerX + side * laneW;
    const playerHalf = (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2;
    const test = (c: TrafficCar): boolean => {
      if (!c.active) return false;
      if (Math.abs(c.x - tx) > laneW * 0.7) return false;
      const rel = this.rel(c.z, player.position); // positive = ahead
      const reach = this.halfLengthUnits(c) + playerHalf;
      return rel < reach + 2 * UNITS_PER_METRE && rel > -(reach + 8 * UNITS_PER_METRE);
    };
    return this.cars.some(test) || this.extras.some(test);
  }

  /** Width in world units used for lateral overlap tests (exposed for tests/debug). */
  static readonly PLAYER_WIDTH_UNITS = PLAYER_WIDTH_M * UNITS_PER_METRE;
}
