/**
 * Pure audio maths (no WebAudio): engine voices per car, and how driving state maps to sound levels.
 * Kept free of browser APIs so it can be unit-tested headlessly (`npm run sim:audio`).
 */

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Describes how one engine sounds. Each car's `VehicleSpec.engineSound` names one of these. */
export interface EngineProfile {
  id: string;
  /** Cylinder count: sets the pitch (a 4-stroke fires cylinders/2 times per revolution). */
  cylinders: number;
  /** Mix of the three tone layers (0..1): sawtooth body, square edge, sine sub-bass. */
  saw: number;
  square: number;
  sub: number;
  /** Slight detune between the two main oscillators in cents (lumpy idle on big V engines). */
  detuneCents: number;
  /** Intake/exhaust noise (0..1). */
  noise: number;
  /** Low-pass cutoff at idle / at redline with full throttle (Hz). */
  cutoffIdle: number;
  cutoffMax: number;
  /** Turbo whistle level (0 = none). */
  whistle: number;
  /** Amount of cylinder-by-cylinder amplitude wobble at low rpm (0..1). */
  lumpy: number;
  /** Pitch multiplier so engines do not all sit in the same octave. */
  pitchScale: number;
  /** Overall loudness trim. */
  level: number;
}

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  // Vortex GT: balanced V6.
  engine_v6: { id: 'engine_v6', cylinders: 6, saw: 0.8, square: 0.35, sub: 0.4, detuneCents: 6, noise: 0.25, cutoffIdle: 520, cutoffMax: 3200, whistle: 0, lumpy: 0.2, pitchScale: 1, level: 1 },
  // Night Hawk: smooth inline six.
  engine_i6: { id: 'engine_i6', cylinders: 6, saw: 0.65, square: 0.2, sub: 0.35, detuneCents: 2, noise: 0.2, cutoffIdle: 600, cutoffMax: 3800, whistle: 0, lumpy: 0.08, pitchScale: 1.12, level: 0.95 },
  // Apex XR: raspy flat six.
  engine_flat6: { id: 'engine_flat6', cylinders: 6, saw: 0.9, square: 0.55, sub: 0.3, detuneCents: 11, noise: 0.35, cutoffIdle: 650, cutoffMax: 4600, whistle: 0, lumpy: 0.35, pitchScale: 0.9, level: 1 },
  // Thunder V8: deep, lumpy muscle.
  engine_v8: { id: 'engine_v8', cylinders: 8, saw: 0.85, square: 0.3, sub: 0.7, detuneCents: 16, noise: 0.3, cutoffIdle: 420, cutoffMax: 2600, whistle: 0, lumpy: 0.55, pitchScale: 0.72, level: 1.05 },
  // Silverline Turbo: buzzy four with a turbo whistle.
  engine_turbo4: { id: 'engine_turbo4', cylinders: 4, saw: 0.75, square: 0.5, sub: 0.2, detuneCents: 4, noise: 0.3, cutoffIdle: 700, cutoffMax: 5200, whistle: 0.7, lumpy: 0.15, pitchScale: 1.6, level: 0.9 },
  // Phantom X: smooth, high-pitched V12.
  engine_v12: { id: 'engine_v12', cylinders: 12, saw: 0.55, square: 0.25, sub: 0.45, detuneCents: 3, noise: 0.18, cutoffIdle: 700, cutoffMax: 5600, whistle: 0, lumpy: 0.05, pitchScale: 0.82, level: 0.95 },
};

export const FALLBACK_ENGINE = 'engine_v6';
export const engineProfile = (id: string): EngineProfile => ENGINE_PROFILES[id] ?? ENGINE_PROFILES[FALLBACK_ENGINE];

/** Fundamental (firing) frequency in Hz for an engine at `rpm`. */
export const firingHz = (p: EngineProfile, rpm: number): number => ((Math.max(rpm, 0) / 60) * (p.cylinders / 2)) * p.pitchScale;

export interface EngineTargets {
  hz: number;
  /** Master gain of the engine voice, 0..1. */
  gain: number;
  cutoff: number;
  noiseGain: number;
  whistleHz: number;
  whistleGain: number;
  /** Amplitude wobble depth 0..1 and its rate in Hz (cylinder lumpiness, or limiter stutter). */
  wobbleDepth: number;
  wobbleHz: number;
  /** True when bouncing off the rev limiter. */
  limiter: boolean;
}

/** How the engine should sound given revs and throttle. Idle is quiet and dark; full throttle at redline is bright and loud. */
export function engineTargets(p: EngineProfile, rpm: number, idleRpm: number, redlineRpm: number, throttle: number, shifting: boolean): EngineTargets {
  const r = clamp((rpm - idleRpm) / Math.max(1, redlineRpm - idleRpm), 0, 1);
  const load = clamp(throttle, 0, 1);
  const limiter = rpm >= redlineRpm * 0.985 && load > 0.5;
  const base = 0.22 + 0.4 * r + 0.38 * load * (0.4 + 0.6 * r);
  return {
    hz: firingHz(p, rpm),
    gain: clamp(base * p.level * (shifting ? 0.35 : 1), 0, 1),
    cutoff: lerp(p.cutoffIdle, p.cutoffMax, clamp(0.55 * r + 0.45 * load, 0, 1)),
    noiseGain: p.noise * (0.05 + 0.5 * load * (0.3 + r)),
    whistleHz: 1800 + 3200 * r,
    whistleGain: p.whistle * clamp((r - 0.25) / 0.75, 0, 1) * load * 0.18,
    wobbleDepth: limiter ? 0.55 : p.lumpy * (1 - r) * 0.35,
    wobbleHz: limiter ? 16 : firingHz(p, rpm) / (p.cylinders / 2) / 2,
    limiter,
  };
}

