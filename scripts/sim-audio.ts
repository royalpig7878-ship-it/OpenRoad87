// Headless checks of the audio logic: engine voices per car, mixing rules, sirens, music data and timing, settings.
// (The WebAudio voices themselves are checked in the browser with an OfflineAudioContext.)
import {
  ENGINE_PROFILES, MAX_ENGINE_HZ, clamp, dopplerFactor, engineProfile, engineTargets, firingHz, impactLevel, midiHz, mixTargets, sirenHz, sirenLevel, smooth,
  DriveAudioFrame,
} from '../src/audio/audioMath';
import { TRACKS, TRACK_IDS, STEPS_PER_BAR, StepClock, compileTrack, getTrack } from '../src/audio/MusicData';
import { buildDriveFrame, loopDelta, SoundCar } from '../src/audio/driveFrame';
import { VEHICLES } from '../src/vehicles/VehicleRoster';
import { DEFAULT_SETTINGS, parseSettings } from '../src/save/Settings';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const finite = (o: object): boolean => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v));

console.log('--- engines ---');
{
  check('every car has an engine profile of its own', VEHICLES.every((v) => ENGINE_PROFILES[v.engineSound]) && new Set(VEHICLES.map((v) => v.engineSound)).size === VEHICLES.length);
  check('unknown engine ids fall back to a valid profile', engineProfile('nope').id === 'engine_v6');
  for (const v of VEHICLES) {
    const p = engineProfile(v.engineSound);
    const idle = firingHz(p, v.idleRpm), red = firingHz(p, v.redlineRpm);
    check(`${v.name}: idle ${idle.toFixed(0)} Hz .. redline ${red.toFixed(0)} Hz stays audible and bounded`, idle > 20 && idle < 160 && red > idle * 3 && red < MAX_ENGINE_HZ);
  }
  // Different engines sound different at the same revs.
  const at4000 = VEHICLES.map((v) => firingHz(engineProfile(v.engineSound), 4000));
  const sorted = [...at4000].sort((a, b) => a - b);
  check('engines have clearly different pitch at 4000 rpm (>= 4% apart)', sorted.every((x, i) => i === 0 || x / sorted[i - 1] > 1.04), `(${sorted.map((x) => x.toFixed(0)).join(', ')} Hz)`);
  check('pitch rises with rpm', [1000, 2000, 4000, 7000].every((r, i, a) => i === 0 || firingHz(ENGINE_PROFILES.engine_v8, r) > firingHz(ENGINE_PROFILES.engine_v8, a[i - 1])));
  const p = ENGINE_PROFILES.engine_v6;
  const idleT = engineTargets(p, 900, 900, 7000, 0, false);
  const fullT = engineTargets(p, 6500, 900, 7000, 1, false);
  check('full throttle near redline is louder and brighter than idle', fullT.gain > idleT.gain * 1.8 && fullT.cutoff > idleT.cutoff * 2 && fullT.noiseGain > idleT.noiseGain);
  check('lifting off at high rpm is quieter than flooring it', engineTargets(p, 6500, 900, 7000, 0, false).gain < fullT.gain);
  check('shifting ducks the engine', engineTargets(p, 5000, 900, 7000, 1, true).gain < engineTargets(p, 5000, 900, 7000, 1, false).gain * 0.5);
  const lim = engineTargets(p, 7000, 900, 7000, 1, false);
  check('hitting the rev limiter stutters (wobble)', lim.limiter && lim.wobbleDepth > 0.4 && lim.wobbleHz > 10 && !fullT.limiter);
  check('turbo whistle only on the turbo car, only under boost', engineTargets(ENGINE_PROFILES.engine_turbo4, 5500, 900, 7000, 1, false).whistleGain > 0.05 && engineTargets(ENGINE_PROFILES.engine_turbo4, 5500, 900, 7000, 0, false).whistleGain === 0 && fullT.whistleGain === 0);
  check('the V8 idles lumpier than the V12', engineTargets(ENGINE_PROFILES.engine_v8, 900, 900, 7000, 0, false).wobbleDepth > engineTargets(ENGINE_PROFILES.engine_v12, 900, 900, 7000, 0, false).wobbleDepth * 3);
  let ok = true;
  for (const id of Object.keys(ENGINE_PROFILES)) for (const rpm of [-50, 0, 500, 3000, 9000, 99999]) for (const th of [-1, 0, 0.5, 1, 3]) {
    const t = engineTargets(ENGINE_PROFILES[id], rpm, 900, 7000, th, false);
    if (!finite(t) || t.gain < 0 || t.gain > 1 || t.noiseGain < 0 || t.cutoff < 50) ok = false;
  }
  check('targets stay finite and in range for extreme inputs', ok);
}

