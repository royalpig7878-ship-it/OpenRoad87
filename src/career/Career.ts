import { ArcadeResult } from '../arcade/ArcadeSession';
import { Medal } from '../arcade/Challenges';
import { getPoliceLevel } from '../police/PoliceData';
import { kphToMph } from '../systems/units';
import { VehicleSpec } from '../vehicles/VehicleSpec';
import { FIRST_CLEAR_BONUS, JOBS, JobDef, JobRequirements, MEDAL_PAY_MULT, REPLAY_PAY_FRACTION } from './Jobs';

/** Reputation ranks (the thresholds are the reputation needed to reach each). */
export const RANKS = [
  { name: 'ROOKIE', rep: 0 },
  { name: 'COURIER', rep: 50 },
  { name: 'DRIVER', rep: 150 },
  { name: 'ACE', rep: 300 },
  { name: 'LEGEND', rep: 600 },
];

/** Reputation needed to unlock each road for career jobs. */
export const ENV_UNLOCK_REP: Record<string, number> = { mountain: 0, country: 0, forest: 50, coastal: 90, desert: 120, night: 150, neon: 200 };

/** The slice of the player profile that career mode reads and changes. */
export interface CareerProfile {
  money: number;
  reputation: number;
  /** Best result per completed job. */
  completedJobs: Record<string, { medal: Medal; score: number; count: number }>;
}

export function rankFor(rep: number): { index: number; name: string; next: { name: string; rep: number } | null } {
  let index = 0;
  RANKS.forEach((r, i) => {
    if (rep >= r.rep) index = i;
  });
  return { index, name: RANKS[index].name, next: RANKS[index + 1] ?? null };
}

export const isEnvUnlocked = (rep: number, envId: string): boolean => rep >= (ENV_UNLOCK_REP[envId] ?? 0);

/** Roads that open between two reputation values. */
export const newlyUnlockedEnvs = (before: number, after: number): string[] =>
  Object.entries(ENV_UNLOCK_REP).filter(([, need]) => before < need && after >= need).map(([id]) => id);

export interface RequirementCheck {
  label: string;
  need: string;
  have: string;
  ok: boolean;
}

/** Compares a car (with upgrades) to a job's requirements, one line per requirement. */
export function checkRequirements(spec: VehicleSpec, req: JobRequirements): RequirementCheck[] {
  const out: RequirementCheck[] = [];
  if (req.minTopSpeedKph !== undefined) out.push({ label: 'TOP SPEED', need: `${Math.round(kphToMph(req.minTopSpeedKph))} MPH`, have: `${Math.round(kphToMph(spec.topSpeedKph))} MPH`, ok: spec.topSpeedKph >= req.minTopSpeedKph });
  if (req.minAcceleration !== undefined) out.push({ label: 'ACCELERATION', need: `${req.minAcceleration}`, have: spec.acceleration.toFixed(0), ok: Math.round(spec.acceleration * 10) / 10 >= req.minAcceleration });
  if (req.minHandling !== undefined) out.push({ label: 'HANDLING', need: req.minHandling.toFixed(2), have: spec.handling.toFixed(2), ok: spec.handling >= req.minHandling - 1e-9 });
  if (req.minFuelCapacity !== undefined) out.push({ label: 'FUEL TANK', need: `${req.minFuelCapacity} L`, have: `${Math.round(spec.fuelCapacity)} L`, ok: spec.fuelCapacity >= req.minFuelCapacity });
  if (req.minToughness !== undefined) out.push({ label: 'TOUGHNESS', need: req.minToughness.toFixed(2), have: spec.damageResistance.toFixed(2), ok: spec.damageResistance >= req.minToughness - 1e-9 });
  return out;
}

/** Cars above this damage cannot start a job (repair first). */
export const MAX_START_DAMAGE = 75;

export type JobStatus = { state: 'available' } | { state: 'locked'; reason: string } | { state: 'blocked'; reason: string };

