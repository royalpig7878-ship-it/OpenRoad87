// Headless checks of the police and pursuit system. Run: npm run sim:police (also part of npm run test:sim)
import { PoliceManager, PoliceEvents } from '../src/police/PoliceManager';
import { POLICE_LEVELS, POLICE_TYPE, SPEED_TOLERANCE } from '../src/police/PoliceData';
import { UNITS_PER_METRE } from '../src/traffic/TrafficData';
import { WORLD_UNITS_PER_KPH } from '../src/systems/DrivingModel';
import { PlayerSample } from '../src/traffic/TrafficManager';

const TRACK = 5000 * 200;
const DT = 1 / 60;
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const make = (level = 2, seed = 5, limit = 120) => {
  const m = new PoliceManager({ trackLength: TRACK, lanes: 3, segmentLength: 200, drawDistance: 300, seed, level });
  m.setSpeedLimit(limit);
  return m;
};

interface Run {
  events: PoliceEvents[];
  started?: number;
  endedAt?: number;
  result?: NonNullable<PoliceEvents['result']>;
  maxUnits: number;
  blocked: boolean;
  maxStage: number;
}

/** Drive a constant-speed player and record what the police do. `until` stops early when it returns true. */
function run(m: PoliceManager, seconds: number, speed: number, x = 0, setup?: (p: PlayerSample, t: number, m: PoliceManager) => void): Run {
  const p: PlayerSample = { position: 1000, playerX: x, speedKph: speed };
  const r: Run = { events: [], maxUnits: 0, blocked: false, maxStage: 1 };
  for (let t = 0; t < seconds; t += DT) {
    setup?.(p, t, m);
    p.position = (p.position + p.speedKph * WORLD_UNITS_PER_KPH * DT) % TRACK;
    const ev = m.update(DT, p);
    if (ev.started && r.started === undefined) r.started = t;
    if (ev.result) { r.endedAt = t; r.result = ev.result; }
    r.maxUnits = Math.max(r.maxUnits, m.activeUnits.length);
    r.maxStage = Math.max(r.maxStage, m.stage);
    for (const u of m.activeUnits) if (u.mode === 'block' && u.phase === 'cut' && m.rel(u.z, p.position) > 0 && Math.abs(u.x - p.playerX) < 0.35) r.blocked = true;
    if (r.result && m.state === 'idle') break;
  }
  return r;
}

/** No cops anywhere: removes every idle cruiser each frame. */
const noCops = (_p: PlayerSample, _t: number, mm: PoliceManager) => { for (const u of mm.units) if (u.mode === 'patrol' || u.mode === 'parked') u.active = false; };
/** Parks a speed-trap cruiser on the right shoulder `ahead` world units in front of the player. */
const trap = (m: PoliceManager, p: PlayerSample, ahead: number) => {
  const u = m.units.find((x) => !x.active)!;
  (m as unknown as { park: (u: unknown, z: number, side: number) => void }).park(u, p.position + ahead, 1);
  u.prevRel = ahead;
  return u;
};

console.log('--- police only react to what they can see ---');
{
  const free = make(2);
  const r = run(free, 90, 260, 0, noCops);
  check('with no cop around you can speed as much as you like', r.started === undefined && free.heat === 0);
  const crash = make(2);
  const p: PlayerSample = { position: 0, playerX: 0, speedKph: 100 };
  for (let i = 0; i < 6; i++) crash.update(DT, p, { trafficHits: 1, barrierHits: 0, nearMisses: 0 });
  check('crashing with no cop around does not start a pursuit', crash.state === 'idle' && crash.heat === 0);
  const ok = make(2); run(ok, 120, 120 + SPEED_TOLERANCE - 1);
  check('driving at the limit (plus tolerance) never attracts police, even past cops', ok.heat === 0 && ok.state === 'idle');
}

