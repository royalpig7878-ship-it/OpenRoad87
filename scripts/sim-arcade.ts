// Headless checks of arcade challenges: rules, scoring, medals and high scores.
import { ArcadeFrame, ArcadeSession, COUNTDOWN_SECONDS, SCORE, UNITS_PER_METRE_DRIVEN, medalFor } from '../src/arcade/ArcadeSession';
import { CHALLENGES, getChallenge } from '../src/arcade/Challenges';
import { createProfile, bestScore, deserializeProfile, recordScore, serializeProfile } from '../src/economy/Profile';
import { WORLD_UNITS_PER_KPH } from '../src/systems/DrivingModel';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const DT = 1 / 60;
const frame = (o: Partial<ArcadeFrame> = {}): ArcadeFrame => ({ speedKph: 150, damage: 0, fuel: 50, nearMisses: 0, trafficHits: 0, escapes: 0, busted: false, ...o });

/** Run a session at constant speed until it finishes (or `max` seconds); `tweak` can change the frame over time. */
function play(id: string, speed: number, max = 400, tweak?: (t: number, f: ArcadeFrame) => void) {
  const s = new ArcadeSession(getChallenge(id));
  const f = frame({ speedKph: speed });
  const events = { checkpoints: 0, go: 0, warnings: 0 };
  for (let t = 0; t < max && s.phase !== 'finished'; t += DT) {
    tweak?.(t, f);
    const ev = s.update(DT, f);
    if (ev.checkpoint) events.checkpoints++;
    if (ev.go) events.go++;
    if (ev.warning) events.warnings++;
  }
  return { s, events };
}

console.log('--- units ---');
check('world units per metre driven match the driving model', UNITS_PER_METRE_DRIVEN === Math.round(WORLD_UNITS_PER_KPH * 3.6));

console.log('--- countdown ---');
{
  const s = new ArcadeSession(getChallenge('time_trial'));
  check('starts in a locked countdown', s.phase === 'countdown' && s.inputLocked);
  let go = 0;
  for (let t = 0; t < COUNTDOWN_SECONDS + 0.2; t += DT) if (s.update(DT, frame()).go) go++;
  check('GO fires once after the countdown and then the clock runs', go === 1 && s.phase === 'running' && !s.inputLocked);
  const before = s.distanceM;
  for (let i = 0; i < 60; i++) s.update(DT, frame({ speedKph: 36 }));
  check('distance is integrated from speed (36 km/h for 1 s = 10 m)', Math.abs(s.distanceM - before - 10) < 0.2, `(${(s.distanceM - before).toFixed(2)} m)`);
  const c = new ArcadeSession(getChallenge('time_trial'));
  for (let t = 0; t < 2; t += DT) c.update(DT, frame({ speedKph: 200 }));
  check('nothing counts during the countdown', c.distanceM === 0 && c.elapsed === 0);
}

console.log('--- time trial ---');
{
  const fast = play('time_trial', 190);
  check('reaching the finish line completes it', fast.s.result?.outcome === 'complete' && fast.s.result.success, `(${fast.s.result?.timeS.toFixed(1)}s, ${fast.s.result?.score} pts)`);
  const slow = play('time_trial', 60);
  check('running out of time fails it', slow.s.result?.outcome === 'time_up' && !slow.s.result.success && slow.s.result.medal === 'none');
  check('a faster run scores more (time bonus + speed)', fast.s.result!.score > play('time_trial', 130).s.result!.score);
  check('distance covered is about the target at the finish', Math.abs(fast.s.result!.distanceM - 3000) < 50);
}

console.log('--- checkpoint rush ---');
{
  const r = play('checkpoint', 230);
  check('checkpoints add time and count', r.events.checkpoints >= 3 && r.s.result!.checkpoints === r.events.checkpoints, `(${r.s.result!.checkpoints} gates)`);
  check('the run ends when time runs out (a normal ending)', r.s.result!.outcome === 'time_up' && r.s.result!.success);
  const slow = play('checkpoint', 60);
  check('too slow to reach the first checkpoint: ends early with 0 gates', slow.s.result!.checkpoints === 0 && slow.s.result!.timeS <= 50.5);
  check('faster driving earns more checkpoints', r.s.result!.checkpoints > play('checkpoint', 150).s.result!.checkpoints);
}