/** Can the player start this job right now with this car? Gives the reason if not. */
export function jobStatus(job: JobDef, rep: number, spec: VehicleSpec, damage: number): JobStatus {
  if (rep < job.minRep) return { state: 'locked', reason: `NEED REPUTATION ${job.minRep}` };
  if (!isEnvUnlocked(rep, job.challenge.env)) return { state: 'locked', reason: `ROAD LOCKED (REP ${ENV_UNLOCK_REP[job.challenge.env]})` };
  const failed = checkRequirements(spec, job.requirements).find((c) => !c.ok);
  if (failed) return { state: 'blocked', reason: `CAR NEEDS ${failed.label} ${failed.need}` };
  if (damage >= MAX_START_DAMAGE) return { state: 'blocked', reason: 'CAR TOO DAMAGED - REPAIR FIRST' };
  return { state: 'available' };
}

/** Cash for a result: bronze pay x medal multiplier, with a first-clear bonus and a reduced replay rate. */
export function payFor(job: JobDef, medal: Medal, firstClear: boolean): number {
  const base = job.pay * MEDAL_PAY_MULT[medal];
  return Math.round((firstClear ? base * FIRST_CLEAR_BONUS : base * REPLAY_PAY_FRACTION) / 10) * 10;
}

/** Reputation for a result: tier-based, plus a bonus for a better medal. Replays pay a little. */
export function repFor(job: JobDef, medal: Medal, firstClear: boolean): number {
  if (medal === 'none') return 0;
  const bonus = medal === 'gold' ? 8 : medal === 'silver' ? 4 : 0;
  const full = job.tier * 12 + bonus;
  return firstClear ? full : Math.max(1, Math.round(full * 0.25));
}

export interface CareerOutcome {
  success: boolean;
  medal: Medal;
  cash: number;
  fine: number;
  rep: number;
  firstClear: boolean;
  rankBefore: string;
  rankAfter: string;
  rankedUp: boolean;
  unlockedEnvs: string[];
  /** Jobs that became available because reputation rose. */
  unlockedJobs: string[];
}

/**
 * Applies the result of a job to the profile: pays cash and reputation for success, charges a fine if the
 * police busted you, records the best result, and reports what changed (rank, unlocked roads and jobs).
 */
export function completeJob(profile: CareerProfile, job: JobDef, result: ArcadeResult): CareerOutcome {
  const repBefore = profile.reputation;
  const prior = profile.completedJobs[job.id];
  const success = result.success && result.medal !== 'none';
  const firstClear = success && !prior;
  const cash = success ? payFor(job, result.medal, firstClear) : 0;
  const rep = success ? repFor(job, result.medal, firstClear) : 0;
  let fine = 0;
  if (result.outcome === 'busted' && job.challenge.police) fine = Math.min(profile.money, Math.round(getPoliceLevel(job.challenge.police.level).fine / 2));

  profile.money = profile.money - fine + cash;
  profile.reputation += rep;
  if (success) {
    const better = !prior || result.score > prior.score;
    profile.completedJobs[job.id] = {
      medal: !prior || MEDAL_ORDER[result.medal] > MEDAL_ORDER[prior.medal] ? result.medal : prior.medal,
      score: better ? result.score : prior!.score,
      count: (prior?.count ?? 0) + 1,
    };
  }
  const before = rankFor(repBefore);
  const after = rankFor(profile.reputation);
  const jobsNow = new Set(JOBS.filter((j) => profile.reputation >= j.minRep).map((j) => j.id));
  const jobsBefore = new Set(JOBS.filter((j) => repBefore >= j.minRep).map((j) => j.id));
  return {
    success, medal: success ? result.medal : 'none', cash, fine, rep, firstClear,
    rankBefore: before.name, rankAfter: after.name, rankedUp: after.index > before.index,
    unlockedEnvs: newlyUnlockedEnvs(repBefore, profile.reputation),
    unlockedJobs: [...jobsNow].filter((id) => !jobsBefore.has(id)),
  };
}

const MEDAL_ORDER: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };
