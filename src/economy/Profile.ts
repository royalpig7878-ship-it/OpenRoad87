import type { Medal } from '../arcade/Challenges';
import { VEHICLES, getVehicle } from '../vehicles/VehicleRoster';
import { VehicleSpec } from '../vehicles/VehicleSpec';
import { MAX_UPGRADE_LEVEL, UPGRADE_KEYS, UpgradeKey, UpgradeLevels, noUpgrades, repairCost, upgradeCost } from './UpgradeData';
import { applyUpgrades } from './VehicleTuning';

export const PROFILE_VERSION = 1;
export const STARTING_VEHICLE = 'vortex_gt';
export const STARTING_MONEY = 2500;

/** A vehicle the player owns, with its installed upgrades and current damage. */
export interface OwnedVehicle {
  upgrades: UpgradeLevels;
  /** 0 (perfect) .. 100 (wrecked). */
  damage: number;
  /**
   * Fuel left in the tank as a share of its size, 0..1 (missing = full). Carries over between drives like
   * damage, so you gas up in the garage. A share (not litres) so a bigger tank upgrade keeps the same level.
   */
  fuel?: number;
}

/** Everything the garage and economy need to know about the player (the save system stores this). */
/** One entry of an arcade high-score table. */
export interface ScoreEntry {
  score: number;
  vehicle: string;
  /** Milliseconds since 1970 when it was set. */
  when: number;
}

export const MAX_SCORES_PER_CHALLENGE = 5;

/** Best result for a career job the player has cleared. */
export interface JobRecord {
  medal: Medal;
  score: number;
  count: number;
}

export interface PlayerProfile {
  version: number;
  money: number;
  reputation: number;
  selectedVehicle: string;
  vehicles: Record<string, OwnedVehicle>;
  /** Best arcade scores per challenge id, highest first. */
  highScores: Record<string, ScoreEntry[]>;
  /** Career jobs cleared so far (by job id). */
  completedJobs: Record<string, JobRecord>;
}

export type Result = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };

export function createProfile(): PlayerProfile {
  return {
    version: PROFILE_VERSION,
    money: STARTING_MONEY,
    reputation: 0,
    selectedVehicle: STARTING_VEHICLE,
    vehicles: { [STARTING_VEHICLE]: { upgrades: noUpgrades(), damage: 0, fuel: 1 } },
    highScores: {},
    completedJobs: {},
  };
}

export const owns = (p: PlayerProfile, id: string): boolean => id in p.vehicles;

/** The selected vehicle as it drives (upgrades applied). */
export function effectiveSpec(p: PlayerProfile, id: string): VehicleSpec {
  const base = getVehicle(id);
  const owned = p.vehicles[id];
  return owned ? applyUpgrades(base, owned.upgrades) : base;
}

export function buyVehicle(p: PlayerProfile, id: string): Result {
  const spec = VEHICLES.find((v) => v.id === id);
  if (!spec) return fail('UNKNOWN VEHICLE');
  if (owns(p, id)) return fail('ALREADY OWNED');
  if (p.money < spec.price) return fail('NOT ENOUGH MONEY');
  p.money -= spec.price;
  p.vehicles[id] = { upgrades: noUpgrades(), damage: 0, fuel: 1 };
  return OK;
}

export function nextUpgradeCost(p: PlayerProfile, id: string, key: UpgradeKey): number | null {
  const owned = p.vehicles[id];
  if (!owned) return null;
  return upgradeCost(getVehicle(id).price, key, owned.upgrades[key]);
}

export function buyUpgrade(p: PlayerProfile, id: string, key: UpgradeKey): Result {
  const owned = p.vehicles[id];
  if (!owned) return fail('YOU DO NOT OWN THIS CAR');
  if (owned.upgrades[key] >= MAX_UPGRADE_LEVEL) return fail('ALREADY MAXED');
  const cost = nextUpgradeCost(p, id, key)!;
  if (p.money < cost) return fail('NOT ENOUGH MONEY');
  p.money -= cost;
  owned.upgrades[key]++;
  return OK;
}

/** Price of fuel per litre at the garage pump. */
export const FUEL_PRICE_PER_LITRE = 2;
/** With no money and a nearly empty tank, the garage gives you this much for free so you are never stuck. */
export const EMERGENCY_FUEL = 0.15;