console.log('--- speed traps parked on the shoulder ---');
{
  const m = make(2);
  let parkedSeen = false, onShoulder = true, still = true;
  run(m, 70, 110, 0, (_p, _t, mm) => {
    for (const u of mm.units) if (u.active && u.mode === 'parked') {
      parkedSeen = true;
      if (Math.abs(u.x) < 1.05) onShoulder = false;
      if (u.speedKph !== 0 || u.sirens) still = false;
    }
  });
  check('cruisers sit parked on the shoulder now and then', parkedSeen);
  check('a parked cruiser is off the road, stopped, lights off', parkedSeen && onShoulder && still);

  // Blow past a parked cop: it pulls out with the lights on and comes after you.
  const fast = make(2, 7);
  const pf: PlayerSample = { position: 1000, playerX: 0, speedKph: 190 };
  const cop = trap(fast, pf, 3000);
  let started = false, catchUp = 0;
  for (let t = 0; t < 12; t += DT) {
    pf.position += pf.speedKph * WORLD_UNITS_PER_KPH * DT;
    const ev = fast.update(DT, pf);
    if (ev.started) started = true;
    if (started) catchUp = Math.max(catchUp, cop.speedKph);
    for (const u of fast.units) if (u !== cop && (u.mode === 'patrol' || u.mode === 'parked')) u.active = false;
  }
  check('speeding past a parked cop starts a pursuit, and that cop is the one chasing', started && cop.active && cop.mode !== 'parked' && cop.sirens);
  check('it pulls out hard and gets up to speed', catchUp > 150, `(${catchUp.toFixed(0)} km/h within 12 s)`);

  const legal = make(2, 7);
  const pl: PlayerSample = { position: 1000, playerX: 0, speedKph: 125 };
  trap(legal, pl, 3000);
  for (let t = 0; t < 6; t += DT) { pl.position += pl.speedKph * WORLD_UNITS_PER_KPH * DT; legal.update(DT, pl); }
  check('driving past a parked cop at the limit is fine', legal.state === 'idle');

  // Heat while in sight.
  const seen = make(2, 8);
  const ps: PlayerSample = { position: 1000, playerX: 0, speedKph: 175 };
  const c2 = trap(seen, ps, 38000);
  let watchedAt = -1;
  for (let t = 0; t < 1.5; t += DT) { ps.position += ps.speedKph * WORLD_UNITS_PER_KPH * DT; seen.update(DT, ps); if (seen.watched && watchedAt < 0) watchedAt = t; }
  check('a cop up ahead sees you speeding: heat builds', seen.watched && seen.heat > 3 && c2.mode === 'parked', `(heat ${seen.heat.toFixed(1)})`);
  check('the cop ahead is reported for a warning', seen.copAhead < 40000);
  seen.units.forEach((u) => (u.active = false));
  const h0 = seen.heat;
  for (let t = 0; t < 6; t += DT) { ps.position += ps.speedKph * WORLD_UNITS_PER_KPH * DT; seen.update(DT, ps); noCops(ps, t, seen); }
  check('out of sight the heat fades away', seen.heat < h0 && seen.heat === 0 && !seen.watched, `(${h0.toFixed(1)} -> ${seen.heat.toFixed(1)})`);

  const reck = make(2, 9);
  const pr: PlayerSample = { position: 1000, playerX: 0, speedKph: 100 };
  trap(reck, pr, 20000);
  for (let i = 0; i < 4; i++) reck.update(DT, pr, { trafficHits: 1, barrierHits: 0, nearMisses: 0 });
  check('crashing in front of a cop starts a pursuit', reck.state === 'pursuit');
  const near = make(2, 9);
  trap(near, pr, 20000);
  for (let i = 0; i < 10; i++) near.update(DT, pr, { trafficHits: 0, barrierHits: 0, nearMisses: 1 });
  check('a few near misses in view add a little heat but not a pursuit', near.heat > 10 && near.state === 'idle', `(${near.heat.toFixed(0)})`);

  const heatAfter = (level: number) => {
    const m2 = make(level, 10);
    const q: PlayerSample = { position: 1000, playerX: 0, speedKph: 190 };
    const u = trap(m2, q, 30000);
    for (let t = 0; t < 1; t += DT) { m2.update(DT, q); u.z = q.position + 30000; }
    return m2.heat;
  };
  check('higher police levels notice speeding sooner', heatAfter(4) > heatAfter(1), `(${heatAfter(4).toFixed(1)} vs ${heatAfter(1).toFixed(1)})`);

  // In a pursuit, passing a parked cop brings it in as a reinforcement (when there is room).
  const pur = make(3, 11);
  const pp: PlayerSample = { position: 1000, playerX: 0, speedKph: 200 };
  pur.startPursuit(pp);
  const extra = trap(pur, pp, 2500);
  let joined = false;
  for (let t = 0; t < 3; t += DT) { pp.position += pp.speedKph * WORLD_UNITS_PER_KPH * DT; const ev = pur.update(DT, pp); if (ev.reinforcement && extra.mode !== 'parked') joined = true; pur.bust = 0; }
  check('during a chase, a speed trap you pass joins in', joined);
  check('parked cops do not stop you escaping', (() => {
    const e = make(1, 12); const q: PlayerSample = { position: 1000, playerX: 0, speedKph: 300 };
    e.startPursuit(q);
    const r2 = run(e, 60, 300, 0, (pl2, t, mm) => { if (t === 0) { mm.startPursuit(pl2); } if (t > 0.5 && t < 0.52) trap(mm, pl2, 30000); });
    return r2.result?.outcome === 'escaped';
  })());
}

