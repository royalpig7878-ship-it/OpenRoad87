// Headless checks of the traffic system. Run: npm run sim:traffic (also part of npm run test:sim)
import { TrafficManager, PlayerSample, TrafficCar } from '../src/traffic/TrafficManager';
import { DIFFICULTY, TRAFFIC_TYPES, difficultyForLevel, UNITS_PER_METRE } from '../src/traffic/TrafficData';
import { WORLD_UNITS_PER_KPH } from '../src/systems/DrivingModel';

const TRACK = 1002 * 200;
const DT = 1 / 60;
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const make = (seed = 1, difficulty = DIFFICULTY.normal, poolSize = 40) =>
  new TrafficManager({ trackLength: TRACK, lanes: 3, segmentLength: 200, drawDistance: 300, seed, difficulty, poolSize });

/** Runs the player at constant speed/lane; returns aggregated observations. */
function run(m: TrafficManager, seconds: number, kph: number, x: number, hooks?: (p: PlayerSample, t: number) => void) {
  const p: PlayerSample = { position: 0, playerX: x, speedKph: kph };
  const obs = { hits: 0, near: 0, maxActive: 0, minGapSameLane: Infinity, laneChanges: 0, badLaneChange: 0 };
  const lastLane = new Map<number, number>();
  for (let t = 0; t < seconds; t += DT) {
    p.position = (p.position + kph * WORLD_UNITS_PER_KPH * DT) % TRACK;
    hooks?.(p, t);
    const ev = m.update(DT, p);
    obs.hits += ev.hits.length;
    obs.near += ev.nearMisses.length;
    obs.maxActive = Math.max(obs.maxActive, m.activeCount);
    const active = m.cars.filter((c) => c.active);
    // Gap between cars sharing a lane (centre to centre, minus lengths).
    for (const a of active) for (const b of active) {
      if (a === b || Math.abs(a.x - b.x) > 0.1) continue;
      if (Math.abs(m.rel(a.z, p.position)) < 6000 || Math.abs(m.rel(b.z, p.position)) < 6000) continue; // the test player doesn't react to collisions
      const d = m.rel(b.z, a.z);
      if (d > 0) obs.minGapSameLane = Math.min(obs.minGapSameLane, d - (a.type.lengthM + b.type.lengthM) * UNITS_PER_METRE * 0.5);
    }
    for (const c of active) {
      const lane = m.laneIndex(c.targetX);
      if (lastLane.has(c.id) && lastLane.get(c.id) !== lane) obs.laneChanges++;
      lastLane.set(c.id, lane);
    }
    for (const c of m.cars) if (!c.active) lastLane.delete(c.id);
  }
  return obs;
}

console.log('--- spawning, spacing and pooling ---');
{
  const m = make(1);
  const o = run(m, 60, 120, 0);
  check('traffic spawns', o.maxActive >= 6, `(max ${o.maxActive} active)`);
  check('never exceeds pool size', o.maxActive <= 40);
  check('same-lane cars keep a gap (no overlaps)', o.minGapSameLane > 200, `(min gap ${o.minGapSameLane === Infinity ? 'n/a' : o.minGapSameLane.toFixed(0)} units)`);
  check('cars change lanes sometimes', o.laneChanges > 0, `(${o.laneChanges} lane changes)`);
}

console.log('--- vehicle variety and speeds ---');
{
  const m = make(2);
  const seen = new Set<string>();
  const bad: string[] = [];
  const p: PlayerSample = { position: 0, playerX: 0, speedKph: 100 };
  for (let t = 0; t < 180; t += DT) {
    p.position = (p.position + 100 * WORLD_UNITS_PER_KPH * DT) % TRACK;
    m.update(DT, p);
    for (const c of m.cars) {
      if (!c.active) continue;
      seen.add(c.type.id);
      // Lane bias (0.88..1.12) widens each range; overtakers cruise up to ~55 km/h above the player (100).
      if (c.cruiseKph < c.type.minKph * 0.87 || c.cruiseKph > Math.max(c.type.maxKph * 1.13, 100 + 55)) bad.push(c.type.id);
      if (c.speedKph < 0 || c.speedKph > Math.max(c.type.maxKph * 1.3, 165)) bad.push(c.type.id + ':speed');
    }
  }
  check('all 6 vehicle types appear', seen.size === TRAFFIC_TYPES.length, `(${[...seen].join(', ')})`);
  check('cruise speeds stay in each type\'s range', bad.length === 0, bad.slice(0, 3).join(','));
}

