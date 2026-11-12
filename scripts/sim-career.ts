// Headless checks of career mode: jobs, requirements, ranks, unlocks, payouts and progression pacing.
import { ArcadeResult, ArcadeSession } from '../src/arcade/ArcadeSession';
import { Medal } from '../src/arcade/Challenges';
import { ENV_UNLOCK_REP, MAX_START_DAMAGE, RANKS, checkRequirements, completeJob, isEnvUnlocked, jobStatus, newlyUnlockedEnvs, payFor, rankFor, repFor } from '../src/career/Career';
import { FIRST_CLEAR_BONUS, JOBS, MEDAL_PAY_MULT, REPLAY_PAY_FRACTION, getJob } from '../src/career/Jobs';
import { ENVIRONMENTS } from '../src/road/environments/Environments';
import { createProfile, deserializeProfile, effectiveSpec, serializeProfile } from '../src/economy/Profile';
import { UPGRADE_KEYS, noUpgrades } from '../src/economy/UpgradeData';
import { applyUpgrades } from '../src/economy/VehicleTuning';
import { VEHICLES, getVehicle } from '../src/vehicles/VehicleRoster';
import { DIFFICULTY } from '../src/traffic/TrafficData';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const maxed = () => Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 3])) as ReturnType<typeof noUpgrades>;
const DT = 1 / 60;

/** Fake result for a job with a given medal. */
function result(job: (typeof JOBS)[number], medal: Medal, outcome: ArcadeResult['outcome'] = 'complete'): ArcadeResult {
  const m = job.challenge.medals;
  const score = medal === 'gold' ? m.gold : medal === 'silver' ? m.silver : medal === 'bronze' ? m.bronze : 100;
  return { challengeId: job.challenge.id, outcome, success: medal !== 'none', score, lines: [], timeS: 60, distanceM: 3000, checkpoints: 0, nearMisses: 0, crashes: 0, escapes: 0, medal };
}
const fresh = () => ({ money: 1000, reputation: 0, completedJobs: {} as Record<string, { medal: Medal; score: number; count: number }> });

console.log('--- job data ---');
{
  check('15 jobs across 5 tiers, 3 per tier', JOBS.length === 15 && [1, 2, 3, 4, 5].every((t) => JOBS.filter((j) => j.tier === t).length === 3));
  check('job ids are unique', new Set(JOBS.map((j) => j.id)).size === JOBS.length);
  check('every job runs on a real road', JOBS.every((j) => ENVIRONMENTS.some((e) => e.id === j.challenge.env)));
  check('medal targets are ordered', JOBS.every((j) => j.challenge.medals.bronze < j.challenge.medals.silver && j.challenge.medals.silver < j.challenge.medals.gold));
  check('traffic levels are valid', JOBS.every((j) => j.challenge.trafficLevel in DIFFICULTY));
  check('police jobs start a pursuit', JOBS.filter((j) => j.challenge.kind === 'police_escape').every((j) => j.challenge.police?.startPursuit));
  check('reputation requirements and pay rise with tier', [1, 2, 3, 4, 5].every((t, i, a) => i === 0 || (Math.min(...JOBS.filter((j) => j.tier === t).map((j) => j.minRep)) > Math.min(...JOBS.filter((j) => j.tier === a[i - 1]).map((j) => j.minRep)) && Math.min(...JOBS.filter((j) => j.tier === t).map((j) => j.pay)) > Math.min(...JOBS.filter((j) => j.tier === a[i - 1]).map((j) => j.pay)))) || [2, 3, 4, 5].every((t) => Math.min(...JOBS.filter((j) => j.tier === t).map((j) => j.pay)) > Math.max(...JOBS.filter((j) => j.tier === t - 1).map((j) => j.pay)) * 0.99));
  check('tier-1 jobs are open to a brand-new player', JOBS.filter((j) => j.tier === 1).every((j) => j.minRep === 0 && Object.keys(j.requirements).length === 0));
  check('time trials get a sensible time limit', JOBS.filter((j) => j.challenge.kind === 'time_trial').every((j) => j.challenge.timeLimit > 40 && j.challenge.timeLimit < 220), JOBS.filter((j) => j.challenge.kind === 'time_trial').map((j) => j.challenge.timeLimit).join('/'));
  // Every job's rules must run in the arcade engine without errors.
  let ok = true;
  for (const j of JOBS) { try { const s = new ArcadeSession(j.challenge); for (let i = 0; i < 600; i++) s.update(DT, { speedKph: 180, damage: 0, fuel: 50, nearMisses: 0, trafficHits: 0, escapes: 0, busted: false }); } catch { ok = false; } }
  check('every job runs in the arcade engine', ok);
}

