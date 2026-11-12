import { InputState } from '../controls/InputState';
import { RoadEdges } from '../road/RoadLayout';
import { VehicleSpec } from '../vehicles/VehicleSpec';
import { Transmission } from './Transmission';

/** World units travelled per second for each km/h (links physics speed to the road renderer). */
export const WORLD_UNITS_PER_KPH = 45;
/** Speed used to normalise steering/centrifugal effects so all cars share one scale. */
export const REFERENCE_SPEED_KPH = 250;

export type Surface = 'road' | 'shoulder' | 'grass';

/** What the road looks like under the car this frame. */
export interface RoadSample {
  curve: number;
  /** True if a guardrail stands at the shoulder edge on this segment. */
  barrier: boolean;
  /** Which side the barrier is on: 0 = both, -1 = left only, 1 = right only. */
  barrierSide?: -1 | 0 | 1;
}

export type DrivingEvent =
  | 'shift' | 'barrier_hit' | 'traffic_hit' | 'out_of_fuel'
  /** Engine temperature crossed the warning mark (redlining too long). */
  | 'engine_hot'
  /** Engine overheated: limp mode, much less power until it cools. */
  | 'overheat'
  /** Cooled back down after an overheat: full power again. */
  | 'engine_cooled'
  /** Kept redlining while overheated: the engine is dead for the rest of the run. */
  | 'engine_blown'
  /** Manual downshift into a gear too low for the speed: the engine over-revved. */
  | 'over_rev'
  /** Brakes got too hot from hard braking and grip less. */
  | 'brakes_fading';

export interface DrivingState {
  speedKph: number;
  /** Distance along the track, world units (wraps at track length). */
  position: number;
  /** Lateral position: -1/+1 = edges of the paved road. */
  playerX: number;
  /** Current wheel angle -1..1 after inertia and speed-sensitivity. */
  steerAngle: number;
  lateralVel: number;
  /**
   * Which way the car points relative to the road, in road-half-widths of sideways travel per metre driven
   * (0 = along the road). The road turns under the car in a bend; only steering turns the car.
   */
  heading: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  /** Litres remaining. */
  fuel: number;
  /** 0 (perfect) .. 100 (wrecked). */
  damage: number;
  surface: Surface;
  /** True while tyres are past the grip limit (for squeal/smoke effects). */
  skidding: boolean;
  shifting: boolean;
  distanceKm: number;
  /** Engine temperature 0..1: about 0.45 when running normally, warning from ENGINE_HOT, overheated at 1. */
  engineTemp: number;
  /** Overheated (limp mode) until the temperature falls back below ENGINE_RECOVER. */
  overheated: boolean;
  /** The engine is dead: no power until it is towed/repaired. */
  engineBlown: boolean;
  /** Brake temperature 0..1; above BRAKE_FADE the brakes lose bite. */
  brakeTemp: number;
  /** Nitro boost active this frame. */
  boosting: boolean;
  /** Events raised during the most recent update. */
  events: DrivingEvent[];
}

/** How fast a bend turns the road away under the car: heading change per metre driven per unit of curve. */
export const BEND_TURN = 3.7e-4;
/** Heading change per second at full lock (scaled down at speed and by grip/handling). */
const STEER_YAW = 0.12;
/** How quickly the car straightens up on a straight (per second). */
const HEADING_SETTLE = 2.5;
const MAX_HEADING = 0.06;

// ---- Mechanical wear ----
/** Normal running temperature (where the gauge needle sits at a cruise). */
export const ENGINE_NORMAL_TEMP = 0.45;
/** Warning mark: "ENGINE HOT". Reached after roughly 5 s on the rev limiter. */
export const ENGINE_HOT = 0.78;
/** Back to full power once an overheated engine cools below this. */
export const ENGINE_RECOVER = 0.7;
/** Normalised RPM that counts as "on the redline". */
export const REDLINE_NORM = 0.95;
/** Temperature gained per second on the redline under throttle (about 8.5 s from normal to overheated). */
const REDLINE_HEAT = 0.065;
/**
 * Temperature gained per second with the pedal floored but off the redline (automatic gearbox, or a well-shifted
 * manual): about 15 s to "engine hot" and 25 s to overheated. Ease off now and then to keep it cool.
 */
