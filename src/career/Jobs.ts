import { ChallengeDef, ChallengeKind } from '../arcade/Challenges';
import { DifficultyName } from '../traffic/TrafficData';

/** What a car must be able to do to take a job (checked against the car with its upgrades). */
export interface JobRequirements {
  minTopSpeedKph?: number;
  minAcceleration?: number;
  minHandling?: number;
  minFuelCapacity?: number;
  minToughness?: number;
}

/** A career job: a client, an arcade-style event with its own rules, requirements and pay. */
export interface JobDef {
  id: string;
  name: string;
  client: string;
  blurb: string;
  /** 1 (easy) .. 5 (elite). Higher tiers need more reputation. */
  tier: number;
  /** Reputation needed before the job appears as available. */
  minRep: number;
  requirements: JobRequirements;
  /** Cash for a bronze result; silver and gold pay more. */
  pay: number;
  /** The rules the event runs under (the same engine as arcade challenges). */
  challenge: ChallengeDef;
}

export const MEDAL_PAY_MULT = { none: 0, bronze: 1, silver: 1.3, gold: 1.7 } as const;
/** Replaying a job you have already cleared pays this fraction. */
export const REPLAY_PAY_FRACTION = 0.6;
/** First-time clears pay a bonus. */
export const FIRST_CLEAR_BONUS = 1.25;

const TIER_REP = [0, 0, 50, 150, 300, 600];

interface TrialOpts { id: string; name: string; client: string; blurb: string; tier: number; env: string; km: number; traffic: DifficultyName; pay: number; req?: JobRequirements }

/** A point-to-point run to a finish gate. */
function trial(o: TrialOpts): JobDef {
  const D = o.km * 1000;
  return {
    id: o.id, name: o.name, client: o.client, blurb: o.blurb, tier: o.tier, minRep: TIER_REP[o.tier], requirements: o.req ?? {}, pay: o.pay,
    challenge: {
      id: `job_${o.id}`, name: o.name, kind: 'time_trial', blurb: o.blurb, env: o.env, timeLimit: Math.round(D / (31 + o.tier * 2.5)) + 8, targetM: D, trafficLevel: o.traffic,
      medals: { bronze: Math.round(D * 1.2), silver: Math.round(D * 1.85), gold: Math.round(D * 2.7) },
    },
  };
}

interface SimpleOpts { id: string; name: string; client: string; blurb: string; tier: number; kind: Exclude<ChallengeKind, 'time_trial'>; env: string; time: number; traffic: DifficultyName; pay: number; medals: [number, number, number]; req?: JobRequirements; extra?: Partial<ChallengeDef> }

function simple(o: SimpleOpts): JobDef {
  return {
    id: o.id, name: o.name, client: o.client, blurb: o.blurb, tier: o.tier, minRep: TIER_REP[o.tier], requirements: o.req ?? {}, pay: o.pay,
    challenge: { id: `job_${o.id}`, name: o.name, kind: o.kind, blurb: o.blurb, env: o.env, timeLimit: o.time, trafficLevel: o.traffic, medals: { bronze: o.medals[0], silver: o.medals[1], gold: o.medals[2] }, ...o.extra },
  };
}