console.log('--- passing and recycling ---');
{
  const m = make(3);
  run(m, 90, 140, 0);
  check('player passes slower cars', m.stats.passed > 5, `(${m.stats.passed} passed)`);
  const far = m.cars.filter((c) => c.active && Math.abs(m.rel(c.z, 0)) > 1e9).length;
  check('pool recycles (no stale cars far behind)', far === 0);
  const behindFar = m.cars.filter((c) => c.active && m.rel(c.z, 140 * WORLD_UNITS_PER_KPH * 90) < -9500).length;
  check('cars passed long ago are released', behindFar === 0);
}

console.log('--- pass events (used for panned whooshes) ---');
{
  const m = make(3);
  const p: PlayerSample = { position: 0, playerX: 0, speedKph: 140 };
  let events = 0, sameCount = 0, sameObject = true, first: unknown = null;
  for (let t = 0; t < 90; t += DT) {
    p.position = (p.position + 140 * WORLD_UNITS_PER_KPH * DT) % TRACK;
    const before = m.stats.passed;
    const ev = m.update(DT, p);
    first ??= ev;
    if (ev !== first) sameObject = false;
    events += ev.passes.length;
    if (ev.passes.length === m.stats.passed - before) sameCount++;
    for (const c of ev.passes) if (!c.passed || typeof c.x !== 'number') sameObject = false;
  }
  check('every overtaken car is reported once, with its lateral position', events === m.stats.passed && events > 5 && sameCount > 0, `(${events} reported, ${m.stats.passed} counted)`);
  check('the events object is reused (no per-frame garbage) and entries are valid', sameObject);
}

console.log('--- collisions ---');
{
  // Park a slow car right in the player's lane ahead and drive into it.
  const m = make(4, { ...DIFFICULTY.easy, density: 0.01 });
  const car = m.cars[0];
  car.active = true; car.type = TRAFFIC_TYPES[0]; car.z = 9000; car.x = car.targetX = 0; car.speedKph = 0; car.cruiseKph = 0; car.laneCooldown = 999;
  const p: PlayerSample = { position: 0, playerX: 0, speedKph: 100 };
  let hit: ReturnType<TrafficManager['update']>['hits'][number] | undefined;
  for (let t = 0; t < 10 && !hit; t += DT) {
    p.position += p.speedKph * WORLD_UNITS_PER_KPH * DT;
    car.speedKph = 0;
    hit = m.update(DT, p).hits[0];
  }
  check('rear-ending a stopped car in your lane is a collision', !!hit && hit.rearEnd, hit ? `(impact ${hit.impactKph.toFixed(0)} km/h)` : '');
  check('impact is based on closing speed', !!hit && Math.abs(hit.impactKph - 100) < 5);

  const m2 = make(5, { ...DIFFICULTY.easy, density: 0.01 });
  const c2 = m2.cars[0];
  c2.active = true; c2.type = TRAFFIC_TYPES[0]; c2.z = 9000; c2.x = c2.targetX = m2.laneX(2); c2.speedKph = 0; c2.cruiseKph = 0; c2.laneCooldown = 999;
  const p2: PlayerSample = { position: 0, playerX: m2.laneX(0), speedKph: 100 };
  let any2 = 0;
  for (let t = 0; t < 8; t += DT) { p2.position += p2.speedKph * WORLD_UNITS_PER_KPH * DT; c2.speedKph = 0; any2 += m2.update(DT, p2).hits.length; }
  check('passing two lanes away is not a collision', any2 === 0);

  // Only one hit event per impact (cooldown).
  const m3 = make(6, { ...DIFFICULTY.easy, density: 0.01 });
  const c3 = m3.cars[0];
  c3.active = true; c3.type = TRAFFIC_TYPES[0]; c3.z = 2000; c3.x = c3.targetX = 0; c3.speedKph = 0; c3.cruiseKph = 0; c3.laneCooldown = 999;
  const p3: PlayerSample = { position: 0, playerX: 0, speedKph: 3 };
  let hits3 = 0;
  for (let t = 0; t < 1; t += DT) { p3.position += 40; hits3 += m3.update(DT, p3).hits.length; }
  check('one collision event per impact', hits3 === 1, `(${hits3})`);
}