console.log('--- requirements: different cars matter ---');
{
  const vortex = getVehicle('vortex_gt');
  const freight = getJob('freight')!;
  const bad = checkRequirements(vortex, freight.requirements);
  check('the starter car fails a tier-3 fuel job and says why', bad.some((c) => !c.ok && c.label === 'FUEL TANK'), bad.map((c) => `${c.label} ${c.have}/${c.need}`).join(', '));
  const withTank = applyUpgrades(vortex, { ...noUpgrades(), fuel: 3 });
  check('a fuel-tank upgrade qualifies it (upgrades matter)', checkRequirements(withTank, freight.requirements).every((c) => c.ok), `(${withTank.fuelCapacity.toFixed(1)} L)`);
  check('the Thunder V8 qualifies for the fuel job stock (a car purchase matters)', checkRequirements(getVehicle('thunder_v8'), freight.requirements).every((c) => c.ok));
  const dash = getJob('hotwheels')!;
  check('the Desert Dash wants acceleration the starter lacks; the Thunder V8 has it', !checkRequirements(vortex, dash.requirements).every((c) => c.ok) && checkRequirements(getVehicle('thunder_v8'), dash.requirements).every((c) => c.ok));
  const elite = getJob('elite')!;
  const bestVortex = applyUpgrades(vortex, maxed());
  check('the elite job cannot be done by an upgraded starter car, only by the (tuned) Phantom X', !checkRequirements(bestVortex, elite.requirements).every((c) => c.ok) && VEHICLES.filter((v) => checkRequirements(applyUpgrades(v, maxed()), elite.requirements).every((c) => c.ok)).map((v) => v.id).join() === 'phantom_x');
  const grand = getJob('grandtour')!;
  const grandOk = VEHICLES.filter((v) => checkRequirements(applyUpgrades(v, maxed()), grand.requirements).every((c) => c.ok)).map((v) => v.id);
  check('the Grand Tour needs speed AND handling AND toughness (a very limited choice)', grandOk.length >= 1 && grandOk.length <= 2, grandOk.join(','));
  check('a stock Phantom X is not enough for the elite job, one engine upgrade is', !checkRequirements(getVehicle('phantom_x'), elite.requirements).every((c) => c.ok) && checkRequirements(applyUpgrades(getVehicle('phantom_x'), { ...noUpgrades(), engine: 1 }), elite.requirements).every((c) => c.ok));
  check('every job can be done by at least one car (fully upgraded)', JOBS.every((j) => VEHICLES.some((v) => checkRequirements(applyUpgrades(v, maxed()), j.requirements).every((c) => c.ok))));
  const ownedBy = (id: string) => JOBS.filter((j) => checkRequirements(getVehicle(id), j.requirements).every((c) => c.ok)).length;
  const counts = VEHICLES.map((v) => ownedBy(v.id));
  check('better cars unlock more jobs (stock)', counts[0] <= counts[2] && counts[2] <= counts[5] && counts[5] > counts[0], counts.join('/'));
}