console.log('--- patrol cars in traffic ---');
{
  const m = make(2);
  let patrolSeen = false;
  const r = run(m, 90, 170, 0, (_p, _t, mm) => { if (mm.units.some((u) => u.active && u.mode === 'patrol')) patrolSeen = true; mm.heat = Math.min(mm.heat, 50); });
  check('patrol cruisers appear ahead in traffic', patrolSeen);
  check('passing a patrol car while speeding starts a pursuit', r.started !== undefined, `(${r.started?.toFixed(1)}s)`);
  const calm = make(2);
  const rc = run(calm, 120, 110);
  check('passing a patrol car at the limit does not', rc.started === undefined);
}

console.log('--- catching and escaping ---');
{
  const start = (level: number) => { const m = make(level, 11); const p: PlayerSample = { position: 1000, playerX: 0, speedKph: 200 }; m.startPursuit(p); return m; };
  const phantom = start(1);
  const re = run(phantom, 80, 300, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 300 }); });
  check('a fast car (300 km/h) escapes level 1 police', re.result?.outcome === 'escaped', `(${re.result?.outcome} after ${re.endedAt?.toFixed(1)}s)`);
  const vortex = run(make(4, 12), 90, 215, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 215 }); });
  check('a 215 km/h car is caught by the elite unit', vortex.result?.outcome === 'busted', `(${vortex.result?.outcome} after ${vortex.endedAt?.toFixed(1)}s)`);
  const stopped = run(make(1, 13), 60, 20, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 20 }); });
  check('stopping gets you arrested quickly', stopped.result?.outcome === 'busted' && (stopped.endedAt ?? 99) < 30, `(${stopped.endedAt?.toFixed(1)}s)`);
}

console.log('--- results and rewards ---');
{
  const esc = run(make(3, 14), 90, 320, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 320 }); });
  const bus = run(make(3, 14), 90, 150, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 150 }); });
  check('escaping pays cash and reputation, no fine', esc.result?.outcome === 'escaped' && esc.result.cash > 0 && esc.result.fine === 0 && esc.result.reputation > 0, JSON.stringify(esc.result));
  check('being busted costs a fine and reputation, no cash', bus.result?.outcome === 'busted' && bus.result.fine > 0 && bus.result.cash === 0 && bus.result.reputation < 0);
  const rewards = POLICE_LEVELS.map((l) => l.reward);
  check('rewards and fines grow with the level', rewards.every((v, i) => i === 0 || v > rewards[i - 1]) && POLICE_LEVELS.every((l, i) => i === 0 || l.fine > POLICE_LEVELS[i - 1].fine));
  check('an escape scores more than a bust', (esc.result?.score ?? 0) > (bus.result?.score ?? 1e9));
}

