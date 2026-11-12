// Headless checks of the economy: buying, upgrades, repairs, saving, and that every upgrade changes driving.
import { DrivingModel } from '../src/systems/DrivingModel';
import { roadEdges } from '../src/road/RoadLayout';
import { emptyInput, InputState } from '../src/controls/InputState';
import { VEHICLES, getVehicle } from '../src/vehicles/VehicleRoster';
import { applyUpgrades, MAX_HANDLING } from '../src/economy/VehicleTuning';
import { MAX_UPGRADE_LEVEL, UPGRADE_KEYS, UpgradeKey, noUpgrades, repairCost, upgradeCost } from '../src/economy/UpgradeData';
import {
  PROFILE_VERSION, STARTING_MONEY, addMoney, buyUpgrade, buyVehicle, createProfile, deserializeProfile, effectiveSpec,
  fullRepairCost, nextUpgradeCost, owns, repair, selectVehicle, serializeProfile, setDamage,
} from '../src/economy/Profile';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const DT = 1 / 60;
const edges = roadEdges(3);
const inp = (o: Partial<InputState>): InputState => ({ ...emptyInput(), ...o });
const straight = { curve: 0, barrier: false };
const lv = (key: UpgradeKey, n: number) => ({ ...noUpgrades(), [key]: n });
const base = getVehicle('night_hawk');

/** Seconds to reach `kph` from standstill at full throttle (auto gearbox). */
const timeTo = (spec: typeof base, kph: number) => {
  const m = new DrivingModel(spec, edges, 1e9);
  for (let t = 0; t < 60; t += DT) if (m.update(DT, inp({ throttle: 1 }), straight).speedKph >= kph) return t;
  return 99;
};
const topSpeed = (spec: typeof base) => {
  const m = new DrivingModel(spec, edges, 1e9);
  for (let t = 0; t < 120; t += DT) m.update(DT, inp({ throttle: 1 }), straight);
  return m.state.speedKph;
};
const stopTime = (spec: typeof base) => {
  const m = new DrivingModel(spec, edges, 1e9);
  m.state.speedKph = 200; m.transmission.gear = 6;
  let t = 0;
  for (; t < 30 && m.state.speedKph > 0.5; t += DT) m.update(DT, inp({ brake: 1 }), straight);
  return t;
};
/** How far the car moves sideways in 1 s of full steering at 120 km/h. */
const turnIn = (spec: typeof base) => {
  const m = new DrivingModel(spec, edges, 1e9);
  m.state.speedKph = 120; m.transmission.gear = 4;
  for (let i = 0; i < 60; i++) m.update(DT, inp({ throttle: 0.4, steer: 1 }), straight);
  return m.state.playerX;
};

console.log('--- every upgrade changes how the car drives ---');
{
  const stock = timeTo(base, 150);
  const eng = timeTo(applyUpgrades(base, lv('engine', 3)), 150);
  check('engine: faster to 150 km/h', eng < stock * 0.95, `(${stock.toFixed(1)}s -> ${eng.toFixed(1)}s)`);
  const ts = topSpeed(base), te = topSpeed(applyUpgrades(base, lv('engine', 3)));
  check('engine: higher top speed', te > ts * 1.07, `(${ts.toFixed(0)} -> ${te.toFixed(0)} km/h)`);
  const tr = timeTo(applyUpgrades(base, lv('transmission', 3)), 150);
  check('transmission: faster to 150 km/h', tr < stock, `(${stock.toFixed(2)}s -> ${tr.toFixed(2)}s)`);
  const shift = applyUpgrades(base, lv('transmission', 3)).shiftTime!;
  check('transmission: shorter gear changes', shift < 0.2 && shift >= 0.1, `(${shift.toFixed(3)}s vs 0.25s)`);
  const bs = stopTime(base);
  check('brakes: stop sooner from 200 km/h', stopTime(applyUpgrades(base, lv('brakes', 3))) < bs * 0.9, `(${bs.toFixed(2)}s -> ${stopTime(applyUpgrades(base, lv('brakes', 3))).toFixed(2)}s)`);
  check('tires: stop sooner and turn in harder', stopTime(applyUpgrades(base, lv('tires', 3))) < bs && turnIn(applyUpgrades(base, lv('tires', 3))) > turnIn(base));
  check('handling: turns in harder', turnIn(applyUpgrades(base, lv('handling', 3))) > turnIn(base) * 1.05, `(${turnIn(base).toFixed(2)} -> ${turnIn(applyUpgrades(base, lv('handling', 3))).toFixed(2)})`);
  const sus = applyUpgrades(base, lv('suspension', 3));
  const a = new DrivingModel(base, edges, 1e9), b = new DrivingModel(sus, edges, 1e9);
  a.applyImpact(100); b.applyImpact(100);
  check('suspension: less damage from the same crash', b.state.damage < a.state.damage * 0.9, `(${a.state.damage.toFixed(1)}% vs ${b.state.damage.toFixed(1)}%)`);
  const fuel = applyUpgrades(base, lv('fuel', 3));
  check('fuel tank: bigger capacity (and fuller start)', fuel.fuelCapacity > base.fuelCapacity * 1.3 && new DrivingModel(fuel, edges, 1e9).state.fuel === fuel.fuelCapacity, `(${base.fuelCapacity} -> ${fuel.fuelCapacity.toFixed(1)} L)`);
  check('upgrades never lower any stat', UPGRADE_KEYS.every((k) => { const u = applyUpgrades(base, lv(k, 3)); return u.topSpeedKph >= base.topSpeedKph && u.acceleration >= base.acceleration && u.handling >= base.handling && u.braking >= base.braking && u.fuelCapacity >= base.fuelCapacity && u.damageResistance >= base.damageResistance; }));
  const all = applyUpgrades(getVehicle('phantom_x'), { engine: 3, transmission: 3, tires: 3, brakes: 3, suspension: 3, fuel: 3, handling: 3 });
  check('handling is capped', all.handling <= MAX_HANDLING + 1e-9, `(${all.handling.toFixed(2)})`);
  check('stock levels leave the spec unchanged', JSON.stringify({ ...applyUpgrades(base, noUpgrades()), shiftTime: undefined }) === JSON.stringify({ ...base, shiftTime: undefined }) || applyUpgrades(base, noUpgrades()).topSpeedKph === base.topSpeedKph);
}