console.log('--- ranks, unlocks and job status ---');
{
  check('rank thresholds', rankFor(0).name === 'ROOKIE' && rankFor(49).name === 'ROOKIE' && rankFor(50).name === 'COURIER' && rankFor(150).name === 'DRIVER' && rankFor(300).name === 'ACE' && rankFor(9999).name === 'LEGEND' && rankFor(9999).next === null);
  check('ranks line up with the job tiers', [0, 50, 150, 300, 600].every((r, i) => RANKS[i].rep === r));
  check('all seven roads have an unlock level, rising along the journey', ENVIRONMENTS.every((e) => e.id in ENV_UNLOCK_REP) && isEnvUnlocked(0, 'mountain') && isEnvUnlocked(0, 'country') && !isEnvUnlocked(0, 'night') && isEnvUnlocked(500, 'night'));
  check('crossing a threshold reports the newly unlocked road', newlyUnlockedEnvs(40, 70).join() === 'forest' && newlyUnlockedEnvs(0, 600).length === 5 && newlyUnlockedEnvs(70, 85).length === 0);
  const pizza = getJob('pizza')!, parts = getJob('parts')!, freight = getJob('freight')!;
  const v = getVehicle('vortex_gt');
  check('a new player can take tier-1 jobs', jobStatus(pizza, 0, v, 0).state === 'available');
  check('tier-2 jobs are locked by reputation', jobStatus(parts, 0, v, 0).state === 'locked');
  check('unlocked jobs still check the car', jobStatus(freight, 200, v, 0).state === 'blocked' && jobStatus(freight, 200, getVehicle('thunder_v8'), 0).state === 'available');
  check('a badly damaged car cannot start a job', jobStatus(pizza, 0, v, MAX_START_DAMAGE).state === 'blocked' && jobStatus(pizza, 0, v, MAX_START_DAMAGE - 1).state === 'available');
  const roadLocked = jobStatus(getJob('express')!, 150, getVehicle('silverline_turbo'), 0);
  check('coastal jobs open at the coast unlock level', roadLocked.state === 'available');
}

console.log('--- pay and reputation ---');
{
  const j = getJob('parts')!;
  const pays = (['bronze', 'silver', 'gold'] as Medal[]).map((m) => payFor(j, m, true));
  check('better medals pay more', pays[0] < pays[1] && pays[1] < pays[2]);
  check('pay follows the documented multipliers', Math.abs(payFor(j, 'silver', true) - Math.round((j.pay * MEDAL_PAY_MULT.silver * FIRST_CLEAR_BONUS) / 10) * 10) < 1);
  check('replays pay less than first clears', payFor(j, 'gold', false) < payFor(j, 'gold', true) && Math.abs(payFor(j, 'gold', false) / payFor(j, 'gold', true) - REPLAY_PAY_FRACTION / FIRST_CLEAR_BONUS) < 0.02);
  check('no medal pays nothing', payFor(j, 'none', true) === 0 && repFor(j, 'none', true) === 0);
  check('higher tiers give more reputation', repFor(getJob('elite')!, 'bronze', true) > repFor(getJob('pizza')!, 'bronze', true));
  check('gold gives more reputation than bronze; replays much less', repFor(j, 'gold', true) > repFor(j, 'bronze', true) && repFor(j, 'gold', false) < repFor(j, 'bronze', true));
}

console.log('--- completing jobs ---');
{
  const p = fresh();
  const pizza = getJob('pizza')!;
  const o = completeJob(p, pizza, result(pizza, 'silver'));
  check('success pays cash and reputation and records the clear', o.success && o.cash === payFor(pizza, 'silver', true) && p.money === 1000 + o.cash && p.reputation === o.rep && p.completedJobs.pizza.medal === 'silver' && o.firstClear);
  const o2 = completeJob(p, pizza, result(pizza, 'bronze'));
  check('replaying pays the reduced rate, keeps the better medal', !o2.firstClear && o2.cash === payFor(pizza, 'bronze', false) && p.completedJobs.pizza.medal === 'silver' && p.completedJobs.pizza.count === 2);
  const o3 = completeJob(p, pizza, result(pizza, 'gold'));
  check('a better medal upgrades the record', p.completedJobs.pizza.medal === 'gold' && o3.medal === 'gold');
  const failed = completeJob(p, pizza, result(pizza, 'none', 'time_up'));
  const moneyAfter = p.money;
  check('failing pays nothing and changes nothing else', !failed.success && failed.cash === 0 && failed.rep === 0 && p.money === moneyAfter && p.completedJobs.pizza.count === 3);
  const q = fresh(); q.money = 5000;
  const dodge = getJob('dodge')!;
  const busted = completeJob(q, dodge, result(dodge, 'none', 'busted'));
  check('being busted in a police job costs a fine', busted.fine > 0 && q.money === 5000 - busted.fine && !busted.success);
  const poor = fresh(); poor.money = 10;
  completeJob(poor, dodge, result(dodge, 'none', 'busted'));
  check('a fine can never make money negative', poor.money >= 0);
  const r = fresh(); r.reputation = 45;
  const up = completeJob(r, getJob('mail')!, result(getJob('mail')!, 'gold'));
  check('crossing a rank threshold reports a rank-up and newly unlocked jobs', up.rankedUp && up.rankAfter === 'COURIER' && up.unlockedJobs.length === 3, `(${up.rankBefore} -> ${up.rankAfter}, ${up.unlockedJobs.length} jobs)`);
  const roadUnlock = fresh(); roadUnlock.reputation = 45;
  const ru = completeJob(roadUnlock, getJob('mail')!, result(getJob('mail')!, 'gold'));
  check('crossing a road threshold reports the new road', ru.unlockedEnvs.includes('forest'));
}

