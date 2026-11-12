import { DifficultyName } from '../traffic/TrafficData';

export type ChallengeKind = 'time_trial' | 'checkpoint' | 'distance' | 'survival' | 'high_speed' | 'police_escape';
export type Medal = 'none' | 'bronze' | 'silver' | 'gold';

/** One arcade challenge: its rules, setting and the scores that earn medals. */
export interface ChallengeDef {
  id: string;
  name: string;
  kind: ChallengeKind;
  blurb: string;
  /** Default environment id (the player can pick another before starting). */
  env: string;
  /** Starting time in seconds (also the hard limit for non-checkpoint challenges). */
  timeLimit: number;
  /** Time trial: distance to the finish line, metres. */
  targetM?: number;
  /** Hard cap on the run's length in seconds (checkpoint time bonuses could otherwise last forever). */
  maxTimeS?: number;
  /** Checkpoint rush: a gate every `everyM` metres adds `bonusS` seconds. */
  checkpoint?: { everyM: number; bonusS: number };
  /** High-speed challenge: stay above `minKph` or the meter (seconds of grace) drains. */
  speed?: { minKph: number; meterS: number };
  trafficLevel: DifficultyName;
  /** Police: level and whether a pursuit is already underway at the start. */
  police?: { level: number; startPursuit: boolean };
  /** Score needed for each medal. */
  medals: { bronze: number; silver: number; gold: number };
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: 'time_trial', name: 'Time Trial', kind: 'time_trial',
    blurb: 'Reach the finish line 3 km away before time runs out. Spare time is worth points.',
    env: 'mountain', timeLimit: 95, targetM: 3000, trafficLevel: 'easy',
    medals: { bronze: 3500, silver: 5500, gold: 8000 },
  },
  {
    id: 'checkpoint', name: 'Checkpoint Rush', kind: 'checkpoint',
    blurb: 'Every checkpoint adds time. Keep it going until the clock hits zero.',
    env: 'desert', timeLimit: 50, maxTimeS: 240, checkpoint: { everyM: 1000, bonusS: 16 }, trafficLevel: 'normal',
    medals: { bronze: 5000, silver: 9000, gold: 14000 },
  },
  {
    id: 'distance', name: 'Long Haul', kind: 'distance',
    blurb: 'Drive as far as you can in 150 seconds.',
    env: 'country', timeLimit: 150, trafficLevel: 'normal',
    medals: { bronze: 6000, silver: 9500, gold: 14000 },
  },
  {
    id: 'survival', name: 'Rush Hour', kind: 'survival',
    blurb: 'Heavy traffic. Survive 90 seconds without wrecking the car. Near misses pay double.',
    env: 'night', timeLimit: 90, trafficLevel: 'extreme',
    medals: { bronze: 4000, silver: 7000, gold: 11000 },
  },
  {
    id: 'high_speed', name: 'Redline', kind: 'high_speed',
    blurb: 'Stay above 106 mph. Slow down and the speed meter drains: run it dry and it is over.',
    env: 'coastal', timeLimit: 120, speed: { minKph: 170, meterS: 8 }, trafficLevel: 'normal',
    medals: { bronze: 5500, silver: 8500, gold: 12500 },
  },
  {
    id: 'police_escape', name: 'Hot Pursuit', kind: 'police_escape',
    blurb: 'The police are already after you. Lose them within 2 minutes. Get busted and it is over.',
    env: 'forest', timeLimit: 120, trafficLevel: 'normal', police: { level: 2, startPursuit: true },
    medals: { bronze: 5000, silver: 8500, gold: 13000 },
  },
];

/**
 * Cash for an arcade medal. Small on purpose: even gold every run pays less per minute than the worst rookie
 * career job, so arcade is for scores and practice and career stays the way to earn.
 */
export const ARCADE_MEDAL_PAY: Record<Medal, number> = { none: 0, bronze: 75, silver: 125, gold: 200 };

export const getChallenge = (id: string): ChallengeDef => CHALLENGES.find((c) => c.id === id) ?? CHALLENGES[0];
