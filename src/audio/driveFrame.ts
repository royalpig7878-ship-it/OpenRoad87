import { DriveAudioFrame, SirenSource, clamp } from './audioMath';

/** The small slice of a traffic/police car that sound needs (kept structural so tests can pass plain objects). */
export interface SoundCar {
  active: boolean;
  z: number;
  x: number;
  speedKph: number;
  sirens?: boolean;
}

export interface DriveFrameInput {
  speedKph: number;
  position: number;
  playerX: number;
  rpm: number;
  throttle: number;
  brake: number;
  skidding: boolean;
  surface: 'road' | 'shoulder' | 'grass';
  shifting: boolean;
  damage: number;
  fuel: number;
  topSpeedKph: number;
  idleRpm: number;
  redlineRpm: number;
  trackLength: number;
  /** World units per metre. */
  unitsPerMetre: number;
  rain: number;
  traffic: SoundCar[];
  police: SoundCar[];
}

/** Signed distance along a looping track from `from` to `to`, in world units, in (-L/2, L/2]. */
export function loopDelta(from: number, to: number, length: number): number {
  let d = (to - from) % length;
  if (d > length / 2) d -= length;
  else if (d <= -length / 2) d += length;
  return d;
}

const NEAR_M = 70;

/** Collects everything the drive sounds need from the game state. */
export function buildDriveFrame(i: DriveFrameInput): DriveAudioFrame {
  let proximity = 0;
  for (const c of i.traffic) {
    if (!c.active) continue;
    const dm = Math.abs(loopDelta(i.position, c.z, i.trackLength)) / i.unitsPerMetre;
    if (dm < NEAR_M && Math.abs(c.x - i.playerX) < 1.8) proximity += 1 - dm / NEAR_M;
  }

  let siren: SirenSource | null = null;
  let bestM = Infinity;
  for (const u of i.police) {
    if (!u.active || !u.sirens) continue;
    const d = loopDelta(i.position, u.z, i.trackLength);
    const dm = Math.abs(d) / i.unitsPerMetre;
    if (dm >= bestM) continue;
    bestM = dm;
    // Approaching = the gap is shrinking: a unit ahead is closing if we are faster; one behind if it is faster.
    const closing = d >= 0 ? i.speedKph - u.speedKph : u.speedKph - i.speedKph;
    siren = { distanceM: dm, closingKph: closing, pan: clamp((u.x - i.playerX) * 0.9, -1, 1) };
  }

  return {
    speedKph: i.speedKph,
    topSpeedKph: i.topSpeedKph,
    rpm: i.rpm,
    idleRpm: i.idleRpm,
    redlineRpm: i.redlineRpm,
    throttle: i.throttle,
    brake: i.brake,
    skidding: i.skidding,
    surface: i.surface,
    shifting: i.shifting,
    rain: i.rain,
    trafficProximity: clamp(proximity * 0.6, 0, 1),
    siren,
    damage: i.damage,
    outOfFuel: i.fuel <= 0,
  };
}
