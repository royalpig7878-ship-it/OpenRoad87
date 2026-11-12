import { VehicleSpec } from '../vehicles/VehicleSpec';
import { UpgradeLevels } from './UpgradeData';

/** Handling is capped so no combination makes a car unrealistically glued to the road. */
export const MAX_HANDLING = 1.2;
export const BASE_SHIFT_TIME = 0.25;

/**
 * The vehicle as it actually drives: the stock spec with the installed upgrades applied.
 * Every upgrade changes a number the driving model uses, so every upgrade has a measurable effect.
 */
export function applyUpgrades(base: VehicleSpec, lv: UpgradeLevels): VehicleSpec {
  const topSpeedKph = base.topSpeedKph * (1 + 0.035 * lv.engine);
  const acceleration = base.acceleration * (1 + 0.07 * lv.engine) * (1 + 0.04 * lv.transmission);
  const braking = base.braking * (1 + 0.03 * lv.tires) * (1 + 0.08 * lv.brakes);
  const handling = Math.min(MAX_HANDLING, base.handling + 0.04 * lv.tires + 0.015 * lv.suspension + 0.05 * lv.handling);
  const damageResistance = base.damageResistance * (1 + 0.07 * lv.suspension);
  const fuelCapacity = base.fuelCapacity * (1 + 0.12 * lv.fuel);
  const shiftTime = Math.max(0.1, (base.shiftTime ?? BASE_SHIFT_TIME) - 0.045 * lv.transmission);
  return { ...base, topSpeedKph, acceleration, braking, handling, damageResistance, fuelCapacity, shiftTime };
}

/** Display ranges for the stat bars in the garage (the best values any car/upgrade combination reaches). */
export const STAT_MAX = { topSpeedKph: 350, acceleration: 45, handling: MAX_HANDLING, braking: 70, fuelCapacity: 95, damageResistance: 1.8 };
