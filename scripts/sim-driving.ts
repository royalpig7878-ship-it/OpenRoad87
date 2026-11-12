// Headless checks of the driving model. Run: npm run test:sim
import { DrivingModel } from '../src/systems/DrivingModel';
import { VEHICLES } from '../src/vehicles/VehicleRoster';
import { roadEdges } from '../src/road/RoadLayout';
import { emptyInput, InputState } from '../src/controls/InputState';

const edges = roadEdges(3);
const DT = 1 / 60;
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const inp = (o: Partial<InputState>): InputState => ({ ...emptyInput(), ...o });
const straight = { curve: 0, barrier: false };

console.log('--- per-vehicle full-throttle run (auto) ---');
for (const v of VEHICLES) {
  const m = new DrivingModel(v, edges, 1e9);
  let t = 0, t100 = -1, t200 = -1, shifts = 0, maxRpm = 0, maxGear = 1;
  for (; t < 90; t += DT) {
    const s = m.update(DT, inp({ throttle: 1 }), straight);
    if (t100 < 0 && s.speedKph >= 100) t100 = t;
    if (t200 < 0 && s.speedKph >= 200) t200 = t;
    if (s.events.includes('shift')) shifts++;
    maxRpm = Math.max(maxRpm, s.rpm);
    maxGear = Math.max(maxGear, s.gear);
  }
  const top = m.state.speedKph;
  console.log(`${v.name.padEnd(17)} 0-100: ${t100.toFixed(1)}s  0-200: ${t200 < 0 ? 'n/a' : t200.toFixed(1) + 's'}  speed@90s: ${top.toFixed(0)} (spec ${v.topSpeedKph})  gears: ${maxGear}  shifts: ${shifts}  maxRpm: ${maxRpm.toFixed(0)}`);
  check(`${v.name}: reaches 0-100 in 3..10s`, t100 > 3 && t100 < 10);
  check(`${v.name}: reaches >=96% of top speed`, top >= v.topSpeedKph * 0.96 && top <= v.topSpeedKph * 1.01);
  check(`${v.name}: RPM within redline`, maxRpm <= v.redlineRpm * 1.01);
  check(`${v.name}: uses all 6 gears`, maxGear === 6);
}
const t0 = (id: string) => VEHICLES.find((v) => v.id === id)!;

console.log('--- braking ---');
{
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.state.speedKph = 200;
  let t = 0;
  while (m.state.speedKph > 0.5 && t < 30) { m.update(DT, inp({ brake: 1 }), straight); t += DT; }
  check('braking 200->0 in 4..9s', t > 4 && t < 9, `(${t.toFixed(1)}s)`);
}

console.log('--- coasting / engine braking ---');
{
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.state.speedKph = 150; m.transmission.gear = 5;
  for (let i = 0; i < 60 * 3; i++) m.update(DT, inp({}), straight);
  check('coasting 3s sheds speed but keeps momentum', m.state.speedKph < 148 && m.state.speedKph > 90, `(${m.state.speedKph.toFixed(0)} km/h)`);
}

console.log('--- off-road ---');
{
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.state.speedKph = 180; m.state.playerX = 2.2;
  for (let i = 0; i < 60 * 4; i++) m.update(DT, inp({ throttle: 1 }), straight);
  check('grass caps speed below 50% of top', m.state.speedKph < 215 * 0.5, `(${m.state.speedKph.toFixed(0)} km/h, surface ${m.state.surface})`);
}

console.log('--- steering & curves ---');
{
  const m = new DrivingModel(t0('night_hawk'), edges, 1e9);
  m.state.speedKph = 100; m.transmission.gear = 3;
  for (let i = 0; i < 60; i++) m.update(DT, inp({ throttle: 0.4, steer: 1 }), straight);
  check('steering right moves car right', m.state.playerX > 0.2, `(x=${m.state.playerX.toFixed(2)})`);
  const before = m.state.playerX;
  for (let i = 0; i < 10; i++) m.update(DT, inp({ throttle: 0.4 }), straight);
  check('steering has inertia (still moving right after release)', m.state.playerX > before);

  const hard = new DrivingModel(t0('night_hawk'), edges, 1e9);
  hard.state.speedKph = 220; hard.transmission.gear = 6;
  for (let i = 0; i < 60 * 2; i++) hard.update(DT, inp({ throttle: 0.7 }), { curve: 4, barrier: false });
  check('hands-off in a curve at 220 km/h pushes car off road', Math.abs(hard.state.playerX) > edges.road, `(x=${hard.state.playerX.toFixed(2)})`);

  const slow = new DrivingModel(t0('night_hawk'), edges, 1e9);
  slow.state.speedKph = 90; slow.transmission.gear = 3;
  for (let i = 0; i < 60 * 3; i++) slow.update(DT, inp({ throttle: 0.2 }), { curve: 4, barrier: false });
  check('hands-off at 90 km/h in same curve is manageable', Math.abs(slow.state.playerX) < Math.abs(hard.state.playerX), `(x=${slow.state.playerX.toFixed(2)})`);

  // Holding only the throttle through a bend: the car goes straight on, leaves the road and crashes into the rail.
  for (const [kph, curve] of [[80, 2], [120, 4], [160, 6]] as const) {
    const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
    m.state.speedKph = kph; m.transmission.gear = 4;
    let hitAt = -1, speedAtHit = 0;
    for (let i = 0; i < 60 * 8 && hitAt < 0; i++) {
      const s = m.update(DT, inp({ throttle: 1 }), { curve, barrier: true });
      if (s.events.includes('barrier_hit')) { hitAt = i / 60; speedAtHit = s.speedKph; }
    }
    check(`throttle only, bend ${curve} at ${kph} km/h: hits the rail within 6 s and loses much of its speed`, hitAt > 0 && hitAt < 6 && speedAtHit < kph * 0.65, `(hit at ${hitAt.toFixed(1)}s, ${speedAtHit.toFixed(0)} km/h after)`);
  }

  const grippy = new DrivingModel(t0('phantom_x'), edges, 1e9);
  const mushy = new DrivingModel(t0('thunder_v8'), edges, 1e9);
  for (const c of [grippy, mushy]) { c.state.speedKph = 150; c.transmission.gear = 4; }
  for (let i = 0; i < 60; i++) { grippy.update(DT, inp({ throttle: 0.5, steer: 1 }), straight); mushy.update(DT, inp({ throttle: 0.5, steer: 1 }), straight); }
  check('higher-handling car turns in faster', grippy.state.playerX > mushy.state.playerX, `(${grippy.state.playerX.toFixed(2)} vs ${mushy.state.playerX.toFixed(2)})`);
}

