import { VehicleSpec } from '../vehicles/VehicleSpec';

export type TransmissionMode = 'auto' | 'manual';

export const GEAR_COUNT = 6;
/**
 * Fraction of top speed reached at the redline of each gear. Gear 6 is an overdrive: top speed comes from drag and
 * the speed limiter at about 91% revs, so cruising flat out in top gear is not sitting on the redline (which would
 * overheat the engine).
 */
const GEAR_FRACTIONS = [0.2, 0.36, 0.53, 0.7, 0.86, 1.1];
const SHIFT_TIME = 0.25;
const AUTO_COOLDOWN = 0.5;

/** Gear selection, RPM calculation and shift behaviour (automatic by default). */
export class Transmission {
  mode: TransmissionMode = 'auto';
  gear = 1;
  /** Remaining time of the current shift (torque is cut while > 0). */
  shiftTimer = 0;
  rpm: number;
  private cooldown = 0;

  constructor(private spec: VehicleSpec) {
    this.rpm = spec.idleRpm;
  }

  setSpec(spec: VehicleSpec): void {
    this.spec = spec;
  }

  get shifting(): boolean {
    return this.shiftTimer > 0;
  }

  /** Speed (km/h) at which `gear` hits the redline. */
  gearMaxKph(gear: number): number {
    return this.spec.topSpeedKph * GEAR_FRACTIONS[gear - 1];
  }

  /** Normalised RPM 0..1 (can exceed 1 into the limiter) for a speed in a given gear. */
  rpmNorm(speedKph: number, throttle: number, gear = this.gear): number {
    const speedNorm = speedKph / this.gearMaxKph(gear);
    // Clutch slip at low speed lets the engine rev with the throttle.
    const slip = throttle * 0.4 * Math.max(0, 1 - speedNorm * 2.5);
    return Math.max(speedNorm, slip);
  }

  toggleMode(): void {
    this.mode = this.mode === 'auto' ? 'manual' : 'auto';
  }

  private shiftTo(g: number): boolean {
    if (g < 1 || g > GEAR_COUNT || g === this.gear) return false;
    this.gear = g;
    this.shiftTimer = this.spec.shiftTime ?? SHIFT_TIME;
    this.cooldown = AUTO_COOLDOWN;
    return true;
  }

  /** Returns true if a gear change happened this frame (for audio/FX). */
  update(dt: number, speedKph: number, throttle: number, brake: number, gearUp: boolean, gearDown: boolean): boolean {
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    let shifted = false;

    if (this.mode === 'manual') {
      if (gearUp) shifted = this.shiftTo(this.gear + 1);
      else if (gearDown && this.rpmNorm(speedKph, 0, this.gear - 1) <= 1.1) shifted = this.shiftTo(this.gear - 1);
    } else if (this.cooldown === 0 && !this.shifting) {
      const r = this.rpmNorm(speedKph, throttle);
      if (r > 0.94 && this.gear < GEAR_COUNT && throttle > 0.05) shifted = this.shiftTo(this.gear + 1);
      else if (this.gear > 1) {
        const lowerRpm = this.rpmNorm(speedKph, throttle, this.gear - 1);
        const kickdown = throttle > 0.9 && r < 0.55 && lowerRpm < 0.95;
        const lugging = r < 0.38 && lowerRpm < 0.85;
        if (kickdown || lugging || (brake > 0.5 && r < 0.5 && lowerRpm < 0.9)) shifted = this.shiftTo(this.gear - 1);
      }
    }

    // Engine speed follows the target with a little inertia.
    const { idleRpm, redlineRpm } = this.spec;
    const target = idleRpm + (redlineRpm - idleRpm) * Math.min(1.05, this.rpmNorm(speedKph, throttle));
    this.rpm += (target - this.rpm) * Math.min(1, dt * 12);
    return shifted;
  }

  /** Engine torque multiplier for a normalised RPM; zero at the rev limiter. */
  static torque(rpmNorm: number): number {
    if (rpmNorm >= 1) return 0;
    return 0.65 + 0.35 * Math.sin(Math.PI * Math.max(0, rpmNorm));
  }
}