console.log('--- mixing ---');
const frame = (o: Partial<DriveAudioFrame> = {}): DriveAudioFrame => ({
  speedKph: 100, topSpeedKph: 250, rpm: 3000, idleRpm: 900, redlineRpm: 7000, throttle: 0.5, brake: 0, skidding: false, surface: 'road', shifting: false,
  rain: 0, trafficProximity: 0, siren: null, damage: 0, outOfFuel: false, ...o,
});
{
  check('no squeal while gripping the road', mixTargets(frame()).tireGain === 0);
  const slow = mixTargets(frame({ skidding: true, speedKph: 60 })), fast = mixTargets(frame({ skidding: true, speedKph: 220 }));
  check('skidding squeals, louder and higher when faster', slow.tireGain > 0.2 && fast.tireGain > slow.tireGain && fast.tireHz > slow.tireHz);
  check('standing still never squeals', mixTargets(frame({ skidding: true, speedKph: 0 })).tireGain === 0);
  check('hard braking at speed chirps', mixTargets(frame({ brake: 1, speedKph: 200 })).tireGain > 0 && mixTargets(frame({ brake: 1, speedKph: 60 })).tireGain === 0);
  check('wind grows with speed', [0, 60, 120, 200, 250].every((s, i, a) => i === 0 || mixTargets(frame({ speedKph: s })).windGain >= mixTargets(frame({ speedKph: a[i - 1] })).windGain) && mixTargets(frame({ speedKph: 250 })).windGain > 0.3 && mixTargets(frame({ speedKph: 0 })).windGain === 0);
  check('rumble only off the tarmac, grass rougher than the shoulder', mixTargets(frame()).rumbleGain === 0 && mixTargets(frame({ surface: 'shoulder' })).rumbleGain > 0 && mixTargets(frame({ surface: 'grass' })).rumbleGain > mixTargets(frame({ surface: 'shoulder' })).rumbleGain);
  check('rain ambience follows the weather', mixTargets(frame({ rain: 0 })).rainGain === 0 && mixTargets(frame({ rain: 1 })).rainGain > 0.3);
  check('traffic drone needs neighbours and movement', mixTargets(frame()).trafficGain === 0 && mixTargets(frame({ trafficProximity: 1 })).trafficGain > 0.2 && mixTargets(frame({ trafficProximity: 1, speedKph: 0 })).trafficGain === 0);
  check('a damaged car rattles; a healthy one does not', mixTargets(frame({ damage: 10 })).rattleGain === 0 && mixTargets(frame({ damage: 90 })).rattleGain > 0.2);
  let ok = true;
  for (const speed of [-5, 0, 40, 400]) for (const surface of ['road', 'shoulder', 'grass'] as const) for (const sk of [false, true]) {
    const m = mixTargets(frame({ speedKph: speed, surface, skidding: sk, rain: 2, damage: 500, trafficProximity: 9, siren: { distanceM: -5, closingKph: 900, pan: 5 } }));
    if (!finite(m) || m.tireGain < 0 || m.tireGain > 1 || m.windGain > 1 || m.sirenGain > 1 || Math.abs(m.sirenPan) > 1 || m.sirenPitch < 0.8 || m.sirenPitch > 1.25) ok = false;
  }
  check('all mix levels stay finite and in range for extreme inputs', ok);
  check('smoothing converges without overshoot', (() => { let v = 0; for (let i = 0; i < 60; i++) { v = smooth(v, 1, 1 / 60, 12); if (v > 1) return false; } return v > 0.99 && smooth(0.3, 0.3, 0.1) === 0.3; })());
  check('impact loudness scales with speed, never silent, never above 1', impactLevel(10) === 0.25 && impactLevel(45) === 0.5 && impactLevel(500) === 1);
  check('midiHz: A4 = 440, an octave doubles', Math.abs(midiHz(69) - 440) < 1e-9 && Math.abs(midiHz(81) - 880) < 1e-9);
}