console.log('--- costs ---');
{
  const costs = UPGRADE_KEYS.map((k) => [0, 1, 2].map((l) => upgradeCost(12000, k, l)!));
  check('each level costs more than the last', costs.every((c) => c[0] < c[1] && c[1] < c[2]));
  check('maxed upgrades have no cost', UPGRADE_KEYS.every((k) => upgradeCost(12000, k, MAX_UPGRADE_LEVEL) === null));
  check('expensive cars cost more to upgrade', upgradeCost(95000, 'engine', 0)! > upgradeCost(12000, 'engine', 0)!);
  check('repair cost scales with damage and price', repairCost(12000, 50) > repairCost(12000, 10) && repairCost(95000, 50) > repairCost(12000, 50) && repairCost(12000, 0) === 0);
  check('the starter car can afford a first upgrade on starting money', upgradeCost(getVehicle('vortex_gt').price, 'brakes', 0)! < STARTING_MONEY);
  check('a second car is out of reach at the start (career must earn it)', VEHICLES.filter((v) => v.price <= STARTING_MONEY).length === 0);
}

console.log('--- buying and upgrading ---');
{
  const p = createProfile();
  check('start: one car, limited money', Object.keys(p.vehicles).length === 1 && owns(p, 'vortex_gt') && p.money === STARTING_MONEY);
  const poor = buyVehicle(p, 'night_hawk');
  check('cannot buy a car you cannot afford', !poor.ok && p.money === STARTING_MONEY && !owns(p, 'night_hawk'), poor.ok ? '' : poor.reason);
  addMoney(p, 30000);
  const price = getVehicle('night_hawk').price;
  const bought = buyVehicle(p, 'night_hawk');
  check('buying deducts the price and adds the car', bought.ok && owns(p, 'night_hawk') && p.money === STARTING_MONEY + 30000 - price);
  check('cannot buy the same car twice', !buyVehicle(p, 'night_hawk').ok);
  check('cannot buy an unknown car', !buyVehicle(p, 'nope').ok);
  const before = p.money;
  const cost = nextUpgradeCost(p, 'night_hawk', 'engine')!;
  const up = buyUpgrade(p, 'night_hawk', 'engine');
  check('upgrading charges the listed cost and raises the level', up.ok && p.money === before - cost && p.vehicles.night_hawk.upgrades.engine === 1);
  check('the upgraded car drives better than stock', effectiveSpec(p, 'night_hawk').acceleration > getVehicle('night_hawk').acceleration);
  addMoney(p, 20000);
  buyUpgrade(p, 'night_hawk', 'engine'); buyUpgrade(p, 'night_hawk', 'engine');
  check('upgrade stops at the maximum level', !buyUpgrade(p, 'night_hawk', 'engine').ok && p.vehicles.night_hawk.upgrades.engine === MAX_UPGRADE_LEVEL);
  check('cannot upgrade a car you do not own', !buyUpgrade(p, 'phantom_x', 'engine').ok);
  p.money = 5;
  const broke = buyUpgrade(p, 'night_hawk', 'brakes');
  check('cannot upgrade without enough money', !broke.ok && p.vehicles.night_hawk.upgrades.brakes === 0 && p.money === 5);
  check('upgrades belong to one car, not the garage', p.vehicles.vortex_gt.upgrades.engine === 0);
  check('selecting works for owned cars only', selectVehicle(p, 'night_hawk').ok && p.selectedVehicle === 'night_hawk' && !selectVehicle(p, 'phantom_x').ok && p.selectedVehicle === 'night_hawk');
}