/** Frequency stays below this so extreme rpm values never produce ultrasonic or crashing values. */
export const MAX_ENGINE_HZ = 2400;

export type SurfaceKind = 'road' | 'shoulder' | 'grass';

/** One police siren the player can hear. `closingKph` is positive when the unit is approaching. */
export interface SirenSource {
  distanceM: number;
  closingKph: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
}

/** Everything the continuous driving sounds depend on. */
export interface DriveAudioFrame {
  speedKph: number;
  topSpeedKph: number;
  rpm: number;
  idleRpm: number;
  redlineRpm: number;
  throttle: number;
  brake: number;
  skidding: boolean;
  surface: SurfaceKind;
  shifting: boolean;
  /** 0..1 rain intensity. */
  rain: number;
  /** 0..1: how many traffic cars are alongside right now. */
  trafficProximity: number;
  /** Loudest audible siren, or null. */
  siren: SirenSource | null;
  /** 0..100 damage: rattles and a rougher idle. */
  damage: number;
  outOfFuel: boolean;
}

export interface MixTargets {
  tireGain: number;
  tireHz: number;
  windGain: number;
  windCutoff: number;
  rumbleGain: number;
  rumbleRateHz: number;
  rainGain: number;
  trafficGain: number;
  sirenGain: number;
  sirenPitch: number;
  sirenPan: number;
  rattleGain: number;
}

/** Doppler pitch factor for a source closing at `closingKph` (positive = approaching). Clamped to a pleasant range. */
export function dopplerFactor(closingKph: number): number {
  const v = closingKph / 3.6;
  return clamp(343 / (343 - clamp(v, -120, 120)), 0.8, 1.25);
}

/** Siren loudness by distance: audible out to about 600 m. */
export const sirenLevel = (distanceM: number): number => clamp(1 - Math.max(0, distanceM) / 600, 0, 1) ** 1.5;

/** The two-tone "yelp" siren: alternates a high and low pitch, with a quick slide between them. */
export function sirenHz(timeSec: number): number {
  const phase = (timeSec * 2.2) % 1; // about 2.2 cycles per second
  const hi = 960, lo = 640;
  const slide = clamp(phase * 6, 0, 1); // slide up in the first sixth, then hold
  const down = clamp((phase - 0.5) * 6, 0, 1);
  return lerp(lo, hi, slide) + (lo - hi) * down;
}

/** Turns driving state into target levels for the continuous sound layers. */
export function mixTargets(f: DriveAudioFrame): MixTargets {
  const speedN = clamp(f.speedKph / Math.max(1, f.topSpeedKph), 0, 1.2);
  const moving = clamp(f.speedKph / 25, 0, 1);
  // Tyre squeal: only when skidding, louder and higher with speed; hard braking at speed also chirps.
  const brakeSqueal = f.brake > 0.85 && f.speedKph > 120 ? 0.35 : 0;
  const tire = f.skidding ? clamp(0.3 + speedN * 0.7, 0, 1) : brakeSqueal;
  const offRoad = f.surface === 'grass' ? 1 : f.surface === 'shoulder' ? 0.55 : 0;
  const sir = f.siren ? sirenLevel(f.siren.distanceM) : 0;
  return {
    tireGain: tire * moving * (f.surface === 'grass' ? 0.4 : 1),
    tireHz: 1500 + speedN * 1300,
    windGain: clamp(speedN, 0, 1) ** 1.6 * 0.55,
    windCutoff: 300 + speedN * 3400,
    rumbleGain: offRoad * moving * clamp(0.35 + speedN, 0, 1),
    rumbleRateHz: 4 + f.speedKph / 14,
    rainGain: clamp(f.rain, 0, 1) * 0.45,
    trafficGain: clamp(f.trafficProximity, 0, 1) * 0.5 * moving,
    sirenGain: sir * 0.5,
    sirenPitch: f.siren ? dopplerFactor(f.siren.closingKph) : 1,
    sirenPan: f.siren ? clamp(f.siren.pan, -1, 1) : 0,
    rattleGain: clamp((f.damage - 35) / 65, 0, 1) * moving * 0.4,
  };
}

/** Exponential-style smoothing used for all level changes: returns the new value after `dt` seconds. */
export function smooth(current: number, target: number, dt: number, ratePerSec = 12): number {
  return current + (target - current) * (1 - Math.exp(-ratePerSec * Math.max(0, dt)));
}

/** Impact loudness 0..1 from a collision speed. */
export const impactLevel = (impactKph: number): number => clamp(impactKph / 90, 0.25, 1);