console.log('--- sirens ---');
{
  check('siren is loudest close, silent beyond 600 m', sirenLevel(0) === 1 && sirenLevel(300) < sirenLevel(100) && sirenLevel(600) === 0 && sirenLevel(5000) === 0);
  check('doppler: pitch up approaching, down receding, 1 when matched', dopplerFactor(100) > 1.05 && dopplerFactor(-100) < 0.95 && dopplerFactor(0) === 1);
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 10; t += 0.01) { const h = sirenHz(t); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  check('siren sweeps between two tones (640 and 960 Hz)', Math.abs(lo - 640) < 15 && Math.abs(hi - 960) < 15, `(${lo.toFixed(0)}..${hi.toFixed(0)})`);
  const sm = mixTargets(frame({ siren: { distanceM: 80, closingKph: 60, pan: -0.5 } }));
  check('a close siren is loud, panned, and pitched up when closing', sm.sirenGain > 0.2 && sm.sirenPan === -0.5 && sm.sirenPitch > 1);
  check('no siren means silence', mixTargets(frame()).sirenGain === 0);
}

console.log('--- from game state ---');
{
  const L = 100000, U = 381;
  check('loopDelta wraps around the loop', loopDelta(99000, 1000, L) === 2000 && loopDelta(1000, 99000, L) === -2000 && loopDelta(0, 10, L) === 10);
  const car = (zM: number, x: number, extra: Partial<SoundCar> = {}): SoundCar => ({ active: true, z: zM * U, x, speedKph: 100, ...extra });
  const base = { speedKph: 150, position: 0, playerX: 0, rpm: 3000, throttle: 1, brake: 0, skidding: false, surface: 'road' as const, shifting: false, damage: 0, fuel: 20, topSpeedKph: 250, idleRpm: 900, redlineRpm: 7000, trackLength: 1e9, unitsPerMetre: U, rain: 0, traffic: [] as SoundCar[], police: [] as SoundCar[] };
  check('no neighbours gives no traffic drone', buildDriveFrame(base).trafficProximity === 0);
  const near = buildDriveFrame({ ...base, traffic: [car(10, 0.2), car(-15, -0.3)] });
  check('cars alongside raise the drone, far or other-lane cars do not', near.trafficProximity > 0.3 && buildDriveFrame({ ...base, traffic: [car(500, 0), car(10, 3)] }).trafficProximity === 0 && buildDriveFrame({ ...base, traffic: [car(10, 0, { active: false })] }).trafficProximity === 0);
  const pf = buildDriveFrame({ ...base, police: [car(-200, 0.4, { sirens: true, speedKph: 220 }), car(-400, 0, { sirens: true }), car(50, 0, { sirens: false })] });
  check('the nearest unit with its siren on is heard; silent cruisers are not', !!pf.siren && Math.abs(pf.siren.distanceM - 200) < 1);
  check('a faster unit behind is closing (positive)', (pf.siren?.closingKph ?? 0) === 70);
  const ahead = buildDriveFrame({ ...base, police: [car(150, 0, { sirens: true, speedKph: 100 })] });
  check('a slower unit ahead is closing, a faster unit ahead is pulling away', (ahead.siren?.closingKph ?? 0) === 50 && (buildDriveFrame({ ...base, police: [car(150, 0, { sirens: true, speedKph: 200 })] }).siren?.closingKph ?? 0) === -50);
  check('out of fuel is flagged', buildDriveFrame({ ...base, fuel: 0 }).outOfFuel && !buildDriveFrame(base).outOfFuel);
  const seam = buildDriveFrame({ ...base, position: 99500 * U, trackLength: 100000 * U, police: [car(300, 0, { sirens: true })] }).siren;
  check('a siren just across the loop seam is 800 m ahead, not 99 km away', !!seam && Math.abs(seam.distanceM - 800) < 1, `(${seam?.distanceM.toFixed(0)} m)`);
}

