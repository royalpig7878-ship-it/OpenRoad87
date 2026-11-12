import { WORLD_UNITS_PER_KPH } from '../systems/DrivingModel';
import { Rng } from '../traffic/Rng';
import { PLAYER_LENGTH_M, UNITS_PER_METRE } from '../traffic/TrafficData';
import { TrafficCar, PlayerSample } from '../traffic/TrafficManager';
import { HEAT_LIMIT, POLICE_LEVELS, POLICE_TYPE, PoliceLevel, SPEED_TOLERANCE, getPoliceLevel } from './PoliceData';

export type PursuitState = 'idle' | 'pursuit' | 'busted' | 'escaped';
export type PoliceMode = 'patrol' | 'chase' | 'block';

/** A police cruiser. It is a TrafficCar too, so traffic and renderers can treat it like any vehicle. */
export interface PoliceUnit extends TrafficCar {
  mode: PoliceMode;
  /** Siren on? */
  sirens: boolean;
  modeTime: number;
  blockCooldown: number;
  /** While blocking: 'pass' = getting ahead, 'cut' = pulling into your lane and braking. */
  phase: 'pass' | 'cut';
}

export interface PoliceHit {
  unit: PoliceUnit;
  impactKph: number;
  rearEnd: boolean;
  side: -1 | 1;
  carSpeedKph: number;
}

export interface PursuitResult {
  outcome: 'busted' | 'escaped';
  level: number;
  durationS: number;
  score: number;
  /** Cash earned for escaping (0 if busted). */
  cash: number;
  /** Fine for being busted (0 if escaped). */
  fine: number;
  reputation: number;
}

export interface PoliceEvents {
  started: boolean;
  busted: boolean;
  escaped: boolean;
  /** A new cruiser joined the pursuit. */
  reinforcement: boolean;
  hits: PoliceHit[];
  result?: PursuitResult;
}

/** Things that happened to the player this frame that police care about. */
export interface Incidents {
  trafficHits: number;
  barrierHits: number;
  nearMisses: number;
}

export interface PoliceOptions {
  trackLength: number;
  lanes: number;
  segmentLength: number;
  drawDistance: number;
  seed?: number;
  poolSize?: number;
  level?: number;
  /** Current obstacles (traffic) the cruisers should avoid. */
  obstacles?: () => TrafficCar[];
}

const LATERAL_HIT = 0.34;
const LANE_RATE = 0.8; // road widths per second (police change lanes faster than traffic)
const ESCAPE_DISTANCE = 16000;
const EVADE_NEEDED = 7; // seconds out of reach to escape
const ESCALATE_EVERY = 25; // seconds between reinforcements / difficulty steps
const END_SCREEN_TIME = 4;
const COOLDOWN_AFTER = 12;

/**
 * Law enforcement: builds "heat" from speeding and reckless driving, runs patrol cars in traffic that
 * catch you speeding, and pursuits where cruisers chase, escalate, try to block you, and can arrest you
 * or lose you. Pure TypeScript (no Phaser). Cruisers are TrafficCars so the shared renderer draws them.
 */
export class PoliceManager {
  readonly units: PoliceUnit[] = [];
  state: PursuitState = 'idle';
  /** 0..100; a pursuit starts at 100. */
  heat = 0;
  /** 0..1 arrest progress. */
  bust = 0;
  /** 0..1 escape progress. */
  evade = 0;
  stage = 1;
  pursuitTime = 0;
  score = 0;
  speedLimitKph = 120;
  enabled = true;
  level: PoliceLevel;
  lastResult?: PursuitResult;

  private rng: Rng;
  private clock = 0;
  private endTimer = 0;
  private cooldown = 0;
  private patrolTimer = 10;
  private escalateTimer = 0;
  private evadeTime = 0;

  constructor(private opts: PoliceOptions) {
    this.rng = new Rng(opts.seed ?? 1977);
    this.level = getPoliceLevel(opts.level ?? 1);
    const n = opts.poolSize ?? 6;
    for (let i = 0; i < n; i++) {
      this.units.push({
        id: 1000 + i, active: false, type: POLICE_TYPE, z: 0, x: 0, targetX: 0, speedKph: 0, cruiseKph: 0,
        prevRel: 0, hitCooldown: 0, laneCooldown: 0, passed: false, texture: 'police_cruiser_back_off',
        mode: 'patrol', sirens: false, modeTime: 0, blockCooldown: 0, phase: 'pass',
      });
    }
  }