console.log('--- near misses ---');
{
  const m = make(7, { ...DIFFICULTY.easy, density: 0.01 });
  const car = m.cars[0];
  car.active = true; car.type = TRAFFIC_TYPES[0]; car.z = 8000; car.x = car.targetX = 0.45; car.speedKph = 60; car.cruiseKph = 60; car.laneCooldown = 999;
  const p: PlayerSample = { position: 0, playerX: 0, speedKph: 140 };
  let near = 0, hits = 0;
  for (let t = 0; t < 8; t += DT) {
    p.position += p.speedKph * WORLD_UNITS_PER_KPH * DT;
    car.targetX = 0.45; car.x = 0.45; car.laneCooldown = 999;
    const ev = m.update(DT, p);
    near += ev.nearMisses.length; hits += ev.hits.length;
  }
  check('passing very close without touching is a near miss', near === 1 && hits === 0, `(near ${near}, hits ${hits})`);

  const far = make(8, { ...DIFFICULTY.easy, density: 0.01 });
  const c = far.cars[0];
  c.active = true; c.type = TRAFFIC_TYPES[0]; c.z = 8000; c.x = c.targetX = far.laneX(2); c.speedKph = 60; c.cruiseKph = 60; c.laneCooldown = 999;
  const pf: PlayerSample = { position: 0, playerX: far.laneX(0), speedKph: 140 };
  let nf = 0;
  for (let t = 0; t < 8; t += DT) { pf.position += pf.speedKph * WORLD_UNITS_PER_KPH * DT; c.x = c.targetX = far.laneX(2); c.laneCooldown = 999; nf += far.update(DT, pf).nearMisses.length; }
  check('passing a full two lanes away is not a near miss', nf === 0);
}

console.log('--- AI rules ---');
{
  // A fast car behind a slow one with the player alongside must not cut into the player's lane.
  const m = make(9, { ...DIFFICULTY.normal, density: 0.01 });
  const slow = m.cars[0], fast = m.cars[1];
  for (const [c, z, spd] of [[slow, 10000, 60], [fast, 7000, 130]] as const) {
    c.active = true; c.type = TRAFFIC_TYPES[0]; c.z = z; c.x = c.targetX = 0; c.speedKph = spd; c.cruiseKph = spd; c.laneCooldown = 0;
  }
  const p: PlayerSample = { position: 7500, playerX: m.laneX(2), speedKph: 100 }; // right lane, alongside
  const lcSlow = m.laneClear(fast, 2, p); // evaluated before anything moves
  let unsafe = false;
  const lengthUnits = (4.8 * UNITS_PER_METRE);
  for (let t = 0; t < 4; t++) {
    for (let i = 0; i < 60; i++) {
      p.position += 100 * WORLD_UNITS_PER_KPH * DT;
      m.update(DT, p);
      const near = Math.abs(m.rel(fast.z, p.position)) < lengthUnits && Math.abs(fast.x - p.playerX) < 0.34;
      if (near) unsafe = true;
    }
  }
  check('car does not change into a lane occupied by the player', !unsafe);
  check('fast car slows behind a slower car rather than ramming it', m.rel(slow.z, fast.z) > 600 || fast.x !== slow.x, `(gap ${m.rel(slow.z, fast.z).toFixed(0)}, lane x ${fast.x.toFixed(2)} vs ${slow.x.toFixed(2)})`);
  check('lane-clear test rejects a lane the player occupies alongside', lcSlow === false);
}