console.log('--- music data ---');
{
  check('three tracks: menu, arcade, pursuit', TRACK_IDS.length === 3 && ['menu', 'arcade', 'pursuit'].every((t) => (TRACK_IDS as string[]).includes(t)));
  for (const id of TRACK_IDS) {
    const def = TRACKS[id];
    const t = getTrack(id);
    const bars = def.progression.length;
    check(`${t.name}: ${bars} bars, ${t.totalSteps} steps, ${(t.totalSteps * t.stepSeconds).toFixed(1)} s loop`, t.totalSteps === bars * STEPS_PER_BAR && t.events.length === t.totalSteps && t.totalSteps * t.stepSeconds > 12 && t.totalSteps * t.stepSeconds < 40);
    check(`${t.name}: rhythm and melody strings are all 16 steps`, [def.kick, def.snare, def.hat, def.bass, def.arp, ...(def.ohat ? [def.ohat] : []), ...(def.clap ? [def.clap] : []), ...def.lead].every((s) => s.length === STEPS_PER_BAR));
    const all = t.events.flat();
    const parts = new Set(all.map((e) => e.part));
    check(`${t.name}: has drums, bass, arpeggio and lead`, ['kick', 'snare', 'hat', 'bass', 'arp', 'lead'].every((p) => parts.has(p as never)));
    const pitched = all.filter((e) => ['bass', 'arp', 'lead', 'pad'].includes(e.part));
    check(`${t.name}: every pitched note is a real, playable MIDI note`, pitched.every((e) => Number.isInteger(e.midi) && e.midi >= 24 && e.midi <= 108));
    check(`${t.name}: bass sits low, lead sits above it`, all.filter((e) => e.part === 'bass').every((e) => e.midi <= 62) && all.filter((e) => e.part === 'lead').every((e) => e.midi >= 60));
    check(`${t.name}: lead notes are 1-4 steps and stay inside their bar`, t.events.every((ev, step) => ev.every((e) => e.part !== 'lead' || (e.steps >= 1 && e.steps <= 4 && (step % STEPS_PER_BAR) + e.steps <= STEPS_PER_BAR))));
    check(`${t.name}: velocities are in 0..1`, all.every((e) => e.vel > 0 && e.vel <= 1));
    const kicksPerBar = t.events.slice(0, STEPS_PER_BAR).filter((ev) => ev.some((e) => e.part === 'kick')).length;
    check(`${t.name}: ${kicksPerBar} kicks per bar (a steady beat)`, kicksPerBar >= 2 && kicksPerBar <= 10);
  }
  check('menu is slower than arcade, which is slower than the chase', TRACKS.menu.bpm < TRACKS.arcade.bpm && TRACKS.arcade.bpm < TRACKS.pursuit.bpm);
  check('only the menu track has a pad', TRACKS.menu.pad && !TRACKS.arcade.pad && !TRACKS.pursuit.pad && getTrack('menu').events.some((e) => e.some((x) => x.part === 'pad')));
  check('compiling is deterministic', JSON.stringify(compileTrack(TRACKS.arcade)) === JSON.stringify(compileTrack(TRACKS.arcade)));
  const t = getTrack('arcade');
  const clock = new StepClock(t, 10);
  const a = clock.advance(10.5), b = clock.advance(11);
  const times = [...a, ...b].map((s) => s.time);
  check('the clock schedules steps exactly one step apart, with none missed or repeated', times.every((x, i) => i === 0 || Math.abs(x - times[i - 1] - t.stepSeconds) < 1e-9) && a.length > 0 && b.length > 0 && Math.abs(times[0] - 10) < 1e-9);
  check('the clock only returns steps before the cutoff', [...a].every((s) => s.time < 10.5) && b.every((s) => s.time < 11 && s.time >= 10.5));
  const loop = new StepClock(t, 0).advance(t.totalSteps * t.stepSeconds * 2 + 0.001);
  check('the song loops seamlessly (step 0 follows the last step)', loop.length === t.totalSteps * 2 + 1 && loop[t.totalSteps].step === 0 && loop[t.totalSteps - 1].step === t.totalSteps - 1);
  check('advancing to an earlier time gives nothing', new StepClock(t, 5).advance(4).length === 0);
}

console.log('--- audio settings ---');
{
  check('defaults: loud enough, not muted', DEFAULT_SETTINGS.masterVolume > 0.5 && DEFAULT_SETTINGS.musicVolume < DEFAULT_SETTINGS.sfxVolume && !DEFAULT_SETTINGS.muted);
  const s = parseSettings(JSON.stringify({ masterVolume: 0.3, musicVolume: 0, sfxVolume: 1, muted: true }));
  check('valid volumes and mute are read', s.masterVolume === 0.3 && s.musicVolume === 0 && s.sfxVolume === 1 && s.muted === true);
  const bad = parseSettings(JSON.stringify({ masterVolume: 9, musicVolume: -3, sfxVolume: 'loud', muted: 'yes' }));
  check('bad values clamp or fall back to defaults', bad.masterVolume === 1 && bad.musicVolume === 0 && bad.sfxVolume === DEFAULT_SETTINGS.sfxVolume && bad.muted === false);
  check('clamp helper', clamp(5, 0, 1) === 1 && clamp(-5, 0, 1) === 0);
}

console.log(failures === 0 ? '\nALL AUDIO CHECKS PASSED' : `\n${failures} AUDIO CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