console.log('--- distance run ---');
{
  const r = play('distance', 160);
  check('lasts the full time limit', r.s.result!.outcome === 'time_up' && Math.abs(r.s.result!.timeS - 150) < 1);
  check('distance matches speed x time', Math.abs(r.s.result!.distanceM - (160 / 3.6) * 150) < 60, `(${r.s.result!.distanceM.toFixed(0)} m)`);
  check('further = more score', r.s.result!.score > play('distance', 100).s.result!.score);
}

console.log('--- traffic survival ---');
{
  const ok = play('survival', 140);
  check('surviving the full time succeeds', ok.s.result!.outcome === 'time_up' && ok.s.result!.success);
  const wreck = play('survival', 140, 400, (t, f) => { if (t > 20) f.damage = 100; });
  check('a wrecked car ends the run as a failure', wreck.s.result!.outcome === 'wrecked' && !wreck.s.result!.success && wreck.s.result!.medal === 'none');
  const clean = play('survival', 140, 400, (t, f) => { f.nearMisses = Math.floor(t / 5); });
  const crashy = play('survival', 140, 400, (t, f) => { f.trafficHits = Math.floor(t / 15); });
  check('near misses add points, crashes subtract', clean.s.result!.score > ok.s.result!.score && crashy.s.result!.score < ok.s.result!.score);
  const lines = clean.s.result!.lines.find((l) => l.label === 'NEAR MISSES')!.value;
  check('near misses are worth double in survival', lines === Math.floor(90 / 5) * SCORE.perNearMiss * 2 || lines >= 17 * SCORE.perNearMiss * 2, `(${lines})`);
}

console.log('--- high speed ---');
{
  const hold = play('high_speed', 200);
  check('holding the speed lasts the whole time', hold.s.result!.outcome === 'time_up' && hold.s.result!.success);
  const drop = play('high_speed', 200, 400, (t, f) => { if (t > 10) f.speedKph = 120; });
  check('dropping below the minimum drains the meter and ends the run', drop.s.result!.outcome === 'speed_lost' && drop.s.result!.timeS > 10 && drop.s.result!.timeS < 22, `(ended at ${drop.s.result!.timeS.toFixed(1)}s)`);
  check('the meter gives a warning before it empties', drop.events.warnings > 0);
  const refill = play('high_speed', 200, 400, (t, f) => { f.speedKph = t > 10 && t < 14 ? 120 : 200; });
  check('speeding back up refills the meter', refill.s.result!.outcome === 'time_up');
  check('faster driving scores more', hold.s.result!.score > play('high_speed', 175).s.result!.score);
}

console.log('--- police escape ---');
{
  const esc = play('police_escape', 200, 400, (t, f) => { if (t > 25) f.escapes = 1; });
  check('escaping the police completes it and pays an escape bonus', esc.s.result!.outcome === 'escaped' && esc.s.result!.success && esc.s.result!.lines.some((l) => l.label === 'POLICE ESCAPES' && l.value === SCORE.perEscape));
  const bust = play('police_escape', 200, 400, (t, f) => { if (t > 20) f.busted = true; });
  check('being busted fails it', bust.s.result!.outcome === 'busted' && !bust.s.result!.success && bust.s.result!.medal === 'none');
  const timeout = play('police_escape', 200);
  check('failing to lose them in time fails it', timeout.s.result!.outcome === 'time_up' && !timeout.s.result!.success);
  check('escapes score higher than failing', esc.s.result!.score > bust.s.result!.score);
}

