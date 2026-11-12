// Headless checks of road pickups. Run: npm run test:sim
import { PickupKind, PickupManager } from '../src/pickups/PickupManager';
import { UNITS_PER_METRE } from '../src/traffic/TrafficData';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const DT = 1 / 60;
const mps = 30; // ~108 km/h
/** Seeded random numbers so the checks give the same result every run. */
const seeded = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

console.log('--- pickups: spawning ---');
{
  const L = 20000 * UNITS_PER_METRE; // 20 km loop
  const pm = new PickupManager(3, L, 0, seeded(7));
  let pos = 0, spawned = 0, prev = 0, maxActive = 0, minAhead = Infinity;
  const kinds = new Set<PickupKind>();
  const lanes = new Set<number>();
  for (let t = 0; t < 600; t += DT) {
    pos = (pos + mps * UNITS_PER_METRE * DT) % L;
    pm.update(DT, { position: pos, playerX: 5 /* off to the side: never collects */ }, { fuelFrac: 0.8, damage: 0 });
    if (pm.items.length > prev) {
      spawned++;
      const n = pm.items[pm.items.length - 1];
      kinds.add(n.kind);
      lanes.add(Math.round(n.x * 100));
      minAhead = Math.min(minAhead, ((((n.z - pos) % L) + L) % L) / UNITS_PER_METRE);
    }
    prev = pm.items.length;
    maxActive = Math.max(maxActive, pm.items.length);
  }
  const km = (600 * mps) / 1000;
  check('pickups keep appearing as you drive (one every 350-800 m), across the track wrap', spawned >= km * 1000 / 800 - 2 && spawned <= km * 1000 / 350 + 2, `(${spawned} in ${km.toFixed(0)} km)`);
  check('all four kinds turn up', kinds.size === 4, `(${[...kinds].join(', ')})`);
  check('they use every lane', lanes.size === 3);
  check('never more than 4 on the road', maxActive <= 4);
  check('new pickups appear well ahead, out in the fog (every one of them)', minAhead > 300, `(closest ${minAhead.toFixed(0)} m)`);
}

console.log('--- pickups: collecting ---');
{
  const L = 5000 * UNITS_PER_METRE;
  const pm = new PickupManager(3, L, 0, seeded(7));
  pm.items.push({ kind: 'money', z: 100 * UNITS_PER_METRE, x: 0, age: 0 });
  pm.items.push({ kind: 'fuel', z: 100 * UNITS_PER_METRE, x: 2 / 3, age: 0 });
  const got: string[] = [];
  let pos = 0;
  for (let t = 0; t < 6; t += DT) {
    pos += mps * UNITS_PER_METRE * DT;
    for (const p of pm.update(DT, { position: pos, playerX: 0.05 }, { fuelFrac: 1, damage: 0 })) got.push(p.kind);
  }
  check('driving through a pickup collects it', got.includes('money'));
  check('one in the next lane is not collected', !got.includes('fuel'), `(${got.join(', ')})`);
  check('missed pickups are cleared once well behind', !pm.items.some((p) => p.z === 100 * UNITS_PER_METRE));
}

console.log('--- pickups: what spawns ---');
{
  const count = (needs: { fuelFrac: number; damage: number }) => {
    const pm = new PickupManager(3, 1e9, 0, seeded(11));
    const c: Record<string, number> = { money: 0, boost: 0, fuel: 0, repair: 0 };
    for (let i = 0; i < 4000; i++) c[pm.pickKind(needs)]++;
    return c;
  };
  const fine = count({ fuelFrac: 0.9, damage: 0 });
  const thirsty = count({ fuelFrac: 0.1, damage: 0 });
  const hurt = count({ fuelFrac: 0.9, damage: 70 });
  check('gas cans become common when the tank is low', thirsty.fuel > fine.fuel * 3, `(${fine.fuel} -> ${thirsty.fuel} of 4000)`);
  check('repair kits become common when damaged', hurt.repair > fine.repair * 4, `(${fine.repair} -> ${hurt.repair} of 4000)`);
  check('cash is the usual pickup on a healthy car', fine.money > fine.boost && fine.money > fine.fuel && fine.money > fine.repair);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
