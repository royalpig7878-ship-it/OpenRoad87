/** The seven upgrade categories from the design brief. Each has 3 levels (0 = stock). */
export type UpgradeKey = 'engine' | 'transmission' | 'tires' | 'brakes' | 'suspension' | 'fuel' | 'handling';

export const UPGRADE_KEYS: UpgradeKey[] = ['engine', 'transmission', 'tires', 'brakes', 'suspension', 'fuel', 'handling'];
export const MAX_UPGRADE_LEVEL = 3;

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  /** What one level does, in plain words (shown in the shop). */
  effect: string;
  /** Texture key of the icon in the garage. */
  icon: string;
  /** Multiplier on the base cost (relative to the vehicle's price). */
  costFactor: number;
}

export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  engine: { key: 'engine', name: 'ENGINE', effect: '+3.5% TOP SPEED, +7% ACCEL', icon: 'ui_engine', costFactor: 1.5 },
  transmission: { key: 'transmission', name: 'TRANSMISSION', effect: '+4% ACCEL, FASTER SHIFTS', icon: 'ui_transmission', costFactor: 1.2 },
  tires: { key: 'tires', name: 'TIRES', effect: '+0.04 GRIP, +3% BRAKING', icon: 'ui_tire', costFactor: 0.8 },
  brakes: { key: 'brakes', name: 'BRAKES', effect: '+8% BRAKING', icon: 'ui_brake', costFactor: 0.8 },
  suspension: { key: 'suspension', name: 'SUSPENSION', effect: '+7% TOUGHNESS, +0.015 GRIP', icon: 'ui_damage', costFactor: 1.0 },
  fuel: { key: 'fuel', name: 'FUEL TANK', effect: '+12% FUEL CAPACITY', icon: 'ui_fuel', costFactor: 0.5 },
  handling: { key: 'handling', name: 'HANDLING', effect: '+0.05 STEERING GRIP', icon: 'ui_speed', costFactor: 1.0 },
};

/** Fraction of the vehicle's price that upgrading from level n to n+1 costs (before the category factor). */
export const LEVEL_COST_FRACTION = [0.06, 0.1, 0.16];

/** Upgrade levels per category for one vehicle. */
export type UpgradeLevels = Record<UpgradeKey, number>;

export const noUpgrades = (): UpgradeLevels => ({ engine: 0, transmission: 0, tires: 0, brakes: 0, suspension: 0, fuel: 0, handling: 0 });

/** Cost to buy the next level of `key` for a vehicle of `price` currently at `level` (null if maxed). */
export function upgradeCost(price: number, key: UpgradeKey, level: number): number | null {
  if (level >= MAX_UPGRADE_LEVEL) return null;
  return Math.round((price * LEVEL_COST_FRACTION[level] * UPGRADES[key].costFactor) / 10) * 10;
}

/** Repair cost per percent of damage, as a fraction of the vehicle's price. */
export const REPAIR_COST_PER_PERCENT = 0.0035;

export function repairCost(price: number, damagePercent: number): number {
  return Math.round((price * REPAIR_COST_PER_PERCENT * Math.max(0, damagePercent)) / 10) * 10;
}