export const JOBS: JobDef[] = [
  // ---- Tier 1: Rookie ----
  trial({ id: 'pizza', name: 'Pizza Express', client: 'LUIGI\'S PIZZERIA', blurb: 'A hot order needs to cross the mountain before it goes cold. 2 km, no excuses.', tier: 1, env: 'mountain', km: 2, traffic: 'easy', pay: 400 }),
  simple({ id: 'mail', name: 'Mail Run', client: 'POSTAL SERVICE', blurb: 'Hit every checkpoint to keep the sorting office on schedule.', tier: 1, kind: 'checkpoint', env: 'country', time: 45, traffic: 'easy', pay: 450, medals: [3500, 6500, 10000], extra: { maxTimeS: 150, checkpoint: { everyM: 800, bonusS: 18 } } }),
  simple({ id: 'cruise', name: 'Weekend Cruise', client: 'RICH TOURIST', blurb: 'Show a visitor the countryside. Cover as much road as you can in 90 seconds.', tier: 1, kind: 'distance', env: 'country', time: 90, traffic: 'easy', pay: 350, medals: [3500, 5500, 8000] }),
  // ---- Tier 2: Courier (rep 50) ----
  trial({ id: 'parts', name: 'Parts Delivery', client: 'GARAGE 9', blurb: 'A race team needs a gearbox at the finish of the forest road. 3 km.', tier: 2, env: 'forest', km: 3, traffic: 'normal', pay: 900, req: { minTopSpeedKph: 200 } }),
  simple({ id: 'rushhour', name: 'Rush Hour Courier', client: 'DOWNTOWN LEGAL', blurb: 'Weave through heavy traffic with documents on the seat. Survive 60 seconds.', tier: 2, kind: 'survival', env: 'mountain', time: 60, traffic: 'hard', pay: 950, medals: [3000, 5500, 8500] }),
  simple({ id: 'dodge', name: 'Patrol Dodge', client: 'NO QUESTIONS ASKED', blurb: 'Highway Patrol is already behind you. Lose them in the forest.', tier: 2, kind: 'police_escape', env: 'forest', time: 120, traffic: 'normal', pay: 1000, medals: [3500, 6500, 10000], extra: { police: { level: 1, startPursuit: true } } }),
  // ---- Tier 3: Driver (rep 150) ----
  trial({ id: 'freight', name: 'Overnight Freight', client: 'NIGHTHAULER INC', blurb: 'A long night run on the expressway. You will want a big tank. 4 km.', tier: 3, env: 'night', km: 4, traffic: 'normal', pay: 1800, req: { minFuelCapacity: 55 } }),
  simple({ id: 'express', name: 'Coastal Express', client: 'SEASIDE HOTEL', blurb: 'Keep above 112 mph along the coast to make the dinner reservation.', tier: 3, kind: 'high_speed', env: 'coastal', time: 110, traffic: 'normal', pay: 1900, medals: [5000, 8000, 12000], req: { minTopSpeedKph: 230 }, extra: { speed: { minKph: 180, meterS: 8 } } }),
  simple({ id: 'hotwheels', name: 'Desert Dash', client: 'DUSTY\'S PARTS', blurb: 'Gate to gate across the desert. You need a car that jumps off the line.', tier: 3, kind: 'checkpoint', env: 'desert', time: 50, traffic: 'normal', pay: 1700, medals: [5500, 9500, 15000], req: { minAcceleration: 24 }, extra: { maxTimeS: 200, checkpoint: { everyM: 1000, bonusS: 16 } } }),
  // ---- Tier 4: Ace (rep 300) ----
  trial({ id: 'passrace', name: 'Mountain Pass Race', client: 'ALPINE RACING CLUB', blurb: 'Twisty and tight. 4 km against a hard clock, in heavy traffic. Handling matters.', tier: 4, env: 'mountain', km: 4, traffic: 'hard', pay: 3200, req: { minHandling: 0.85 } }),
  simple({ id: 'intercept', name: 'Interceptor Evasion', client: 'ANONYMOUS CLIENT', blurb: 'Interceptors are on you. Run for the forest and lose them.', tier: 4, kind: 'police_escape', env: 'forest', time: 120, traffic: 'normal', pay: 3400, medals: [4500, 8000, 12500], req: { minTopSpeedKph: 245 }, extra: { police: { level: 3, startPursuit: true } } }),
  simple({ id: 'marathon', name: 'Desert Marathon', client: 'EXPEDITION CO.', blurb: 'The longest haul: 200 seconds across the desert with only one tank.', tier: 4, kind: 'distance', env: 'desert', time: 200, traffic: 'normal', pay: 3000, medals: [9000, 14000, 20000], req: { minFuelCapacity: 65 } }),
  // ---- Tier 5: Legend (rep 600) ----
  simple({ id: 'royale', name: 'Redline Royale', client: 'THE SYNDICATE', blurb: 'Stay above 124 mph on the coast. Only the fastest cars survive this.', tier: 5, kind: 'high_speed', env: 'coastal', time: 120, traffic: 'hard', pay: 6000, medals: [7000, 11000, 16500], req: { minTopSpeedKph: 270 }, extra: { speed: { minKph: 200, meterS: 8 } } }),
  simple({ id: 'elite', name: 'Elite Pursuit', client: 'FEDERAL TASK FORCE', blurb: 'The Elite Pursuit Unit wants you. Only a tuned supercar can outrun them.', tier: 5, kind: 'police_escape', env: 'mountain', time: 120, traffic: 'normal', pay: 6500, medals: [5000, 9000, 14000], req: { minTopSpeedKph: 320 }, extra: { police: { level: 4, startPursuit: true } } }),
  trial({ id: 'grandtour', name: 'Grand Tour', client: 'MAGAZINE TEST DRIVE', blurb: 'Six hard kilometres at night. Fast, tough and grippy: the ultimate road test.', tier: 5, env: 'night', km: 6, traffic: 'hard', pay: 5800, req: { minTopSpeedKph: 275, minHandling: 0.95, minToughness: 1.15 } }),
];

export const getJob = (id: string): JobDef | undefined => JOBS.find((j) => j.id === id);
