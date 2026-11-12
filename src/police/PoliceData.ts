import { TrafficType } from '../traffic/TrafficData';

/** The police cruiser's size matches police_cruiser_back_*.png (from traffic.json). */
export const POLICE_TYPE: TrafficType = {
  id: 'police',
  name: 'Police Cruiser',
  texture: 'police_cruiser_back_off',
  widthM: 1.9,
  lengthM: 5.3,
  minKph: 0,
  maxKph: 0,
  weight: 0,
  mirrorColor: 0x15171f,
};

/** Light-bar sprite for each phase of the siren (and the lights-off look for patrol cars). */
export const POLICE_TEXTURES = ['police_cruiser_back_off', 'police_cruiser_back_red', 'police_cruiser_back_blue', 'police_cruiser_back_on'] as const;

/** One difficulty level of police. Higher levels are faster, tighter, and try to block you. */
export interface PoliceLevel {
  id: number;
  name: string;
  /** Top speed of the cruisers, km/h. */
  topKph: number;
  /** Acceleration / braking, km/h per second. */
  accel: number;
  brake: number;
  /** Stay this close (world units) to start the bust meter. */
  catchRadius: number;
  /** Seconds the police must stay on you to arrest you. */
  bustTime: number;
  /** Chance per second (when positioned to) that a cruiser tries to get ahead and block you. */
  blockChance: number;
  /** Most cruisers in a pursuit at once. */
  maxUnits: number;
  /** Heat-gain multiplier while speeding (higher = police notice you sooner). */
  heatGain: number;
  /** Cash for escaping, fine for being busted. */
  reward: number;
  fine: number;
}

export const POLICE_LEVELS: PoliceLevel[] = [
  { id: 1, name: 'Highway Patrol', topKph: 195, accel: 14, brake: 40, catchRadius: 2200, bustTime: 4.5, blockChance: 0, maxUnits: 1, heatGain: 0.8, reward: 500, fine: 300 },
  { id: 2, name: 'State Troopers', topKph: 228, accel: 18, brake: 44, catchRadius: 2200, bustTime: 4.0, blockChance: 0.12, maxUnits: 2, heatGain: 1.0, reward: 1200, fine: 700 },
  { id: 3, name: 'Interceptors', topKph: 258, accel: 22, brake: 48, catchRadius: 2400, bustTime: 3.4, blockChance: 0.25, maxUnits: 3, heatGain: 1.2, reward: 2500, fine: 1500 },
  { id: 4, name: 'Elite Pursuit Unit', topKph: 290, accel: 28, brake: 52, catchRadius: 2600, bustTime: 3.0, blockChance: 0.4, maxUnits: 4, heatGain: 1.5, reward: 5000, fine: 3000 },
];

export const getPoliceLevel = (id: number): PoliceLevel => POLICE_LEVELS[Math.min(POLICE_LEVELS.length, Math.max(1, id)) - 1];

/** How far over the limit (km/h) you can go before police care (about 12 mph). */
export const SPEED_TOLERANCE = 20;
/** Heat at which a pursuit starts. */
export const HEAT_LIMIT = 100;