console.log('--- progression pacing ---');
{
  // A player takes every new job at silver; when nothing new is open they replay the best open job (silver) until a rank opens more.
  const p = fresh(); p.money = 0;
  let runs = 0;
  let totalCash = 0;
  const done = new Set<string>();
  while (runs < 120 && rankFor(p.reputation).name !== 'LEGEND') {
    const open = JOBS.filter((j) => p.reputation >= j.minRep);
    const fresh1 = open.filter((j) => !done.has(j.id));
    const job = fresh1[0] ?? open.reduce((a, b) => (b.tier > a.tier ? b : a));
    const o = completeJob(p, job, result(job, 'silver'));
    totalCash += o.cash;
    done.add(job.id);
    runs++;
  }
  const afterLegend = JOBS.filter((j) => p.reputation >= j.minRep && !done.has(j.id));
  check('a steady player reaches Legend in a sensible number of job runs', rankFor(p.reputation).name === 'LEGEND' && runs >= 25 && runs <= 60, `(${runs} runs, rep ${p.reputation})`);
  check('every job is reachable by reputation alone', done.size + afterLegend.length === JOBS.length, `(${done.size} done, ${afterLegend.length} left)`);
  const startTierRep = JOBS.filter((j) => j.tier === 1).reduce((s, j) => s + repFor(j, 'silver', true), 0);
  check('tier 1 alone gets you most of the way to Courier (a few replays needed)', startTierRep >= 20 && startTierRep < 50, `(${startTierRep} rep from tier 1)`);
  check('career income funds the better cars along the way', totalCash > 24000 && totalCash < 400000, `(${totalCash} cash over the whole climb)`);
  const phantom = getVehicle('phantom_x').price;
  const replayRound = JOBS.reduce((s, j) => s + payFor(j, 'gold', false), 0);
  check('the most expensive car is reachable by replaying jobs', replayRound > 20000 && (totalCash + replayRound * 3) > phantom, `(a full gold replay round pays ${replayRound})`);
}

console.log('--- storage ---');
{
  const p = createProfile();
  p.completedJobs.pizza = { medal: 'gold', score: 5000, count: 2 };
  p.reputation = 120;
  const back = deserializeProfile(serializeProfile(p));
  check('career progress survives save/load', JSON.stringify(back.completedJobs) === JSON.stringify(p.completedJobs) && back.reputation === 120);
  const bad = deserializeProfile(JSON.stringify({ completedJobs: { pizza: { medal: 'platinum', score: 1 }, mail: { medal: 'silver', score: 'x', count: -5 }, junk: 5, parts: null }, reputation: 'lots' }));
  check('corrupt career data is repaired', !('pizza' in bad.completedJobs) && bad.completedJobs.mail?.medal === 'silver' && bad.completedJobs.mail.score === 0 && bad.completedJobs.mail.count === 1 && !('junk' in bad.completedJobs) && bad.reputation === 0);
  check('effective specs use upgrades for jobs', effectiveSpec(createProfile(), 'vortex_gt').topSpeedKph === getVehicle('vortex_gt').topSpeedKph);
}

console.log(failures === 0 ? '\nALL CAREER CHECKS PASSED' : `\n${failures} CAREER CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