console.log('--- pursuit tactics ---');
{
  const r = run(make(4, 15), 40, 205, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 205 }); });
  const inLaneAhead = r.blocked;
  // Elite police should try to get ahead and block over a long chase of a car they cannot instantly catch.
  let blockRuns = 0;
  for (let seed = 20; seed < 28; seed++) {
    const rr = run(make(4, seed), 45, 235, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 235 }); });
    if (rr.blocked) blockRuns++;
  }
  check('elite cruisers attempt blocks (get ahead and cut into your lane)', inLaneAhead || blockRuns > 0, `(blocked in ${blockRuns}/8 runs)`);
  const l1 = [];
  for (let seed = 30; seed < 36; seed++) {
    const rr = run(make(1, seed), 45, 190, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 190 }); });
    l1.push(rr.blocked);
  }
  check('level 1 patrol never blocks', l1.every((b) => !b));

  // Level 2 cruisers top out at 228: a player holding exactly that pace can't be caught until reinforcements arrive.
  const esc = run(make(2, 16), 100, 228, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 228 }); });
  check('the pursuit escalates over time (more units and a higher stage)', esc.maxStage >= 2 && esc.maxUnits >= 2, `(stage ${esc.maxStage}, units ${esc.maxUnits}, ${esc.result?.outcome})`);
}

console.log('--- collisions with police ---');
{
  const m = make(1, 17);
  const p: PlayerSample = { position: 1000, playerX: 0, speedKph: 40 };
  m.startPursuit(p);
  let hits = 0;
  for (let t = 0; t < 30 && hits === 0; t += DT) {
    p.position += p.speedKph * WORLD_UNITS_PER_KPH * DT;
    // Don't let the bust end the test first.
    const ev = m.update(DT, p);
    hits += ev.hits.length;
    if (m.state !== 'pursuit') break;
    m.bust = 0;
  }
  check('a cruiser running into a slow player is reported as a hit', hits > 0);
}

console.log('--- mirror, cooldown, toggle ---');
{
  const m = make(2, 18);
  const p: PlayerSample = { position: 5000, playerX: 0, speedKph: 150 };
  m.startPursuit(p);
  const u = m.activeUnits[0];
  u.z = p.position - 3000;
  const rv = m.rearView(p);
  check('police behind you appear in the mirror with lights flashing (gap to the cruiser front)', rv.length === 1 && rv[0].lights && Math.abs(rv[0].distance - (3000 - (POLICE_TYPE.lengthM * UNITS_PER_METRE) / 2)) < 1);

  const c = make(2, 19);
  const r = run(c, 90, 330, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 330 }); });
  check('pursuit ends and the world returns to idle', r.result !== undefined && c.state === 'idle');
  const before = c.heat;
  run(c, 5, 260);
  check('a cooldown follows a pursuit (heat does not build straight away)', before === 0 && c.heat < 5, `(${c.heat.toFixed(1)})`);

  const off = make(2, 20);
  off.enabled = false;
  const ro = run(off, 40, 280);
  check('police can be switched off', ro.started === undefined && off.state === 'idle');

  const a = run(make(2, 21), 60, 210, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 210 }); });
  const b = run(make(2, 21), 60, 210, 0, (_p, t, mm) => { if (t === 0) mm.startPursuit({ position: 1000, playerX: 0, speedKph: 210 }); });
  check('same seed gives the same pursuit', JSON.stringify(a.result) === JSON.stringify(b.result));
}

console.log(failures === 0 ? '\nALL POLICE CHECKS PASSED' : `\n${failures} POLICE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