const FLOORED_HEAT = 0.022;
/** Throttle above this counts as "floored". */
export const FLOORED = 0.92;
/** Power left in limp mode while overheated. */
export const LIMP_POWER = 0.45;
/** Seconds of redlining an already-overheated engine before it blows. */
export const BLOW_AFTER = 4;
/** Damage added when the engine blows. */
export const BLOWN_DAMAGE = 25;
export const BRAKE_FADE = 0.7;
/** Nitro boost from a pickup: seconds, extra power, and how far past normal top speed it can push. */
export const BOOST_SECONDS = 4;
const BOOST_POWER = 1.8;
const BOOST_TOP = 1.15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (v: number, target: number, rate: number) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));

/**
 * Arcade-leaning driving model: engine/gearbox acceleration, braking, momentum,
 * steering with inertia and speed-dependent sensitivity, centrifugal push, surface grip,
 * guardrail collisions, fuel use and damage. Pure TypeScript (no Phaser) so it can be unit-simulated.
 */
/** Share of the car's speed that counts as impact when it hits a guardrail (traffic hits use their own rule). */
export const BARRIER_IMPACT_FACTOR = 0.3;

export class DrivingModel {
  readonly transmission: Transmission;
  private barrierCooldown = 0;
  /** Seconds spent redlining or floored while already overheated (blows at BLOW_AFTER). */
  private strain = 0;
  /** Seconds of nitro boost left (from a boost pickup). */
  boostTime = 0;
  state: DrivingState;

  constructor(private spec: VehicleSpec, private edges: RoadEdges, private trackLength: number, startFuel = spec.fuelCapacity, startDamage = 0) {
    this.transmission = new Transmission(spec);
    this.state = {
      speedKph: 0, position: 0, playerX: 0, steerAngle: 0, lateralVel: 0, heading: 0, rpm: spec.idleRpm, gear: 1,
      throttle: 0, brake: 0, fuel: startFuel, damage: startDamage, surface: 'road', skidding: false,
      shifting: false, distanceKm: 0, engineTemp: ENGINE_NORMAL_TEMP, overheated: false, engineBlown: false, brakeTemp: 0.2, boosting: false, events: [],
    };
  }

  get vehicle(): VehicleSpec {
    return this.spec;
  }

  /** Swap vehicle (keeps position, resets speed/fuel/damage). */
  setVehicle(spec: VehicleSpec, damage = 0, fuel = spec.fuelCapacity): void {
    this.spec = spec;
    this.transmission.setSpec(spec);
    this.transmission.gear = 1;
    this.state.speedKph = 0;
    this.state.fuel = Math.min(spec.fuelCapacity, fuel);
    this.state.damage = damage;
    this.state.steerAngle = 0;
    this.state.lateralVel = 0;
    this.state.heading = 0;
    this.resetEngine();
  }

  /** Fresh engine and cool brakes (new car, or towed and fixed). */
  resetEngine(): void {
    const s = this.state;
    s.engineTemp = ENGINE_NORMAL_TEMP;
    s.overheated = false;
    s.engineBlown = false;
    s.brakeTemp = 0.2;
    this.strain = 0;
  }

  /** Use a different road (e.g. another environment): resets position to the start line. */
  setTrackLength(length: number): void {
    this.trackLength = length;
    this.state.position = 0;
    this.state.playerX = 0;
    this.state.heading = 0;
  }

  refuel(): void {
    this.state.fuel = this.spec.fuelCapacity;
  }

  /** Pickups: add fuel (litres, capped at the tank). */
  addFuel(litres: number): void {
    this.state.fuel = Math.min(this.spec.fuelCapacity, this.state.fuel + litres);
  }

  /** Pickups: take some damage off and cool the engine. */
  repairBy(points: number): void {
    const s = this.state;
    s.damage = Math.max(0, s.damage - points);
    s.engineTemp = Math.min(s.engineTemp, ENGINE_NORMAL_TEMP + 0.1);
  }

