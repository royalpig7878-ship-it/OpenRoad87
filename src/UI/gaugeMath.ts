/**
 * Pure helpers mapping vehicle values to gauge needle angles (degrees, Phaser convention:
 * 0 = pointing right, increasing clockwise). Sweeps match cockpits/placements.json.
 */

/** Dial sweeps in degrees: [start, end]. */
export const SWEEP = {
  rpm: [135, 405],
  speedo: [135, 405],
  fuel: [210, 330],
  temp: [210, 330],
} as const;

/** What the printed dial faces show at the end of their scale. */
export const DIAL_MAX_RPM = 8000;
export const DIAL_MAX_MPH = 160;
const KPH_TO_MPH = 0.621371;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function angleFor(sweep: readonly [number, number], frac: number, overshoot: number): number {
  const f = clamp(frac, 0, 1 + overshoot);
  return sweep[0] + (sweep[1] - sweep[0]) * f;
}

/** Tachometer needle. Engines that rev past the printed 8000 deflect a little beyond the scale. */
export const rpmAngle = (rpm: number): number => angleFor(SWEEP.rpm, rpm / DIAL_MAX_RPM, 0.2);

/** Speedometer needle (dial is in mph). Faster cars swing past 160 mph. */
export const speedoAngle = (kph: number): number => angleFor(SWEEP.speedo, (kph * KPH_TO_MPH) / DIAL_MAX_MPH, 0.25);

/** Fuel gauge: 0 = empty (E), 1 = full (F). */
export const fuelAngle = (fuel: number, capacity: number): number => angleFor(SWEEP.fuel, fuel / capacity, 0);

/** Temperature gauge: 0 = cold, 1 = hot. */
export const tempAngle = (t: number): number => angleFor(SWEEP.temp, t, 0);

/** Wheel rotation in degrees for a normalised steering value -1..1. */
/** How far the on-screen wheel turns at full lock. The art has a frame every 5 degrees up to this (spokes may cross the gauges while turning). */
export const MAX_WHEEL_DEGREES = 45;
export const wheelDegrees = (steer: number): number => clamp(steer, -1, 1) * MAX_WHEEL_DEGREES;

/** Moves `current` toward `target` with exponential smoothing (rate per second). */
export const smooth = (current: number, target: number, rate: number, dt: number): number =>
  current + (target - current) * Math.min(1, rate * dt);

/** Which dashboard warning lamps are lit. Index order matches dashboard_warnings.png. */
export interface WarningInputs {
  damage: number;
  fuelFrac: number;
  braking: boolean;
  /** Turn direction currently signalled: -1 left, 1 right, 0 none. */
  signal: -1 | 0 | 1;
  headlights: boolean;
  /** Engine temperature 0..1 (see DrivingModel). */
  engineTemp?: number;
  overheated?: boolean;
  engineBlown?: boolean;
  /** Brakes hot enough to fade. */
  brakeFade?: boolean;
  /** Seconds, used to blink lamps. */
  time: number;
}

export const WARNING_NAMES = ['oil', 'battery', 'engine', 'brake', 'fuel', 'turn', 'beam'] as const;

export function warningStates(w: WarningInputs): boolean[] {
  const blink = Math.floor(w.time * 2.5) % 2 === 0;
  return [
    w.damage > 60 || !!w.overheated || !!w.engineBlown, // oil pressure (lit when overheated or blown)
    w.damage > 85 || !!w.engineBlown, // charging system
    // Check engine: blinks while the engine is hot, solid when overheated/blown or damaged.
    w.damage > 35 || !!w.overheated || !!w.engineBlown || ((w.engineTemp ?? 0) >= 0.78 && blink),
    w.braking || (!!w.brakeFade && blink), // brake lamp (blinks when the brakes fade)
    w.fuelFrac < 0.08 ? blink : w.fuelFrac < 0.2, // low fuel (blinks when nearly empty)
    false, // the strip's single arrow is left dark: directional arrows flank the gear display instead
    w.headlights, // high-beam/lights lamp
  ];
}
