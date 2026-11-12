// Prints how fast each way of earning pays and what things cost, so the economy can be balanced by eye.
// Run: npm run report:economy   (not a pass/fail test)
import { JOBS } from '../src/career/Jobs';
import { ARCADE_MEDAL_PAY, CHALLENGES } from '../src/arcade/Challenges';
import { payFor } from '../src/career/Career';
import { VEHICLES } from '../src/vehicles/VehicleRoster';
import { UPGRADE_KEYS, upgradeCost, repairCost } from '../src/economy/UpgradeData';
import { POLICE_LEVELS } from '../src/police/PoliceData';
import { PICKUP_VALUE, PickupManager } from '../src/pickups/PickupManager';
import { UNITS_PER_METRE } from '../src/traffic/TrafficData';
import { BLOWN_DAMAGE } from '../src/systems/DrivingModel';
import { STARTING_MONEY } from '../src/economy/Profile';

/** Menus, countdown and results screens add this much to every run. */
const OVERHEAD_S = 25;
const $ = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

console.log(`Starting money ${$(STARTING_MONEY)}\n`);
console.log('--- career jobs: money per minute (silver) ---');
for (const j of JOBS) {
  const c = j.challenge;
  const runS = (c.kind === 'checkpoint' ? Math.min(c.maxTimeS ?? 200, c.timeLimit * 2.4) : c.timeLimit * (c.kind === 'time_trial' ? 0.8 : 1)) + OVERHEAD_S;
  const first = payFor(j, 'silver', true), replay = payFor(j, 'silver', false), gold = payFor(j, 'gold', false);
  console.log(`T${j.tier} ${j.name.padEnd(20)} ${String(Math.round(runS)).padStart(4)} s  first ${$(first).padStart(7)}  replay ${$(replay).padStart(7)} (${$(replay / (runS / 60)).padStart(7)}/min)  gold replay ${$(gold / (runS / 60)).padStart(7)}/min`);
}

console.log('\n--- arcade challenges: medal pay per minute ---');
for (const c of CHALLENGES) {
  const runS = (c.kind === "checkpoint" ? (c.maxTimeS ?? 200) * 0.6 : c.kind === "time_trial" ? c.timeLimit * 0.7 : c.timeLimit) + OVERHEAD_S;
  console.log(`${c.name.padEnd(17)} ~${String(Math.round(runS)).padStart(4)} s  bronze ${$(ARCADE_MEDAL_PAY.bronze)}  silver ${$(ARCADE_MEDAL_PAY.silver)}  gold ${$(ARCADE_MEDAL_PAY.gold)} (${$(ARCADE_MEDAL_PAY.gold / (runS / 60))}/min)`);
}

console.log('\n--- free drive pickups: cash per minute ---');
for (const kph of [100, 150, 200]) {
  const pm = new PickupManager(3, 1e12, 0);
  let money = 0, spawns = 0, pos = 0;
  const dt = 1 / 30;
  for (let t = 0; t < 600; t += dt) {
    pos += (kph / 3.6) * UNITS_PER_METRE * dt;
    const before = pm.items.length;
    pm.update(dt, { position: pos, playerX: 9 }, { fuelFrac: 0.8, damage: 0 });
    if (pm.items.length > before) { spawns++; if (pm.items[pm.items.length - 1].kind === 'money') money++; }
  }
  const avg = (PICKUP_VALUE.moneyMin + PICKUP_VALUE.moneyMax) / 2;
  console.log(`${kph} km/h: ${(spawns / 10).toFixed(1)} pickups/min, ${(money / 10).toFixed(1)} cash/min -> ${$((money / 10) * avg)}/min if all grabbed, ${$((money / 10) * avg * 0.6)}/min grabbing 60%`);
}

console.log('\n--- police (free drive) ---');
for (const L of POLICE_LEVELS) console.log(`${L.name.padEnd(20)} escape ${$(L.reward)}  fine ${$(L.fine)}`);

console.log('\n--- costs per car ---');
for (const v of VEHICLES) {
  let up = 0;
  for (const k of UPGRADE_KEYS) for (let l = 0; l < 3; l++) up += upgradeCost(v.price, k, l)!;
  console.log(`${v.name.padEnd(17)} price ${$(v.price).padStart(8)}  all upgrades ${$(up).padStart(8)}  repair 10% ${$(repairCost(v.price, 10)).padStart(6)}  blown engine ${$(repairCost(v.price, BLOWN_DAMAGE / v.damageResistance)).padStart(7)}  repair pickup saves ${$(repairCost(v.price, PICKUP_VALUE.repair)).padStart(6)}`);
}