console.log('--- barrier collision ---');
{
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.state.speedKph = 180; m.state.playerX = edges.shoulder + 0.1; m.transmission.gear = 5;
  const s = m.update(DT, inp({ throttle: 1 }), { curve: 0, barrier: true });
  check('barrier hit slows car, damages it and pushes it back', s.events.includes('barrier_hit') && s.speedKph < 120 && s.damage > 5 && Math.abs(s.playerX) < edges.shoulder, `(dmg ${s.damage.toFixed(1)}, ${s.speedKph.toFixed(0)} km/h)`);
  const tough = new DrivingModel(t0('thunder_v8'), edges, 1e9);
  const frail = new DrivingModel(t0('phantom_x'), edges, 1e9);
  tough.applyImpact(100); frail.applyImpact(100);
  check('damage resistance differs per vehicle', tough.state.damage < frail.state.damage);
  // A realistic scrape: pressed against the rail for two seconds at 120 km/h is ONE incident, not a wreck.
  const scrape = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  scrape.state.speedKph = 120; scrape.state.playerX = edges.shoulder + 0.1; scrape.transmission.gear = 5;
  let events = 0;
  for (let i = 0; i < 120; i++) {
    const st = scrape.update(DT, inp({ throttle: 1, steer: 1 }), { curve: 0, barrier: true });
    events += st.events.filter((e) => e === 'barrier_hit').length;
    if (Math.abs(st.playerX) < edges.shoulder - 0.4) st.playerX = edges.shoulder + 0.1; // keep leaning on the rail
  }
  check('a two-second scrape along the guardrail at 120 km/h causes under 20% damage', scrape.state.damage < 20, `(${scrape.state.damage.toFixed(1)}%)`);
  check('and counts as a few incidents, not one per frame (at most one hit event per half second)', events >= 1 && events <= 5, `(${events} events in 2 s)`);
  const single = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  single.state.speedKph = 100; single.state.playerX = edges.shoulder + 0.1; single.transmission.gear = 4;
  single.update(DT, inp({ throttle: 1 }), { curve: 0, barrier: true });
  check('one guardrail hit at 100 km/h is a light bump: under 10% damage, so no cracked windshield', single.state.damage > 1 && single.state.damage < 10, `(${single.state.damage.toFixed(1)}%)`);
}

console.log('--- damage affects performance ---');
{
  const a = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  const b = new DrivingModel(t0('vortex_gt'), edges, 1e9, undefined, 80);
  for (let i = 0; i < 60 * 40; i++) { a.update(DT, inp({ throttle: 1 }), straight); b.update(DT, inp({ throttle: 1 }), straight); }
  check('80% damage lowers top speed', b.state.speedKph < a.state.speedKph * 0.9, `(${b.state.speedKph.toFixed(0)} vs ${a.state.speedKph.toFixed(0)})`);
}

console.log('--- fuel ---');
{
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9, 0.5);
  let empty = false;
  for (let i = 0; i < 60 * 30 && !empty; i++) empty = m.update(DT, inp({ throttle: 1 }), straight).events.includes('out_of_fuel');
  check('fuel runs out and raises event', empty);
  for (let i = 0; i < 60 * 40; i++) m.update(DT, inp({ throttle: 1 }), straight);
  check('car coasts to a stop with no fuel', m.state.speedKph < 30, `(${m.state.speedKph.toFixed(0)} km/h)`);
  const full = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  for (let i = 0; i < 60 * 60; i++) full.update(DT, inp({ throttle: 1 }), straight);
  const used = full.vehicle.fuelCapacity - full.state.fuel;
  check('a full tank lasts roughly 6-15 minutes at full throttle', used > 3 && used < 8.5, `(used ${used.toFixed(1)} L in 60s of ${full.vehicle.fuelCapacity} L)`);
}

console.log('--- manual transmission ---');
{
  const m = new DrivingModel(t0('apex_xr'), edges, 1e9);
  m.transmission.mode = 'manual';
  for (let i = 0; i < 60 * 5; i++) m.update(DT, inp({ throttle: 1 }), straight);
  check('manual stays in gear 1 without input (hits limiter)', m.state.gear === 1 && m.state.speedKph < 60, `(${m.state.speedKph.toFixed(0)} km/h)`);
  m.update(DT, inp({ gearUp: true }), straight);
  check('gear up works', m.state.gear === 2);
  m.update(DT, inp({ gearDown: true }), straight);
  check('gear down works', m.state.gear === 1);
  m.state.speedKph = 150; m.transmission.gear = 5;
  m.update(DT, inp({ gearDown: true }), straight);
  m.update(DT, inp({ gearDown: true }), straight);
  m.update(DT, inp({ gearDown: true }), straight);
  m.update(DT, inp({ gearDown: true }), straight);
  check('over-rev downshift is refused', m.state.gear > 2, `(gear ${m.state.gear})`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