/** Share of the tank that is full (0..1). */
export const fuelLevel = (p: PlayerProfile, id: string): number => p.vehicles[id]?.fuel ?? 1;

export function setFuel(p: PlayerProfile, id: string, frac: number): void {
  const owned = p.vehicles[id];
  if (owned) owned.fuel = Math.min(1, Math.max(0, frac));
}

/** Cost to fill the tank to the top. */
export function gasUpCost(p: PlayerProfile, id: string): number {
  if (!owns(p, id)) return 0;
  const litres = (1 - fuelLevel(p, id)) * effectiveSpec(p, id).fuelCapacity;
  return Math.ceil(litres * FUEL_PRICE_PER_LITRE);
}

/**
 * Fills the tank. With too little money it buys what the money covers. Broke with an almost empty tank, the
 * pump gives an emergency splash (EMERGENCY_FUEL) for free so the player can always drive and earn again.
 */
export function gasUp(p: PlayerProfile, id: string): Result & { free?: boolean } {
  const owned = p.vehicles[id];
  if (!owned) return fail('YOU DO NOT OWN THIS CAR');
  const level = fuelLevel(p, id);
  if (level >= 0.999) return fail('TANK ALREADY FULL');
  const cap = effectiveSpec(p, id).fuelCapacity;
  const full = gasUpCost(p, id);
  if (p.money >= full) {
    p.money -= full;
    owned.fuel = 1;
    return OK;
  }
  const affordable = p.money / FUEL_PRICE_PER_LITRE / cap;
  if (level + affordable < EMERGENCY_FUEL) {
    owned.fuel = EMERGENCY_FUEL;
    p.money = 0;
    return { ok: true, free: true };
  }
  owned.fuel = Math.min(1, level + affordable);
  p.money = 0;
  return OK;
}

/** Cost to fully repair a vehicle's damage. */
export function fullRepairCost(p: PlayerProfile, id: string): number {
  const owned = p.vehicles[id];
  return owned ? repairCost(getVehicle(id).price, owned.damage) : 0;
}

/**
 * Repairs a vehicle. With a limited budget it repairs as much as the money covers (partial repair),
 * so a poor player is never locked out of fixing at least some damage.
 */
export function repair(p: PlayerProfile, id: string): Result {
  const owned = p.vehicles[id];
  if (!owned) return fail('YOU DO NOT OWN THIS CAR');
  if (owned.damage <= 0) return fail('NO DAMAGE');
  const price = getVehicle(id).price;
  const full = repairCost(price, owned.damage);
  if (p.money >= full) {
    p.money -= full;
    owned.damage = 0;
    return OK;
  }
  const perPercent = repairCost(price, 1) || 10;
  const percent = Math.floor(p.money / perPercent);
  if (percent <= 0) return fail('NOT ENOUGH MONEY');
  p.money -= repairCost(price, percent);
  owned.damage = Math.max(0, owned.damage - percent);
  return OK;
}

export function selectVehicle(p: PlayerProfile, id: string): Result {
  if (!owns(p, id)) return fail('YOU DO NOT OWN THIS CAR');
  p.selectedVehicle = id;
  return OK;
}

/** Damage below this percentage is just dents and scratches: it is fixed for free when a drive ends. */
export const MINOR_DAMAGE = 15;

/** Records the damage a vehicle took during a drive (minor dents are fixed for free; real damage stays until repaired). */
export function setDamage(p: PlayerProfile, id: string, damage: number): void {
  const owned = p.vehicles[id];
  if (!owned) return;
  const clamped = Math.min(100, Math.max(0, damage));
  owned.damage = clamped < MINOR_DAMAGE ? 0 : clamped;
}

export function addMoney(p: PlayerProfile, amount: number): void {
  p.money = Math.max(0, p.money + amount);
}

// -------------------------------------------------------------- high scores

export interface ScoreRank {
  /** 1-based place in the table, or null if the score did not make it. */
  rank: number | null;
  /** True if it beat the previous best (or was the first score). */
  newBest: boolean;
}

