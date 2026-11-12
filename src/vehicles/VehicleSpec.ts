/** Static data describing one purchasable vehicle (see Part 7 of the design brief). */
export interface VehicleSpec {
  id: string;
  name: string;
  price: number;
  /** Maximum speed in km/h (undamaged, stock). */
  topSpeedKph: number;
  /** Launch acceleration in km/h per second in first gear at peak torque. */
  acceleration: number;
  /** Steering response and grip, roughly 0.5 (sluggish) .. 1.0 (sharp). */
  handling: number;
  /** Braking deceleration in km/h per second. */
  braking: number;
  /** Fuel tank size in litres. */
  fuelCapacity: number;
  /** Fuel burned at full throttle and redline, litres per second. */
  fuelBurnRate: number;
  /** Multiplier on damage taken (higher = tougher). */
  damageResistance: number;
  /** Gear change time in seconds (transmission upgrades shorten it). Defaults to 0.25. */
  shiftTime?: number;
  idleRpm: number;
  redlineRpm: number;
  /** Audio profile id used in Milestone 13. */
  engineSound: string;
  /** Texture keys / asset names. */
  cockpitAsset: string;
  artwork: string;
}
