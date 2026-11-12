import { PLAYER_LENGTH_M, UNITS_PER_METRE } from '../traffic/TrafficData';

export type PickupKind = 'repair' | 'fuel' | 'money' | 'boost';

export interface Pickup {
  kind: PickupKind;
  /** Track position, world units. */
  z: number;
  /** Lateral position in road half-widths (lane centre). */
  x: number;
  /** Seconds alive (for the bob/spin animation). */
  age: number;
}

/** What one pickup gives. */
export const PICKUP_VALUE = {
  /** Damage points removed. */
  repair: 25,
  /** Share of the tank refilled. */
  fuelFrac: 0.35,
  /**
   * Cash range. Kept small on purpose: free drive with pickups pays well under career jobs (about $70/min at
   * 150 km/h against $140-230/min for a rookie job), so the cash is a bonus, not a job.
   */
  moneyMin: 20,
  moneyMax: 80,
} as const;

/** Spawn spacing, metres between pickups (random in this range). */
const SPACING_M: [number, number] = [350, 800];
/**
 * New pickups appear this far ahead (metres) by default. The game passes its draw distance instead so they
 * pop in at the horizon; either way it is capped below half the looping track, or a new pickup would count as
 * already behind the player and be dropped at once (why none showed up on the short game roads before).
 */
const SPAWN_AHEAD_M = 450;
/** At most this many waiting on the road at once. */
const MAX_ACTIVE = 4;
/** Pickup collected when its centre is within this lateral distance (road half-widths) of the car. */
const GRAB_X = 0.3;

export interface PlayerNeeds {
  /** 0..1 */
  fuelFrac: number;
  /** 0..100 */
  damage: number;
}

export interface PickupSample {
  position: number;
  playerX: number;
}

/**
 * Pickups lying on the road: repair kits, gas cans, cash and nitro. They spawn at random spacing ahead of the
 * player, in a random lane, and are collected by driving through them. What spawns leans toward what the
 * car needs (gas when low, repair when damaged). Pure TypeScript (no Phaser) so it can be simulated.
 */
export class PickupManager {
  items: Pickup[] = [];
  /** World units still to drive before the next pickup spawns. */
  private untilNext: number;
  private lastPos: number;
  private rand: () => number;
  private spawnAheadWanted: number;

  constructor(private lanes: number, private trackLength: number, startPosition = 0, rand: () => number = Math.random, spawnAhead = SPAWN_AHEAD_M * UNITS_PER_METRE) {
    this.rand = rand;
    this.spawnAheadWanted = spawnAhead;
    this.untilNext = this.spacing() * 0.4;
    this.lastPos = startPosition;
  }

  /** How far ahead (world units) new pickups appear. */
  get spawnAhead(): number {
    return Math.min(this.spawnAheadWanted, this.trackLength * 0.4);
  }

  /** Units ahead of `from` to `z` along the looping track (0..trackLength). */
  private ahead(from: number, z: number): number {
    const L = this.trackLength;
    return (((z - from) % L) + L) % L;
  }

  private spacing(): number {
    return (SPACING_M[0] + this.rand() * (SPACING_M[1] - SPACING_M[0])) * UNITS_PER_METRE;
  }

  /** Weighted choice: gas grows likely as the tank empties, repair as damage builds. */
  pickKind(needs: PlayerNeeds): PickupKind {
    const w: [PickupKind, number][] = [
      ['money', 4],
      ['boost', 2.5],
      ['fuel', 0.8 + 12 * Math.max(0, 0.6 - needs.fuelFrac)],
      ['repair', 0.5 + needs.damage / 15],
    ];
    const total = w.reduce((a, [, n]) => a + n, 0);
    let r = this.rand() * total;
    for (const [k, n] of w) if ((r -= n) <= 0) return k;
    return 'money';
  }

  /** Reset for a new road (or after a teleport). */
  reset(trackLength: number, position: number): void {
    this.trackLength = trackLength;
    this.items = [];
    this.untilNext = this.spacing() * 0.4;
    this.lastPos = position;
  }

  /** Advance, spawn and collect. Returns the pickups grabbed this frame. */
  update(dt: number, player: PickupSample, needs: PlayerNeeds): Pickup[] {
    const got: Pickup[] = [];
    const halfLen = (PLAYER_LENGTH_M * UNITS_PER_METRE) / 2;
    const L = this.trackLength;
    this.items = this.items.filter((p) => {
      p.age += dt;
      let rel = this.ahead(player.position, p.z);
      if (rel > L / 2) rel -= L; // behind the player
      if (Math.abs(rel) < halfLen && Math.abs(p.x - player.playerX) < GRAB_X) {
        got.push(p);
        return false;
      }
      return rel > -50 * UNITS_PER_METRE; // forget ones well behind
    });

    // Spawn by distance driven (handles the track wrapping).
    const moved = this.ahead(this.lastPos, player.position);
    this.lastPos = player.position;
    if (moved < L / 2) this.untilNext -= moved;
    if (this.untilNext <= 0) {
      this.untilNext = this.spacing();
      if (this.items.length < MAX_ACTIVE) {
        const lane = Math.floor(this.rand() * this.lanes);
        const z = (player.position + this.spawnAhead) % L;
        this.items.push({ kind: this.pickKind(needs), z, x: -1 + (2 * lane + 1) / this.lanes, age: 0 });
      }
    }
    return got;
  }
}