/** Adds a score to a challenge's table (top 5 kept, highest first). */
export function recordScore(p: PlayerProfile, challengeId: string, score: number, vehicle: string, when = Date.now()): ScoreRank {
  const table = (p.highScores[challengeId] ??= []);
  const previousBest = table.length ? table[0].score : -1;
  table.push({ score: Math.round(score), vehicle, when });
  table.sort((a, b) => b.score - a.score || a.when - b.when);
  const idx = table.findIndex((e) => e.score === Math.round(score) && e.when === when && e.vehicle === vehicle);
  table.length = Math.min(table.length, MAX_SCORES_PER_CHALLENGE);
  return { rank: idx >= 0 && idx < MAX_SCORES_PER_CHALLENGE ? idx + 1 : null, newBest: score > previousBest };
}

export const bestScore = (p: PlayerProfile, challengeId: string): number => p.highScores[challengeId]?.[0]?.score ?? 0;

// ------------------------------------------------------------------ storage

/** Plain JSON for the save system (Milestone 14). */
export const serializeProfile = (p: PlayerProfile): string => JSON.stringify(p);

/**
 * Reads a saved profile defensively: anything missing, mistyped or out of range falls back to a safe value,
 * and a completely unreadable save gives a fresh profile.
 */
export function deserializeProfile(text: string | null | undefined): PlayerProfile {
  const fresh = createProfile();
  if (!text) return fresh;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fresh;
  }
  if (typeof raw !== 'object' || raw === null) return fresh;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

  const vehicles: Record<string, OwnedVehicle> = {};
  if (typeof r.vehicles === 'object' && r.vehicles !== null) {
    for (const [id, v] of Object.entries(r.vehicles as Record<string, unknown>)) {
      if (!VEHICLES.some((s) => s.id === id) || typeof v !== 'object' || v === null) continue;
      const ov = v as Record<string, unknown>;
      const up = noUpgrades();
      const saved = (typeof ov.upgrades === 'object' && ov.upgrades !== null ? ov.upgrades : {}) as Record<string, unknown>;
      for (const k of UPGRADE_KEYS) up[k] = Math.floor(num(saved[k], 0, 0, MAX_UPGRADE_LEVEL));
      vehicles[id] = { upgrades: up, damage: num(ov.damage, 0, 0, 100), fuel: num(ov.fuel, 1, 0, 1) };
    }
  }
  if (Object.keys(vehicles).length === 0) vehicles[STARTING_VEHICLE] = { upgrades: noUpgrades(), damage: 0, fuel: 1 };
  const highScores: Record<string, ScoreEntry[]> = {};
  if (typeof r.highScores === 'object' && r.highScores !== null && !Array.isArray(r.highScores)) {
    for (const [id, list] of Object.entries(r.highScores as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const entries: ScoreEntry[] = [];
      for (const e of list) {
        if (typeof e !== 'object' || e === null) continue;
        const o = e as Record<string, unknown>;
        if (typeof o.score !== 'number' || !Number.isFinite(o.score) || o.score < 0) continue;
        entries.push({ score: Math.round(o.score), vehicle: typeof o.vehicle === 'string' ? o.vehicle : STARTING_VEHICLE, when: num(o.when, 0, 0, 8.64e15) });
      }
      entries.sort((a, b) => b.score - a.score);
      if (entries.length) highScores[id] = entries.slice(0, MAX_SCORES_PER_CHALLENGE);
    }
  }
  const completedJobs: Record<string, JobRecord> = {};
  if (typeof r.completedJobs === 'object' && r.completedJobs !== null && !Array.isArray(r.completedJobs)) {
    for (const [id, rec] of Object.entries(r.completedJobs as Record<string, unknown>)) {
      if (typeof rec !== 'object' || rec === null) continue;
      const o = rec as Record<string, unknown>;
      const medal = o.medal === 'bronze' || o.medal === 'silver' || o.medal === 'gold' ? o.medal : null;
      if (!medal) continue;
      completedJobs[id] = { medal, score: Math.floor(num(o.score, 0, 0, 1e9)), count: Math.max(1, Math.floor(num(o.count, 1, 1, 1e6))) };
    }
  }
  const selected = typeof r.selectedVehicle === 'string' && r.selectedVehicle in vehicles ? r.selectedVehicle : Object.keys(vehicles)[0];
  return {
    version: PROFILE_VERSION,
    money: Math.floor(num(r.money, STARTING_MONEY, 0, 1e9)),
    reputation: Math.floor(num(r.reputation, 0, -1e6, 1e6)),
    selectedVehicle: selected,
    vehicles,
    highScores,
    completedJobs,
  };
}