console.log('--- lane discipline and overtakers ---');
{
  const m = make(14);
  const sum = [0, 0, 0], n = [0, 0, 0];
  let overtakerSeen = false;
  const seenIds = new Set<number>();
  const p: PlayerSample = { position: 0, playerX: 0, speedKph: 100 };
  for (let t = 0; t < 240; t += DT) {
    p.position = (p.position + 100 * WORLD_UNITS_PER_KPH * DT) % TRACK;
    m.update(DT, p);
    for (const c of m.cars) {
      if (!c.active) continue;
      const key = c.id * 100000 + Math.round(c.cruiseKph * 100);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        const lane = m.laneIndex(c.x);
        const ratio = c.cruiseKph / ((c.type.minKph + c.type.maxKph) / 2);
        if (m.rel(c.z, p.position) > 0) { sum[lane] += ratio; n[lane]++; }
      }
      if (m.rel(c.z, p.position) < -1000 && c.speedKph > 100 + 15) overtakerSeen = true;
    }
  }
  const avg = sum.map((s, i) => s / Math.max(1, n[i]));
  check('left lane is faster than the right lane on average', avg[0] > avg[2], `(relative speed L/M/R: ${avg.map((a) => a.toFixed(2)).join(' / ')})`);
  check('fast cars come up from behind a moving player', overtakerSeen);
}

console.log('--- difficulty scaling ---');
{
  const counts = (['easy', 'normal', 'hard', 'extreme'] as const).map((d) => {
    const m = make(10, DIFFICULTY[d]);
    let sum = 0, n = 0;
    const p: PlayerSample = { position: 0, playerX: 0, speedKph: 120 };
    for (let t = 0; t < 60; t += DT) {
      p.position = (p.position + 120 * WORLD_UNITS_PER_KPH * DT) % TRACK;
      m.update(DT, p);
      if (t > 20) { sum += m.activeCount; n++; }
    }
    return sum / n;
  });
  check('traffic density rises with difficulty', counts[0] < counts[1] && counts[1] < counts[2] && counts[2] < counts[3], `(avg active: ${counts.map((c) => c.toFixed(1)).join(' < ')})`);
  const a = difficultyForLevel(0.5), b = difficultyForLevel(2.5);
  check('difficultyForLevel interpolates and increases', b.density > a.density && b.speedMult > a.speedMult && a.density > DIFFICULTY.easy.density && a.density < DIFFICULTY.normal.density);
}

console.log('--- determinism ---');
{
  const snap = (seed: number) => {
    const m = make(seed);
    run(m, 30, 110, 0);
    return m.cars.filter((c: TrafficCar) => c.active).map((c) => `${c.type.id}:${c.z.toFixed(1)}:${c.x.toFixed(3)}`).join('|');
  };
  check('same seed gives identical traffic', snap(11) === snap(11));
  check('different seeds differ', snap(11) !== snap(12));
}

console.log('--- rear mirror feed ---');
{
  const m = make(13, { ...DIFFICULTY.easy, density: 0.01 });
  const c = m.cars[0];
  c.active = true; c.type = TRAFFIC_TYPES[1]; c.z = 5000; c.x = c.targetX = 0.2; c.speedKph = 100; c.cruiseKph = 100;
  const rc = m.rearCars({ position: 7000, playerX: 0, speedKph: 100 });
  check('cars behind the player appear in the mirror feed (gap to their front)', rc.length === 1 && Math.abs(rc[0].distance - (2000 - (TRAFFIC_TYPES[1].lengthM * UNITS_PER_METRE) / 2)) < 1, JSON.stringify(rc));
  check('cars ahead are not in the mirror feed', m.rearCars({ position: 3000, playerX: 0, speedKph: 100 }).length === 0);
}