console.log('--- other ending conditions ---');
{
  const fuel = play('distance', 150, 400, (t, f) => { if (t > 10) { f.fuel = 0; f.speedKph = 0; } });
  check('running out of fuel and stopping ends the run', fuel.s.result!.outcome === 'out_of_fuel');
  const blown = play('distance', 150, 400, (t, f) => { if (t > 10) { f.engineBlown = true; f.speedKph = 0; } });
  check('a blown engine ends the run once the car stops', blown.s.result!.outcome === 'engine_blown' && !blown.s.result!.success);
}

console.log('--- medals and challenge data ---');
{
  const def = getChallenge('time_trial');
  check('medal thresholds are ordered', CHALLENGES.every((c) => c.medals.bronze < c.medals.silver && c.medals.silver < c.medals.gold));
  check('medalFor picks the right medal', medalFor(def, 0) === 'none' && medalFor(def, def.medals.bronze) === 'bronze' && medalFor(def, def.medals.silver) === 'silver' && medalFor(def, def.medals.gold + 1) === 'gold');
  check('all six challenge types exist', new Set(CHALLENGES.map((c) => c.kind)).size === 6);
  const gold = play('time_trial', 210);
  check('a very good time trial run can reach at least silver', ['silver', 'gold'].includes(gold.s.result!.medal), `(${gold.s.result!.score} pts: ${gold.s.result!.medal})`);
  const decent = play('time_trial', 150);
  check('a decent run earns a medal but is beatable', decent.s.result!.success && decent.s.result!.score < def.medals.gold, `(${decent.s.result!.score} pts: ${decent.s.result!.medal})`);
  check('every challenge is winnable with a medal at some speed', CHALLENGES.every((c) => { const spd = c.kind === 'time_trial' ? 210 : c.kind === 'checkpoint' ? 230 : 200; const r = play(c.id, spd, 400, c.kind === 'police_escape' ? (t, f) => { if (t > 30) f.escapes = 1; } : undefined); return r.s.result!.success && r.s.result!.medal !== 'none'; }));
}

console.log('--- high scores ---');
{
  const p = createProfile();
  check('no best score at the start', bestScore(p, 'time_trial') === 0);
  const a = recordScore(p, 'time_trial', 4000, 'vortex_gt', 1);
  check('the first score is rank 1 and a new best', a.rank === 1 && a.newBest && bestScore(p, 'time_trial') === 4000);
  const b = recordScore(p, 'time_trial', 3000, 'vortex_gt', 2);
  check('a lower score ranks below and is not a new best', b.rank === 2 && !b.newBest && bestScore(p, 'time_trial') === 4000);
  const c = recordScore(p, 'time_trial', 6000, 'apex_xr', 3);
  check('a higher score takes first place', c.rank === 1 && c.newBest && p.highScores.time_trial[0].vehicle === 'apex_xr');
  for (let i = 0; i < 10; i++) recordScore(p, 'time_trial', 1000 + i, 'vortex_gt', 10 + i);
  check('only the top 5 are kept, best first', p.highScores.time_trial.length === 5 && p.highScores.time_trial.every((e, i, arr) => i === 0 || arr[i - 1].score >= e.score));
  const low = recordScore(p, 'time_trial', 5, 'vortex_gt', 99);
  check('a score too low for the table has no rank', low.rank === null);
  check('tables are separate per challenge', bestScore(p, 'checkpoint') === 0);
  const back = deserializeProfile(serializeProfile(p));
  check('high scores survive save/load', JSON.stringify(back.highScores) === JSON.stringify(p.highScores));
  const bad = deserializeProfile(JSON.stringify({ highScores: { time_trial: [{ score: 'x' }, { score: 5000, vehicle: 7, when: 'no' }, null, { score: -3 }], junk: 'nope' } }));
  check('corrupt high-score data is repaired', bad.highScores.time_trial?.length === 1 && bad.highScores.time_trial[0].score === 5000 && !('junk' in bad.highScores));
}

console.log(failures === 0 ? '\nALL ARCADE CHECKS PASSED' : `\n${failures} ARCADE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
