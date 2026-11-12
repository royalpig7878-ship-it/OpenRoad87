// Headless checks of the driving model. Run: npm run test:sim
import { BLOW_AFTER, DrivingModel, ENGINE_HOT } from '../src/systems/DrivingModel';
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
  let t = 0, t100 = -1, t200 = -1, shifts = 0, maxRpm = 0, maxGear = 1, maxTemp = 0;
  for (; t < 90; t += DT) {
    m.state.engineTemp = 0.45; // performance only here: engine heat is checked in its own section
    const s = m.update(DT, inp({ throttle: 1 }), straight);
    if (t100 < 0 && s.speedKph >= 100) t100 = t;
    if (t200 < 0 && s.speedKph >= 200) t200 = t;
    if (s.events.includes('shift')) shifts++;
    maxRpm = Math.max(maxRpm, s.rpm);
    maxGear = Math.max(maxGear, s.gear);
    maxTemp = Math.max(maxTemp, s.engineTemp);
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
  m.state.speedKph = 82; m.transmission.gear = 3;
  for (let i = 0; i < 60; i++) m.update(DT, inp({ throttle: 0.4, steer: 1 }), straight);
  check('steering right moves car right', m.state.playerX > 0.2, `(x=${m.state.playerX.toFixed(2)})`);
  const before = m.state.playerX;
  for (let i = 0; i < 10; i++) m.update(DT, inp({ throttle: 0.4 }), straight);
  check('steering has inertia (still moving right after release)', m.state.playerX > before);

  const hard = new DrivingModel(t0('night_hawk'), edges, 1e9);
  hard.state.speedKph = 220; hard.transmission.gear = 6;
  for (let i = 0; i < 60 * 2; i++) hard.update(DT, inp({ throttle: 0.7 }), { curve: 4, barrier: false });
  check('hands-off in a curve at 220 km/h pushes car off road', Math.abs(hard.state.playerX) > edges.road, `(x=${hard.state.playerX.toFixed(2)})`);

  // No auto-follow: hands off, even at 90 km/h the car goes straight on and runs wide (just later than at 220).
  const slow = new DrivingModel(t0('night_hawk'), edges, 1e9);
  slow.state.speedKph = 90; slow.transmission.gear = 3;
  let slowOff = -1;
  for (let i = 0; i < 60 * 6 && slowOff < 0; i++) { slow.update(DT, inp({ throttle: 0.2 }), { curve: 4, barrier: false }); if (Math.abs(slow.state.playerX) > edges.road) slowOff = i / 60; }
  check('hands-off at 90 km/h the car does not follow the bend: it leaves the road within 3 s', slowOff > 0 && slowOff < 3, `(${slowOff.toFixed(1)}s)`);
  // ...but a driver who steers holds the same bend.
  const held = new DrivingModel(t0('night_hawk'), edges, 1e9);
  let worst = 0;
  for (let i = 0; i < 60 * 6; i++) {
    held.state.speedKph = 90;
    const steer = Math.max(-1, Math.min(1, -held.state.playerX * 2 - held.state.heading * 25));
    held.update(DT, inp({ throttle: 0.3, steer }), { curve: 4, barrier: false });
    worst = Math.max(worst, Math.abs(held.state.playerX));
  }
  check('steering through the same bend at 90 km/h keeps the car in its lane', worst < 0.5, `(worst |x| ${worst.toFixed(2)})`);
  // On a straight the car straightens up by itself after a lane change (no endless drift).
  const lane = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  for (let i = 0; i < 60 * 3; i++) { lane.state.speedKph = 120; lane.update(DT, inp({ throttle: 0.4, steer: i < 30 ? 1 : 0 }), straight); }
  const xAfter = lane.state.playerX;
  for (let i = 0; i < 60; i++) { lane.state.speedKph = 120; lane.update(DT, inp({ throttle: 0.4 }), straight); }
  check('on a straight the car straightens up after a lane change', Math.abs(lane.state.playerX - xAfter) < 0.02 && xAfter > 0.3, `(x ${xAfter.toFixed(2)} -> ${lane.state.playerX.toFixed(2)})`);

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
  for (let i = 0; i < 60 * 60; i++) { full.state.engineTemp = 0.45; full.update(DT, inp({ throttle: 1 }), straight); }
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

console.log('--- engine heat and breakdowns ---');
{
  // Manual, stuck in 2nd with the throttle pinned: on the rev limiter.
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.transmission.toggleMode();
  m.update(DT, inp({ gearUp: true }), straight);
  let hotAt = -1, overAt = -1, blownAt = -1, t = 0;
  for (; t < 30 && blownAt < 0; t += DT) {
    const s = m.update(DT, inp({ throttle: 1 }), straight);
    if (s.events.includes('engine_hot')) hotAt = t;
    if (s.events.includes('overheat')) overAt = t;
    if (s.events.includes('engine_blown')) blownAt = t;
  }
  check('holding the redline (after a couple of seconds revving up) warns "engine hot" within 9 s', hotAt > 4 && hotAt < 9, `(${hotAt.toFixed(1)} s)`);
  check('and overheats after 6-12 s', overAt > 6 && overAt < 12, `(${overAt.toFixed(1)} s)`);
  check(`and blows the engine about ${BLOW_AFTER} s after overheating`, blownAt > overAt + BLOW_AFTER - 0.5 && blownAt < overAt + BLOW_AFTER + 2, `(${blownAt.toFixed(1)} s)`);
  check('a blown engine adds damage', m.state.damage >= 20, `(${m.state.damage.toFixed(0)}%)`);
  const v0 = m.state.speedKph;
  for (let i = 0; i < 180; i++) m.update(DT, inp({ throttle: 1 }), straight);
  check('a blown engine gives no power: the car coasts down', m.state.speedKph < v0 - 3 && m.state.rpm === 0, `(${v0.toFixed(0)} -> ${m.state.speedKph.toFixed(0)} km/h)`);
  m.resetEngine();
  check('towing/repairing resets the engine', !m.state.engineBlown && m.state.engineTemp < ENGINE_HOT);
}
{
  // Overheat, then shift up and cruise: it cools and gets full power back without blowing.
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.transmission.toggleMode();
  m.update(DT, inp({ gearUp: true }), straight);
  for (let t = 0; t < 30 && !m.state.overheated; t += DT) m.update(DT, inp({ throttle: 1 }), straight);
  const limpAccel = (() => { const a = m.state.speedKph; return a; })();
  check('limp mode is on once overheated', m.state.overheated);
  for (let i = 0; i < 3; i++) { m.update(DT, inp({ gearUp: true }), straight); for (let k = 0; k < 20; k++) m.update(DT, inp({ throttle: 0.5 }), straight); }
  let cooledAt = -1;
  for (let t = 0; t < 40 && cooledAt < 0; t += DT) if (m.update(DT, inp({ throttle: 0.5 }), straight).events.includes('engine_cooled')) cooledAt = t;
  check('shifting up and easing off cools it back to full power within 15 s', cooledAt > 0 && cooledAt < 15 && !m.state.engineBlown, `(${cooledAt.toFixed(1)} s, from ${limpAccel.toFixed(0)} km/h)`);
}
{
  // Limp mode really costs power.
  const a = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  const b = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  b.state.engineTemp = 1; b.state.overheated = true;
  for (let i = 0; i < 120; i++) { a.update(DT, inp({ throttle: 1 }), straight); b.update(DT, inp({ throttle: 1 }), straight); }
  check('an overheated car accelerates much slower', b.state.speedKph < a.state.speedKph * 0.75, `(${b.state.speedKph.toFixed(0)} vs ${a.state.speedKph.toFixed(0)} km/h after 2 s)`);
}
{
  // Bad downshift.
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  m.transmission.toggleMode();
  m.state.speedKph = 82; m.transmission.gear = 3;
  const s = m.update(DT, inp({ gearDown: true }), straight);
  check('a downshift past the redline over-revs and does a little damage', s.events.includes('over_rev') && s.damage > 0 && s.damage < 10, `(${s.damage.toFixed(1)}%)`);
}
{
  // Brake fade.
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  let fadedAt = -1;
  for (let stop = 0; stop < 6 && fadedAt < 0; stop++) {
    m.state.speedKph = 200;
    for (let t = 0; t < 10 && m.state.speedKph > 1; t += DT) if (m.update(DT, inp({ brake: 1 }), straight).events.includes('brakes_fading')) fadedAt = stop;
  }
  check('one hard stop from 200 does not fade the brakes, back-to-back stops do', fadedAt >= 1 && fadedAt <= 4, `(faded on stop ${fadedAt + 1})`);
}

{
  // Automatic, pedal floored and never lifted: overheats too, just more slowly than sitting on the redline.
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  let hotAt = -1, overAt = -1;
  for (let t = 0; t < 60 && overAt < 0; t += DT) {
    const s = m.update(DT, inp({ throttle: 1 }), straight);
    if (s.events.includes('engine_hot')) hotAt = t;
    if (s.events.includes('overheat')) overAt = t;
  }
  check('automatic floored: "engine hot" after 12-20 s', hotAt > 12 && hotAt < 20, `(${hotAt.toFixed(1)} s)`);
  check('automatic floored: overheats after 20-32 s', overAt > 20 && overAt < 32, `(${overAt.toFixed(1)} s)`);
  // Lifting off for a moment every 10 s keeps it from overheating.
  const c = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  let maxT = 0;
  for (let t = 0; t < 90; t += DT) { const s = c.update(DT, inp({ throttle: t % 10 < 7 ? 1 : 0.6 }), straight); maxT = Math.max(maxT, s.engineTemp); }
  check('easing to part throttle now and then keeps it from overheating', maxT < 1, `(max ${maxT.toFixed(2)})`);
}
{
  // Pickups.
  const m = new DrivingModel(t0('vortex_gt'), edges, 1e9, 10, 60);
  m.addFuel(1000);
  check('gas pickup fills up to the tank size', m.state.fuel === m.vehicle.fuelCapacity);
  m.repairBy(25);
  check('repair pickup takes damage off', Math.abs(m.state.damage - 35) < 0.01, `(${m.state.damage})`);
  const a = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  const b = new DrivingModel(t0('vortex_gt'), edges, 1e9);
  for (let i = 0; i < 60 * 40; i++) { a.update(DT, inp({ throttle: 0.9 }), straight); b.update(DT, inp({ throttle: 0.9 }), straight); }
  b.startBoost();
  let peak = 0;
  for (let i = 0; i < 60 * 4; i++) { a.update(DT, inp({ throttle: 0.9 }), straight); peak = Math.max(peak, b.update(DT, inp({ throttle: 0.9 }), straight).speedKph); }
  check('boost pushes past normal top speed', peak > a.state.speedKph + 8 && peak <= m.vehicle.topSpeedKph * 1.16, `(${peak.toFixed(0)} vs ${a.state.speedKph.toFixed(0)} km/h)`);
  for (let i = 0; i < 60 * 10; i++) b.update(DT, inp({ throttle: 0.9 }), straight);
  check('and wears off afterwards', !b.state.boosting && b.state.speedKph < peak - 5, `(${b.state.speedKph.toFixed(0)} km/h)`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