console.log('--- car beside you (blind spot lamp) ---');
{
  const m = make(5);
  const put = (c: TrafficCar, x: number, rel: number, kph: number): void => { c.active = true; c.type = TRAFFIC_TYPES[0]; c.x = c.targetX = x; c.z = 100000 + rel; c.speedKph = kph; };
  const p: PlayerSample = { position: 100000, playerX: m.laneX(1), speedKph: 120 };
  const [a] = m.cars;
  check('empty road: nothing beside', !m.carBeside(p, -1) && !m.carBeside(p, 1));
  put(a, m.laneX(0), 0, 100);
  check('a car alongside on the left lights the left only', m.carBeside(p, -1) && !m.carBeside(p, 1));
  put(a, m.laneX(0), -6 * UNITS_PER_METRE, 100);
  check('a car just behind (blind spot) counts', m.carBeside(p, -1));
  put(a, m.laneX(0), -30 * UNITS_PER_METRE, 100);
  check('a car 30 m back does not', !m.carBeside(p, -1));
  put(a, m.laneX(0), 3 * UNITS_PER_METRE, 100);
  check('a car just ahead (front corner) counts', m.carBeside(p, -1));
  put(a, m.laneX(0), 25 * UNITS_PER_METRE, 100);
  check('a car 25 m ahead does not', !m.carBeside(p, -1));
  put(a, m.laneX(2), 0, 100);
  check('a car two lanes over does not count for the left', !m.carBeside(p, -1) && m.carBeside(p, 1));
  put(a, m.laneX(1), 0, 100);
  check('a car in your own lane does not light either side', !m.carBeside(p, -1) && !m.carBeside(p, 1));
}


console.log('--- the mirror and the hit test agree (passing long vehicles) ---');
for (const typeId of ['sedan', 'semi_truck', 'bus']) {
  const type = TRAFFIC_TYPES.find((t) => t.id === typeId)!;
  // The mirror reports the gap to the vehicle's front, not its middle.
  {
    const m = make(5);
    const c = m.cars[0];
    c.active = true; c.type = type; c.x = c.targetX = m.laneX(2); c.speedKph = 90; c.z = 100000 - 12 * UNITS_PER_METRE;
    const d = m.rearCars({ position: 100000, playerX: m.laneX(1), speedKph: 130 })[0].distance / UNITS_PER_METRE;
    check(`${type.name}: mirror shows the gap to its front (middle 12 m back)`, Math.abs(d - (12 - type.lengthM / 2)) < 0.01, `(${d.toFixed(1)} m)`);
  }
  // Pass it, wait until the mirror shows a 2 m gap, then move into its lane: no crash.
  const m = new TrafficManager({ trackLength: TRACK, lanes: 3, segmentLength: 200, drawDistance: 300, seed: 3, difficulty: { ...DIFFICULTY.normal, density: 0, laneChangeChance: 0 }, poolSize: 4 });
  const c = m.cars[0];
  c.active = true; c.type = type; c.x = c.targetX = m.laneX(2); c.cruiseKph = c.speedKph = 90; c.z = 100000 + 40 * UNITS_PER_METRE;
  const p: PlayerSample = { position: 100000, playerX: m.laneX(1), speedKph: 130 };
  let moving = false, hit = false;
  for (let t = 0; t < 12 && !hit; t += DT) {
    p.position += p.speedKph * WORLD_UNITS_PER_KPH * DT;
    const rc = m.rearCars(p)[0];
    if (!moving && rc && rc.distance >= 2 * UNITS_PER_METRE) moving = true;
    if (moving) p.playerX = Math.min(m.laneX(2), p.playerX + 0.9 * DT);
    if (m.update(DT, p).hits.length) hit = true;
  }
  check(`${type.name}: after passing, moving over once the mirror shows 2 m is safe`, moving && !hit);
}
console.log(failures === 0 ? '\nALL TRAFFIC CHECKS PASSED' : `\n${failures} TRAFFIC CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