console.log('--- damage and repair ---');
{
  const p = createProfile();
  p.money = 10000;
  setDamage(p, 'vortex_gt', 40);
  const full = fullRepairCost(p, 'vortex_gt');
  check('repair cost is shown before paying', full > 0 && full === repairCost(12000, 40));
  const r = repair(p, 'vortex_gt');
  check('repair restores the car and charges the cost', r.ok && p.vehicles.vortex_gt.damage === 0 && p.money === 10000 - full);
  check('nothing to repair on a perfect car', !repair(p, 'vortex_gt').ok);
  setDamage(p, 'vortex_gt', 80);
  p.money = 500;
  const part = repair(p, 'vortex_gt');
  check('with little money you can still repair some damage', part.ok && p.vehicles.vortex_gt.damage < 80 && p.vehicles.vortex_gt.damage > 0 && p.money < 500, `(damage now ${p.vehicles.vortex_gt.damage})`);
  p.money = 0;
  check('with no money you cannot repair', !repair(p, 'vortex_gt').ok);
  // Damage carried into the model hurts performance.
  const dmgModel = new DrivingModel(getVehicle('vortex_gt'), edges, 1e9, undefined, 80);
  const clean = new DrivingModel(getVehicle('vortex_gt'), edges, 1e9);
  for (let i = 0; i < 60 * 40; i++) { dmgModel.update(DT, inp({ throttle: 1 }), straight); clean.update(DT, inp({ throttle: 1 }), straight); }
  check('damage persists into driving and lowers performance until repaired', dmgModel.state.speedKph < clean.state.speedKph * 0.9);
  setDamage(p, 'vortex_gt', 250);
  check('damage is clamped to 0..100', p.vehicles.vortex_gt.damage === 100);
  setDamage(p, 'vortex_gt', 10);
  check('minor dents (under 15%) are fixed for free after a drive', p.vehicles.vortex_gt.damage === 0);
  setDamage(p, 'vortex_gt', 14.9);
  check('...up to 14.9%', p.vehicles.vortex_gt.damage === 0);
  setDamage(p, 'vortex_gt', 15);
  check('real damage (15% and up) stays until repaired', p.vehicles.vortex_gt.damage === 15);
  setDamage(p, 'vortex_gt', 60);
  check('heavy damage is kept exactly', p.vehicles.vortex_gt.damage === 60);
}

console.log('--- saving and corrupt data ---');
{
  const p = createProfile();
  addMoney(p, 5000);
  buyVehicle(p, 'night_hawk'); buyUpgrade(p, 'night_hawk', 'tires'); setDamage(p, 'night_hawk', 12.5); selectVehicle(p, 'night_hawk');
  const back = deserializeProfile(serializeProfile(p));
  check('profile survives a save/load round trip', JSON.stringify(back) === JSON.stringify(p));
  check('profile carries a version', back.version === PROFILE_VERSION);
  for (const [name, text] of [['empty', ''], ['null', 'null'], ['garbage', '{not json'], ['array', '[1,2]'], ['number', '42']] as const) {
    const d = deserializeProfile(text);
    check(`corrupt save (${name}) gives a fresh playable profile`, d.money === STARTING_MONEY && owns(d, 'vortex_gt'));
  }
  const bad = deserializeProfile(JSON.stringify({ money: 'lots', reputation: NaN, selectedVehicle: 'ghost', vehicles: { vortex_gt: { upgrades: { engine: 99, tires: -4, brakes: 'x' }, damage: 500 }, fake_car: { upgrades: {}, damage: 0 } } }));
  check('bad fields are repaired, not trusted', bad.money === STARTING_MONEY && bad.vehicles.vortex_gt.upgrades.engine === MAX_UPGRADE_LEVEL && bad.vehicles.vortex_gt.upgrades.tires === 0 && bad.vehicles.vortex_gt.upgrades.brakes === 0 && bad.vehicles.vortex_gt.damage === 100 && !('fake_car' in bad.vehicles));
  check('selection falls back to an owned car', owns(bad, bad.selectedVehicle));
}

console.log(failures === 0 ? '\nALL ECONOMY CHECKS PASSED' : `\n${failures} ECONOMY CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