  /** Pickups: a few seconds of nitro (extra power and a little over normal top speed). */
  startBoost(seconds = BOOST_SECONDS): void {
    this.boostTime = Math.max(this.boostTime, seconds);
  }

  /** Apply collision damage from an impact speed (km/h). Used by barriers now, traffic in Milestone 6. */
  applyImpact(impactKph: number): void {
    this.state.damage = clamp(this.state.damage + (impactKph * 0.2) / this.spec.damageResistance, 0, 100);
  }

  /**
   * Response to hitting a traffic vehicle: damage from the closing speed, speed loss (a rear-end
   * collision drops you to the other car's pace), a shove away from it, and a 'traffic_hit' event.
   */
  applyTrafficHit(hit: { impactKph: number; rearEnd: boolean; side: -1 | 1; carSpeedKph: number }): void {
    const s = this.state;
    this.applyImpact(hit.impactKph * 0.6);
    s.speedKph = hit.rearEnd ? Math.min(s.speedKph * 0.85, Math.max(0, hit.carSpeedKph * 0.9)) : s.speedKph * 0.88;
    s.lateralVel = -hit.side * 1.1;
    s.steerAngle = 0;
    s.events.push('traffic_hit');
  }

  private surfaceAt(x: number): Surface {
    const ax = Math.abs(x);
    if (ax <= this.edges.road) return 'road';
    if (ax <= this.edges.shoulder) return 'shoulder';
    return 'grass';
  }