  setLevel(id: number): void {
    this.level = getPoliceLevel(id);
  }

  cycleLevel(): number {
    const next = (this.level.id % POLICE_LEVELS.length) + 1;
    this.setLevel(next);
    return next;
  }

  setSpeedLimit(kph: number): void {
    this.speedLimitKph = kph;
  }

  reset(): void {
    this.units.forEach((u) => (u.active = false));
    this.state = 'idle';
    this.heat = this.bust = this.evade = this.score = this.pursuitTime = 0;
    this.stage = 1;
    this.cooldown = 0;
    this.patrolTimer = 10;
    this.evadeTime = 0;
  }

  get activeUnits(): PoliceUnit[] {
    return this.units.filter((u) => u.active);
  }

  /** Number of active units (allocation-free; use instead of `activeUnits.length`). */
  get activeCount(): number {
    let n = 0;
    for (const u of this.units) if (u.active) n++;
    return n;
  }

  /** True when no active unit is within the escape distance of the player (allocation-free). */
  private allFar(player: PlayerSample): boolean {
    for (const u of this.units) {
      if (!u.active) continue;
      const r = this.rel(u.z, player.position);
      if (r >= -ESCAPE_DISTANCE && r <= ESCAPE_DISTANCE) return false;
    }
    return true;
  }

  get inPursuit(): boolean {
    return this.state === 'pursuit';
  }

  // ----------------------------------------------------------------- helpers

  private rel(to: number, from: number): number {
    const L = this.opts.trackLength;
    const d = (((to - from) % L) + L) % L;
    return d > L / 2 ? d - L : d;
  }

  private laneX(i: number): number {
    return -1 + (2 * i + 1) / this.opts.lanes;
  }

  private laneIndex(x: number): number {
    return Math.min(this.opts.lanes - 1, Math.max(0, Math.round(((x + 1) * this.opts.lanes - 1) / 2)));
  }

  private half(u: TrafficCar): number {
    return (u.type.lengthM * UNITS_PER_METRE) / 2;
  }

  private free(): PoliceUnit | undefined {
    return this.units.find((u) => !u.active);
  }

  private place(u: PoliceUnit, z: number, lane: number, speed: number, mode: PoliceMode, sirens: boolean): void {
    const L = this.opts.trackLength;
    u.active = true;
    u.z = ((z % L) + L) % L;
    u.x = u.targetX = this.laneX(lane);
    u.speedKph = u.cruiseKph = speed;
    u.mode = mode;
    u.sirens = sirens;
    u.modeTime = 0;
    u.blockCooldown = 3 + this.rng.next() * 4;
    u.phase = 'pass';
    u.hitCooldown = 0;
    u.prevRel = 0;
    u.passed = false;
  }

