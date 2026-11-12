// Headless checks of the economy: buying, upgrades, repairs, saving, and that every upgrade changes driving.
import { BLOWN_DAMAGE, DrivingModel } from '../src/systems/DrivingModel';
import { PICKUP_VALUE, PickupManager } from '../src/pickups/PickupManager';
import { UNITS_PER_METRE } from '../src/traffic/TrafficData';
import { JOBS } from '../src/career/Jobs';
import { ARCADE_MEDAL_PAY, CHALLENGES } from '../src/arcade/Challenges';
import { payFor } from '../src/career/Career';
import { POLICE_LEVELS } from '../src/police/PoliceData';
import { roadEdges } from '../src/road/RoadLayout';
import { emptyInput, InputState } from '../src/controls/InputState';
import { VEHICLES, getVehicle } from '../src/vehicles/VehicleRoster';
import { applyUpgrades, MAX_HANDLING } from '../src/economy/VehicleTuning';
import { MAX_UPGRADE_LEVEL, UPGRADE_KEYS, UpgradeKey, noUpgrades, repairCost, upgradeCost } from '../src/economy/UpgradeData';
import {
  PROFILE_VERSION, STARTING_MONEY, addMoney, buyUpgrade, buyVehicle, createProfile, deserializeProfile, effectiveSpec,
  fullRepairCost, nextUpgradeCost, owns, repair, selectVehicle, serializeProfile, setDamage,
  EMERGENCY_FUEL, FUEL_PRICE_PER_LITRE, fuelLevel, gasUp, gasUpCost, setFuel,
} from '../src/economy/Profile';
import { jobStatus } from '../src/career/Career';

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
  for (let t = 0; t < 120; t += DT) { m.state.engineTemp = 0.45; m.update(DT, inp({ throttle: 1 }), straight); } // top speed only: heat is tested in sim-driving
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

console.log('--- balance: earning against spending ---');
{
  const rookie = JOBS.filter((j) => j.tier === 1);
  // Rookie silver replay pay per minute of play (job length + about 25 s of menus).
  const rookiePerMin = Math.min(...rookie.map((j) => payFor(j, 'silver', false) / ((j.challenge.timeLimit + 25) / 60)));
  // Free drive at 150 km/h, grabbing every cash pickup.
  const pm = new PickupManager(3, 1e12, 0, (() => { let s = 3; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })());
  let cash = 0, pos = 0;
  for (let t = 0; t < 600; t += 1 / 30) {
    pos += (150 / 3.6) * UNITS_PER_METRE / 30;
    const n = pm.items.length;
    pm.update(1 / 30, { position: pos, playerX: 9 }, { fuelFrac: 0.8, damage: 0 });
    if (pm.items.length > n && pm.items[pm.items.length - 1].kind === 'money') cash += (PICKUP_VALUE.moneyMin + PICKUP_VALUE.moneyMax) / 2;
  }
  const pickupPerMin = cash / 10;
  check('free-drive cash pickups pay less than the worst rookie job (jobs stay worth doing)', pickupPerMin < rookiePerMin, `($${pickupPerMin.toFixed(0)}/min vs $${rookiePerMin.toFixed(0)}/min)`);
  for (const v of VEHICLES) {
    let all = 0;
    for (const k of UPGRADE_KEYS) for (let l = 0; l < MAX_UPGRADE_LEVEL; l++) all += upgradeCost(v.price, k, l)!;
    check(`${v.name}: maxing every upgrade costs about the car's price (0.8-1.3x)`, all > v.price * 0.8 && all < v.price * 1.3, `($${all} vs $${v.price})`);
  }
  const starter = getVehicle('vortex_gt');
  const rookieReplay = Math.min(...rookie.map((j) => payFor(j, 'silver', false)));
  check('a scrappy run (20% damage) on the starter costs about one rookie job or less', repairCost(starter.price, 20) <= rookieReplay * 1.1, `($${repairCost(starter.price, 20)} vs $${rookieReplay})`);
  check('a blown engine on the starter still hurts (over $250)', repairCost(starter.price, BLOWN_DAMAGE / starter.damageResistance) > 250, `($${repairCost(starter.price, BLOWN_DAMAGE / starter.damageResistance)})`);
  const top = getVehicle('phantom_x');
  const t5 = JOBS.filter((j) => j.tier === 5);
  const t5Replay = Math.min(...t5.map((j) => payFor(j, 'silver', false)));
  check('a scrappy run on the top car costs about half a top-tier job or less', repairCost(top.price, 20) < t5Replay * 0.55, `($${repairCost(top.price, 20)} vs $${t5Replay})`);
  // Arcade: gold every run (a gold checkpoint run goes on for most of its time cap; a gold time trial uses about 70% of the clock), plus menus.
  const arcadeBest = Math.max(...CHALLENGES.map((c) => ARCADE_MEDAL_PAY.gold / (((c.kind === "checkpoint" ? (c.maxTimeS ?? 200) * 0.6 : c.kind === "time_trial" ? c.timeLimit * 0.7 : c.timeLimit) + 25) / 60)));
  check('arcade medals pay something, but even gold pays less per minute than the worst rookie job', ARCADE_MEDAL_PAY.bronze > 0 && arcadeBest < rookiePerMin, `(best $${arcadeBest.toFixed(0)}/min vs $${rookiePerMin.toFixed(0)}/min)`);
  check('better medals pay more', ARCADE_MEDAL_PAY.gold > ARCADE_MEDAL_PAY.silver && ARCADE_MEDAL_PAY.silver > ARCADE_MEDAL_PAY.bronze && ARCADE_MEDAL_PAY.none === 0);
  check('police fines are smaller than escape rewards at every level', POLICE_LEVELS.every((L) => L.fine < L.reward));
}