  update(dtRaw: number, input: InputState, road: RoadSample): DrivingState {
    const dt = clamp(dtRaw, 0, 0.05);
    const s = this.state;
    const spec = this.spec;
    s.events = [];

    const dmg = s.damage / 100;
    const boosting = this.boostTime > 0 && !s.engineBlown;
    this.boostTime = Math.max(0, this.boostTime - dt);
    s.boosting = boosting;
    const powerMult = (1 - 0.4 * dmg) * (s.overheated ? LIMP_POWER : 1) * (boosting ? BOOST_POWER : 1);
    const topEff = spec.topSpeedKph * (1 - 0.25 * dmg) * (boosting ? BOOST_TOP : 1);
    const outOfFuel = s.fuel <= 0;

    // Pedals ramp rather than snap, which gives the car weight.
    const throttleTarget = outOfFuel || s.engineBlown ? 0 : input.throttle;
    s.throttle = approach(s.throttle, throttleTarget, dt * 5);
    s.brake = approach(s.brake, input.brake, dt * 8);

    // Gearbox.
    const gearBefore = this.transmission.gear;
    if (this.transmission.update(dt, s.speedKph, s.throttle, s.brake, input.gearUp, input.gearDown)) {
      s.events.push('shift');
      // Dropping into a gear that is too low for the speed throws the engine past its limit.
      const overRev = this.transmission.gear < gearBefore ? this.transmission.rpmNorm(s.speedKph, 0) : 0;
      if (overRev > 1.02 && !s.engineBlown) {
        s.events.push('over_rev');
        s.damage = clamp(s.damage + ((overRev - 1) * 80) / spec.damageResistance, 0, 100);
        s.engineTemp = Math.min(1, s.engineTemp + 0.05);
      }
    }
    s.gear = this.transmission.gear;
    s.rpm = this.transmission.rpm;
    s.shifting = this.transmission.shifting;
    if (s.engineBlown) s.rpm = 0;

    s.surface = this.surfaceAt(s.playerX);
    const grip = s.surface === 'road' ? 1 : s.surface === 'shoulder' ? 0.88 : 0.55;

    // ---- Longitudinal: engine, drag, braking, surface resistance ----
    const rpmNorm = this.transmission.rpmNorm(s.speedKph, s.throttle);
    const gearMult = lerp(1.7, 0.95, (s.gear - 1) / 5);
    const limiter = clamp(1 - Math.pow(s.speedKph / topEff, 8), 0, 1);
    const drive = s.shifting ? 0 : spec.acceleration * Transmission.torque(rpmNorm) * gearMult * s.throttle * powerMult * limiter;

    const drag = 1.2 + 0.00003 * s.speedKph * s.speedKph;
    const engineBrake = s.throttle < 0.05 && s.speedKph > 0 ? 4 + 8 * clamp(rpmNorm, 0, 1) : 0;
    const fade = 1 - 0.5 * clamp((s.brakeTemp - BRAKE_FADE) / (1 - BRAKE_FADE), 0, 1);
    const braking = spec.braking * s.brake * (0.8 + 0.2 * grip) * fade;
    let resistance = 0;
    if (s.surface === 'shoulder') resistance = 5 + s.speedKph * 0.03;
    else if (s.surface === 'grass') resistance = 18 + s.speedKph * 0.22;

    s.speedKph = Math.max(0, s.speedKph + (drive - drag - engineBrake - braking - resistance) * dt);
    // Soft cap on grass: you can't hold speed in the dirt.
    if (s.surface === 'grass') s.speedKph = Math.min(s.speedKph, Math.max(topEff * 0.45, 0));

    this.updateHeat(dt, rpmNorm);

    // ---- Lateral: steering with inertia, centrifugal push, grip ----
    const speedRef = Math.min(1.3, s.speedKph / REFERENCE_SPEED_KPH);
    const steerSens = lerp(1, 0.5, Math.min(1, speedRef)); // less twitchy at speed
    const steerTarget = input.steer * steerSens;
    const toward = Math.abs(steerTarget) > Math.abs(s.steerAngle) && Math.sign(steerTarget) === Math.sign(s.steerAngle || steerTarget);
    s.steerAngle = approach(s.steerAngle, steerTarget, dt * (toward ? 4.5 : 7) * (0.7 + 0.5 * spec.handling));

    // The car has its own heading. In a bend the road turns under it while the car keeps going straight, so with
    // no steering it runs wide and off the road. Steering turns the car. On straights the car straightens up on its
    // own (lane changes stay arcade-easy); in bends it does not, because that would mean following the road.
    const mps = s.speedKph / 3.6;
    const handlingGain = 0.7 + 0.5 * spec.handling;
    const yawPerSteer = STEER_YAW * handlingGain * grip;   // heading change per second per unit of wheel angle (the wheel angle already shrinks at speed)
    const roadTurn = BEND_TURN * road.curve * mps;                     // how fast the road turns away under the car
    // A badly damaged car pulls to one side.
    const pull = s.damage > 40 ? ((s.damage - 40) / 60) * 0.006 * speedRef : 0;
    const straighten = HEADING_SETTLE * Math.max(0, 1 - Math.abs(road.curve));
    s.heading += (s.steerAngle * yawPerSteer - roadTurn + pull) * dt;
    s.heading -= s.heading * Math.min(1, straighten * dt);
    s.heading = clamp(s.heading, -MAX_HEADING, MAX_HEADING);
    s.lateralVel = s.heading * mps;
    s.playerX += s.lateralVel * dt;

    // Past the grip limit the bend needs more steering than the tyres can give.
    const slip = Math.abs(roadTurn) / Math.max(1e-6, yawPerSteer * (0.5 + 0.5 * spec.handling) * 1.15);
    s.skidding = (slip > 1 || (Math.abs(s.steerAngle) > 0.7 && speedRef > 0.7)) && s.speedKph > 40;
    if (s.skidding) s.speedKph = Math.max(0, s.speedKph - 6 * dt);

    // ---- Collisions: guardrail and world limits ----
    const wall = this.edges.shoulder - 0.03;
    if (road.barrier && Math.abs(s.playerX) > wall && (!road.barrierSide || road.barrierSide === Math.sign(s.playerX))) {
      const side = Math.sign(s.playerX);
      // Scraping the rail is one incident, not one per frame: damage and the event happen once per half second.
      const firstHit = this.barrierCooldown <= 0;
      if (firstHit) {
        this.applyImpact(s.speedKph * BARRIER_IMPACT_FACTOR);
        s.events.push('barrier_hit');
        this.barrierCooldown = 0.5;
      }
      // A crash, not a graze: most of the speed is lost on the first hit, and pressing on against the rail keeps scrubbing it off.
      if (firstHit) s.speedKph *= 0.35;
      s.speedKph = Math.max(0, s.speedKph - 60 * dt);
      s.playerX = side * (wall - 0.12);
      s.heading = -side * 0.02; // knocked back toward the road
      s.lateralVel = s.heading * Math.max(1, s.speedKph / 3.6);
      s.steerAngle = 0;
    }
    this.barrierCooldown = Math.max(0, this.barrierCooldown - dt);
    if (Math.abs(s.playerX) > 3) {
      s.playerX = Math.sign(s.playerX) * 3;
      s.lateralVel = 0;
      s.heading = 0;
      s.speedKph *= 0.97;
    }

    // ---- Progress, fuel ----
    const metres = (s.speedKph / 3.6) * dt;
    s.position += s.speedKph * WORLD_UNITS_PER_KPH * dt;
    if (s.position >= this.trackLength) s.position -= this.trackLength;
    s.distanceKm += metres / 1000;
    const burn = spec.fuelBurnRate * (0.05 + 0.95 * s.throttle * clamp(rpmNorm, 0.2, 1));
    const prevFuel = s.fuel;
    s.fuel = Math.max(0, s.fuel - burn * dt);
    if (prevFuel > 0 && s.fuel === 0) s.events.push('out_of_fuel');

    return s;
  }