  /** A lane `lane` is clear of obstacles around `u`'s position (traffic and the player). */
  private laneClear(u: PoliceUnit, lane: number, player: PlayerSample): boolean {
    const xl = this.laneX(lane);
    const test = (z: number, x: number, tx: number, speed: number, half: number) => {
      if (Math.abs(x - xl) >= 0.5 && Math.abs(tx - xl) >= 0.5) return true;
      const dz = this.rel(z, u.z);
      const need = this.half(u) + half + 900;
      if (dz >= 0) return dz > need + Math.max(0, u.speedKph - speed) * 30;
      return -dz > need + Math.max(0, speed - u.speedKph) * 40;
    };
    for (const o of this.opts.obstacles?.() ?? []) if (o.active && !test(o.z, o.x, o.targetX, o.speedKph, this.half(o))) return false;
    return test(player.position, player.playerX, player.playerX, player.speedKph, (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2);
  }

  // ------------------------------------------------------------------ update

  update(dtRaw: number, player: PlayerSample, incidents: Incidents = { trafficHits: 0, barrierHits: 0, nearMisses: 0 }): PoliceEvents {
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    const ev: PoliceEvents = { started: false, busted: false, escaped: false, reinforcement: false, hits: [] };
    this.clock += dt;
    if (!this.enabled) {
      if (this.state !== 'idle' || this.activeCount) this.reset();
      return ev;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.state === 'idle') this.updateIdle(dt, player, incidents, ev);
    else if (this.state === 'pursuit') this.updatePursuit(dt, player, incidents, ev);
    else {
      this.endTimer -= dt;
      // The cruisers hang back until the end screen is done.
      for (const u of this.activeUnits) this.moveUnit(u, dt, player, 'hold');
      if (this.endTimer <= 0) this.finishEnd();
    }

    // Visuals: light-bar phase for each cruiser.
    const phase = Math.floor(this.clock * 4) % 2;
    for (const u of this.units) if (u.active) u.texture = u.sirens ? (phase ? 'police_cruiser_back_red' : 'police_cruiser_back_blue') : 'police_cruiser_back_off';

    // Collisions and rel tracking for every cruiser.
    for (const u of this.units) {
      if (!u.active) continue;
      const rel = this.rel(u.z, player.position);
      u.hitCooldown = Math.max(0, u.hitCooldown - dt);
      const dx = u.x - player.playerX;
      const half = (this.half(u) + (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2) * 0.85;
      if (u.hitCooldown <= 0 && Math.abs(rel) < half && Math.abs(dx) < LATERAL_HIT + 0.05) {
        const closing = player.speedKph - u.speedKph;
        const rearEnd = rel > 0;
        const side: -1 | 1 = dx < 0 ? -1 : 1;
        ev.hits.push({ unit: u, impactKph: Math.max(8, Math.abs(closing) + (rearEnd ? 0 : 5)), rearEnd, side, carSpeedKph: u.speedKph });
        u.hitCooldown = 1.2;
        u.x += side * 0.1;
        u.targetX = this.laneX(this.laneIndex(u.x));
        if (rearEnd) u.speedKph += Math.min(20, Math.max(0, closing) * 0.2);
        else u.speedKph = Math.max(0, Math.min(u.speedKph, player.speedKph * 0.9));
      }
      u.prevRel = rel;
    }
    return ev;
  }

  // -------------------------------------------------------------------- idle

  private updateIdle(dt: number, player: PlayerSample, inc: Incidents, ev: PoliceEvents): void {
    const over = player.speedKph - (this.speedLimitKph + SPEED_TOLERANCE);
    if (this.cooldown <= 0) {
      if (over > 0) this.heat += (4 + over * 0.08) * dt * this.level.heatGain;
      else this.heat -= 6 * dt;
      // Reckless driving adds heat at once.
      this.heat += inc.trafficHits * 28 + inc.barrierHits * 8 + inc.nearMisses * 2.5;
    } else this.heat = Math.max(0, this.heat - 12 * dt);
    this.heat = Math.min(HEAT_LIMIT, Math.max(0, this.heat));

    // Patrol cars cruise in the traffic flow; passing one at speed starts a pursuit.
    this.patrolTimer -= dt;
    const patrol = this.units.find((u) => u.active && u.mode === 'patrol');
    if (!patrol && this.patrolTimer <= 0 && this.cooldown <= 0) {
      const u = this.free();
      if (u) {
        const reach = this.opts.drawDistance * this.opts.segmentLength * 0.85;
        this.place(u, player.position + reach, this.rng.int(this.opts.lanes), this.speedLimitKph * 0.9, 'patrol', false);
      }
      this.patrolTimer = 15 + this.rng.next() * 20;
    }
    for (const u of this.units) {
      if (!u.active || u.mode !== 'patrol') continue;
      this.moveUnit(u, dt, player, 'patrol');
      const rel = this.rel(u.z, player.position);
      const crossed = u.prevRel > 0 && rel <= 0 && u.prevRel < 4000;
      if (crossed && Math.abs(u.x - player.playerX) < 1.1 && player.speedKph > this.speedLimitKph + SPEED_TOLERANCE * 0.5 && this.cooldown <= 0) {
        this.startPursuit(player, ev, u);
        return;
      }
      if (rel < -9000) u.active = false;
    }
    if (this.heat >= HEAT_LIMIT) this.startPursuit(player, ev);
  }

  // ---------------------------------------------------------------- pursuit

  /** Begin a pursuit now (heat limit reached, a patrol car caught you, or a police challenge). */
  startPursuit(player: PlayerSample, ev?: PoliceEvents, patrol?: PoliceUnit): void {
    this.state = 'pursuit';
    this.heat = HEAT_LIMIT;
    this.bust = this.evade = this.score = this.pursuitTime = this.evadeTime = 0;
    this.stage = 1;
    this.escalateTimer = ESCALATE_EVERY;
    this.lastResult = undefined;
    if (patrol) {
      patrol.mode = 'chase';
      patrol.sirens = true;
    } else {
      const u = this.free();
      if (u) this.place(u, player.position - this.rng.range(9000, 13000), this.laneIndex(player.playerX), Math.min(this.level.topKph, player.speedKph + 15), 'chase', true);
    }
    // Remove any leftover patrol cars that were not the one that caught you.
    for (const u of this.units) if (u.active && u.mode === 'patrol') u.active = false;
    if (ev) ev.started = true;
  }

  private updatePursuit(dt: number, player: PlayerSample, inc: Incidents, ev: PoliceEvents): void {
    this.pursuitTime += dt;
    const L = this.level;

    // Score: time under pressure, faster is worth more; near misses pay a bonus.
    this.score += dt * 20 * L.id * (1 + player.speedKph / 200) + inc.nearMisses * 100 * L.id;

    // Escalation: another cruiser joins and the whole force gets a little faster.
    this.escalateTimer -= dt;
    if (this.escalateTimer <= 0) {
      this.escalateTimer = ESCALATE_EVERY;
      this.stage = Math.min(4, this.stage + 1);
      if (this.activeCount < L.maxUnits) {
        const u = this.free();
        if (u) {
          this.place(u, player.position - this.rng.range(10000, 13000), this.rng.int(this.opts.lanes), Math.min(this.topSpeed(), player.speedKph + 20), 'chase', true);
          ev.reinforcement = true;
        }
      }
    }

    let nearest = Infinity;
    let closeUnits = 0;
    for (const u of this.units) {
      if (!u.active) continue;
      this.moveUnit(u, dt, player, 'pursue');
      const rel = this.rel(u.z, player.position);
      const dist = Math.abs(rel);
      nearest = Math.min(nearest, rel < 0 ? -rel : dist); // distance behind (or alongside)
      if (dist < L.catchRadius && Math.abs(u.x - player.playerX) < 0.9) closeUnits++;
      if (rel < -30000) u.active = false;
    }

    // Arrest: cruisers staying on you fill the bust meter; stopping makes it much faster.
    if (closeUnits > 0) this.bust += (dt / L.bustTime) * (player.speedKph < 30 ? 3 : 1) * (1 + 0.25 * (closeUnits - 1));
    else this.bust -= (dt / L.bustTime) * 0.6;
    this.bust = Math.min(1, Math.max(0, this.bust));

    // Escape: stay out of reach long enough.
    const far = this.allFar(player);
    if (far) this.evadeTime += dt;
    else this.evadeTime = Math.max(0, this.evadeTime - dt * 2);
    this.evade = Math.min(1, this.evadeTime / EVADE_NEEDED);

    if (this.bust >= 1) this.endPursuit('busted', ev);
    else if (this.evade >= 1) this.endPursuit('escaped', ev);
  }

  private topSpeed(): number {
    return this.level.topKph + (this.stage - 1) * 8;
  }

  private endPursuit(outcome: 'busted' | 'escaped', ev: PoliceEvents): void {
    const L = this.level;
    const quick = this.pursuitTime < 60 ? 1 : 0;
    const result: PursuitResult =
      outcome === 'escaped'
        ? { outcome, level: L.id, durationS: this.pursuitTime, score: Math.round(this.score + 1500 * L.id + Math.max(0, 60 - this.pursuitTime) * 10), cash: L.reward, fine: 0, reputation: 2 * L.id + quick }
        : { outcome, level: L.id, durationS: this.pursuitTime, score: Math.round(this.score), cash: 0, fine: L.fine, reputation: -L.id };
    this.lastResult = result;
    this.state = outcome;
    this.endTimer = END_SCREEN_TIME;
    ev.result = result;
    if (outcome === 'busted') ev.busted = true;
    else {
      ev.escaped = true;
      for (const u of this.units) u.sirens = false;
    }
  }

  private finishEnd(): void {
    this.units.forEach((u) => (u.active = false));
    this.state = 'idle';
    this.heat = 0;
    this.bust = this.evade = this.evadeTime = 0;
    this.cooldown = COOLDOWN_AFTER;
    this.patrolTimer = 20;
  }

  // ---------------------------------------------------------------- movement

  /** Moves one cruiser. `intent`: patrol (cruise at the limit), pursue (chase/block), hold (stay back). */
  private moveUnit(u: PoliceUnit, dt: number, player: PlayerSample, intent: 'patrol' | 'pursue' | 'hold'): void {
    const L = this.level;
    const rel = this.rel(u.z, player.position); // negative = behind the player
    const gap = -rel;
    let desired: number;
    let targetX = u.targetX;

    if (intent === 'patrol') {
      desired = u.cruiseKph;
    } else if (intent === 'hold') {
      desired = Math.min(player.speedKph, 120);
    } else {
      const top = this.topSpeed();
      u.modeTime += dt;
      u.blockCooldown = Math.max(0, u.blockCooldown - dt);
      const pLane = this.laneIndex(player.playerX);

      if (u.mode === 'block') {
        if (u.phase === 'pass') {
          desired = Math.min(top, player.speedKph + 45);
          // Overtake in a neighbouring lane that is free.
          const options = [pLane - 1, pLane + 1].filter((l) => l >= 0 && l < this.opts.lanes && this.laneClear(u, l, player));
          if (options.length && Math.abs(u.x - this.laneX(pLane)) < 0.3) targetX = this.laneX(options[this.rng.int(options.length)]);
          if (rel > 2800) u.phase = 'cut';
        } else {
          // Pull into the player's lane and brake: the player has to swerve.
          targetX = this.laneX(pLane);
          desired = player.speedKph * 0.75;
        }
        if (u.modeTime > 9 || (u.phase === 'cut' && rel < -600) || (u.phase === 'pass' && gap > 6000)) {
          u.mode = 'chase';
          u.blockCooldown = 8;
          u.modeTime = 0;
        }
      } else {
        // Chase: close the gap, then sit just behind the player.
        if (rel > 0) desired = player.speedKph * 0.9; // overshot: drop back
        else if (gap < 1000) desired = player.speedKph;
        else if (gap < 2000) desired = player.speedKph + 3;
        else desired = player.speedKph + 8 + Math.min(gap, 20000) * 0.004;
        desired = Math.min(top, desired);
        targetX = this.laneX(pLane);
        if (L.blockChance > 0 && u.blockCooldown <= 0 && gap > 1500 && gap < 6500 && this.rng.next() < L.blockChance * dt && this.activeCount >= 1) {
          u.mode = 'block';
          u.phase = 'pass';
          u.modeTime = 0;
        }
      }
    }

    // Keep clear of traffic: slow behind it or move into a free lane.
    if (intent !== 'hold') {
      let aheadSpeed = Infinity;
      let aheadDist = Infinity;
      for (const o of this.opts.obstacles?.() ?? []) {
        if (!o.active || Math.abs(o.x - u.x) > 0.5) continue;
        const dz = this.rel(o.z, u.z);
        if (dz > 0 && dz < 2600 && dz < aheadDist) {
          aheadDist = dz;
          aheadSpeed = o.speedKph;
        }
      }
      if (aheadDist < 2600 && aheadSpeed < desired) {
        const lane = this.laneIndex(u.x);
        const options = [lane - 1, lane + 1].filter((l) => l >= 0 && l < this.opts.lanes && this.laneClear(u, l, player));
        if (options.length && u.mode !== 'block') targetX = this.laneX(options[this.rng.int(options.length)]);
        else desired = Math.min(desired, aheadSpeed - (aheadDist < 1200 ? 15 : 0));
      }
    }

    desired = Math.max(0, desired);
    const rate = desired < u.speedKph ? L.brake : L.accel;
    u.speedKph += Math.max(-rate * dt, Math.min(rate * dt, desired - u.speedKph));
    u.targetX = targetX;
    u.x += Math.max(-LANE_RATE * dt, Math.min(LANE_RATE * dt, targetX - u.x));
    const L2 = this.opts.trackLength;
    u.z = (u.z + u.speedKph * WORLD_UNITS_PER_KPH * dt) % L2;
  }

  // ---------------------------------------------------------------- mirror

  /** Cruisers behind the player within mirror range, for the rear-view mirror (with flashing lights). */
  rearView(player: PlayerSample, range = 6500): { distance: number; x: number; color: number; lights: boolean; texture: string; widthM: number }[] {
    const out: { distance: number; x: number; color: number; lights: boolean; texture: string; widthM: number }[] = [];
    for (const u of this.units) {
      if (!u.active) continue;
      const rel = this.rel(u.z, player.position);
      if (rel < 0 && rel > -range) out.push({ distance: -rel, x: u.x, color: POLICE_TYPE.mirrorColor, lights: u.sirens, texture: 'police_cruiser_front', widthM: POLICE_TYPE.widthM });
    }
    return out;
  }
}