console.log('--- fuel carries over between drives ---');
{
  const p = createProfile();
  const id = p.selectedVehicle;
  check('a new car starts with a full tank', fuelLevel(p, id) === 1 && gasUpCost(p, id) === 0);
  setFuel(p, id, 0.25);
  const back = deserializeProfile(serializeProfile(p));
  check('fuel left is saved and loaded with the car', Math.abs(fuelLevel(back, id) - 0.25) < 1e-9);
  const cap = effectiveSpec(p, id).fuelCapacity;
  const cost = gasUpCost(p, id);
  check('filling up costs the missing litres at the pump price', cost === Math.ceil(cap * 0.75 * FUEL_PRICE_PER_LITRE), `($${cost} for ${(cap * 0.75).toFixed(0)} L)`);
  check('a full tank costs well under a rookie job ($100 or less on the starter)', Math.ceil(cap * FUEL_PRICE_PER_LITRE) <= 100, `($${Math.ceil(cap * FUEL_PRICE_PER_LITRE)})`);
  const m0 = p.money;
  check('gas up fills the tank and charges for it', gasUp(p, id).ok && fuelLevel(p, id) === 1 && p.money === m0 - cost);
  check('gas up on a full tank is refused', !gasUp(p, id).ok);
  setFuel(p, id, 0.2); p.money = 30;
  gasUp(p, id);
  check('short of money: buys as much as the money covers', p.money === 0 && fuelLevel(p, id) > 0.2 && fuelLevel(p, id) < 1, `(${Math.round(fuelLevel(p, id) * 100)}%)`);
  setFuel(p, id, 0); p.money = 0;
  const r = gasUp(p, id);
  check('broke with an empty tank: a free emergency splash so you can always drive again', r.ok && r.free === true && Math.abs(fuelLevel(p, id) - EMERGENCY_FUEL) < 1e-9);
  const old = deserializeProfile(JSON.stringify({ ...JSON.parse(serializeProfile(createProfile())), vehicles: { vortex_gt: { upgrades: {}, damage: 10 } } }));
  check('older saves without fuel load with a full tank', fuelLevel(old, 'vortex_gt') === 1);
  const job = JOBS[0];
  const spec = effectiveSpec(p, id);
  check('jobs are blocked on a nearly empty tank', jobStatus(job, 0, spec, 0, 0.05).state === 'blocked' && jobStatus(job, 0, spec, 0, 0.5).state === 'available');
  const m = new DrivingModel(spec, edges, 1e9, spec.fuelCapacity * 0.3);
  check('a drive starts with the saved fuel', Math.abs(m.state.fuel - spec.fuelCapacity * 0.3) < 1e-9);
  m.setVehicle(spec, 0, 5);
  check('switching car keeps the fuel it is given', m.state.fuel === 5);
}

console.log(failures === 0 ? '\nALL ECONOMY CHECKS PASSED' : `\n${failures} ECONOMY CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