  /**
   * Engine and brake temperatures. Sitting on the rev limiter heats the engine: first a warning, then an overheat
   * (limp mode), and if you keep revving it after that the engine blows. Lifting off or shifting up lets it cool,
   * faster with air flowing through the radiator. Long hard braking heats the brakes until they fade.
   */
  private updateHeat(dt: number, rpmNorm: number): void {
    const s = this.state;
    const dmg = s.damage / 100;
    const airflow = Math.min(1, s.speedKph / 120);

    // Engine.
    const redlining = !s.engineBlown && !s.shifting && s.throttle > 0.3 && rpmNorm >= REDLINE_NORM;
    // Floored: the throttle is held wide open (shifts do not count as lifting off).
    const floored = !s.engineBlown && s.throttle > FLOORED;
    const boostHeat = this.boostTime > 0 ? 0.02 : 0;
    const before = s.engineTemp;
    if (redlining || floored || boostHeat > 0) {
      const rate = (redlining ? REDLINE_HEAT : floored ? FLOORED_HEAT : 0) + boostHeat;
      s.engineTemp = Math.min(1, s.engineTemp + rate * (1 + 0.5 * dmg) * dt);
    } else {
      // Settles toward a load-based running temperature (a worn engine runs hotter).
      const target = ENGINE_NORMAL_TEMP - 0.03 + 0.12 * s.throttle * Math.min(1, rpmNorm) + 0.15 * dmg;
      const rate = s.engineTemp > target ? 0.03 + 0.05 * airflow : 0.04;
      s.engineTemp = approach(s.engineTemp, target, rate * dt);
    }
    if (before < ENGINE_HOT && s.engineTemp >= ENGINE_HOT && !s.overheated) s.events.push('engine_hot');
    if (!s.overheated && !s.engineBlown && s.engineTemp >= 1) {
      s.overheated = true;
      s.events.push('overheat');
    } else if (s.overheated && s.engineTemp < ENGINE_RECOVER) {
      s.overheated = false;
      this.strain = 0;
      s.events.push('engine_cooled');
    }
    if (s.overheated && (redlining || floored)) this.strain += dt;
    else this.strain = Math.max(0, this.strain - dt * 0.5);
    if (this.strain >= BLOW_AFTER && !s.engineBlown) {
      s.engineBlown = true;
      s.overheated = false;
      s.rpm = 0;
      s.damage = clamp(s.damage + BLOWN_DAMAGE / this.spec.damageResistance, 0, 100);
      s.events.push('engine_blown');
    }

    // Brakes.
    const brakeBefore = s.brakeTemp;
    const heat = s.brake * Math.min(1.5, s.speedKph / 150) * 0.2;
    s.brakeTemp = clamp(s.brakeTemp + (heat - (0.04 + 0.05 * airflow) * (s.brakeTemp - 0.15)) * dt, 0, 1);
    if (brakeBefore < BRAKE_FADE && s.brakeTemp >= BRAKE_FADE) s.events.push('brakes_fading');
  }
}
