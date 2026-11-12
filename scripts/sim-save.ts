// Headless checks of the save system: file format, versioning, migrations, corruption recovery, backups, failed writes.
import { BINDING_ACTIONS, DEFAULT_BINDINGS, RESERVED_KEYS, bindKey, keyLabel, parseBindings } from '../src/controls/Bindings';
import { getBindings, setBindings } from '../src/save/ControlPrefs';
import { getProfile, setProfile } from '../src/economy/currentProfile';
import { STARTING_MONEY, STARTING_VEHICLE, buyVehicle, buyUpgrade, createProfile, recordScore, setDamage } from '../src/economy/Profile';
import { MemoryBackend } from '../src/save/SaveBackend';
import { MIGRATIONS, SAVE_FORMAT, SAVE_VERSION, SaveData, checksum, decodeSave, defaultSaveData, encodeSave, sameData } from '../src/save/SaveFile';
import { KEYS, SaveManager } from '../src/save/SaveManager';
import { DEFAULT_SETTINGS, getSettings, onSettingsChange, replaceSettings, updateSettings } from '../src/save/Settings';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

/** A profile with something in every part of it. */
function richData(): SaveData {
  const p = createProfile();
  p.money = 90000;
  p.reputation = 133;
  buyVehicle(p, 'thunder_v8');
  buyUpgrade(p, 'thunder_v8', 'engine');
  buyUpgrade(p, 'thunder_v8', 'tires');
  setDamage(p, 'thunder_v8', 37.5);
  p.selectedVehicle = 'thunder_v8';
  p.money = 48210; // set after the purchases above so the value is exact
  recordScore(p, 'time_trial', 12345, 'thunder_v8', 1700000000000);
  recordScore(p, 'time_trial', 9000, STARTING_VEHICLE, 1700000100000);
  p.completedJobs['pizza_run'] = { medal: 'gold', score: 4200, count: 3 };
  const d = defaultSaveData();
  d.profile = p;
  d.settings = { ...DEFAULT_SETTINGS, masterVolume: 0.35, steerMode: 'wheel', quality: 'low', muted: true };
  d.bindings = bindKey(DEFAULT_BINDINGS, 'accelerate', 'KeyE');
  return d;
}

/** Resets the shared in-memory game state to match `d` (as if the game had just loaded it). */
function setGame(d: SaveData): void {
  setProfile(JSON.parse(JSON.stringify(d.profile)));
  replaceSettings(d.settings);
  setBindings(d.bindings);
}

const validData = (d: SaveData): boolean =>
  Number.isFinite(d.profile.money) && d.profile.money >= 0 && Object.keys(d.profile.vehicles).length > 0 && d.profile.selectedVehicle in d.profile.vehicles &&
  Object.values(d.profile.vehicles).every((v) => v.damage >= 0 && v.damage <= 100) && d.settings.masterVolume >= 0 && d.settings.masterVolume <= 1 &&
  BINDING_ACTIONS.every(({ action }) => d.bindings[action].length > 0);

console.log('--- file format ---');
{
  const d = richData();
  const text = encodeSave(d, 1700000000000);
  const r = decodeSave(text);
  check('a saved game reads back identically (money, rep, cars, upgrades, damage, scores, jobs, settings, bindings)', r.status === 'ok' && sameData(r.data, d) && r.issues.length === 0, JSON.stringify(r.issues));
  check('the file records format, version and time', JSON.parse(text).format === SAVE_FORMAT && JSON.parse(text).version === SAVE_VERSION && r.savedAt === 1700000000000 && r.version === SAVE_VERSION);
  check('checksum is stable and sensitive', checksum('abc') === checksum('abc') && checksum('abc') !== checksum('abd') && /^[0-9a-f]{8}$/.test(checksum('')));
  const edited = text.replace('"money":48210', '"money":99999999');
  const re = decodeSave(edited);
  check('a hand-edited value is detected by the checksum (still readable, marked repaired)', re.status === 'repaired' && re.issues.includes('bad_checksum'));
  check('the extra fields stay valid after sanitising', validData(re.data));
}

console.log('--- unreadable files ---');
{
  const text = encodeSave(richData());
  const cases: [string, string | null | undefined][] = [
    ['null', null], ['undefined', undefined], ['empty string', ''], ['spaces', '   '], ['plain garbage', 'hello world'], ['truncated half way', text.slice(0, text.length / 2)],
    ['truncated to 1 char', '{'], ['a JSON array', '[1,2,3]'], ['a JSON number', '42'], ['JSON null', 'null'], ['a JSON string', '"x"'],
    ['wrong format name', text.replace(SAVE_FORMAT, 'otherGame')], ['no version', text.replace('"version":1,', '')], ['version zero', text.replace('"version":1', '"version":0')],
    ['fractional version', text.replace('"version":1', '"version":1.5')], ['version as text', text.replace('"version":1', '"version":"1"')], ['data is a number', '{"format":"openroad87","version":1,"data":5}'],
    ['data is null', '{"format":"openroad87","version":1,"data":null}'], ['data is an array', '{"format":"openroad87","version":1,"data":[]}'],
  ];
  for (const [name, t] of cases) {
    let r;
    try {
      r = decodeSave(t);
    } catch (e) {
      check(`${name}: does not throw`, false, String(e));
      continue;
    }
    check(`${name}: invalid, with a safe default game and a reason`, r.status === 'invalid' && r.issues.length >= 1 && validData(r.data) && r.data.profile.money === STARTING_MONEY, `[${r.issues}]`);
  }
}

console.log('--- sanitising bad values ---');
{
  const nasty = {
    format: SAVE_FORMAT, version: 1, savedAt: 'yesterday', checksum: 'x',
    data: {
      profile: {
        money: -500, reputation: 'lots', selectedVehicle: 'ghost_car',
        vehicles: { thunder_v8: { upgrades: { engine: 99, tires: -3, brakes: 'x' }, damage: 500 }, not_a_car: { upgrades: {}, damage: 0 } },
        highScores: { time_trial: [{ score: 'a', vehicle: 1, when: 'x' }, { score: 500, vehicle: 'vortex_gt', when: 5 }, null, { score: -9 }] },
        completedJobs: { a: { medal: 'platinum' }, b: { medal: 'silver', score: 1, count: 0 } },
      },
      settings: { masterVolume: 7, quality: 'ultra', steerMode: 3, muted: 'no' },
      bindings: { accelerate: [], brake: 'S', left: ['KeyA', 5, null, 'KeyA'], right: ['<script>'], pause: ['KeyX', 'F5'], gearUp: ['ShiftLeft'] },
    },
  };
  const r = decodeSave(JSON.stringify(nasty));
  const d = r.data;
  check('marked repaired (bad checksum), not rejected', r.status === 'repaired');
  check('numbers are clamped and unknown values replaced', d.profile.money === 0 && d.profile.reputation === 0 && d.profile.vehicles.thunder_v8.damage === 100 && d.profile.vehicles.thunder_v8.upgrades.engine <= 5 && d.profile.vehicles.thunder_v8.upgrades.tires === 0);
  check('unknown cars are dropped; an unowned selected car falls back to one that is owned', !('not_a_car' in d.profile.vehicles) && d.profile.selectedVehicle in d.profile.vehicles);
  check('score lists keep only valid entries', d.profile.highScores.time_trial?.length === 1 && d.profile.highScores.time_trial[0].score === 500);
  check('job records need a real medal', !('a' in d.profile.completedJobs) && d.profile.completedJobs.b?.count === 1);
  check('settings fall back to defaults when invalid', d.settings.masterVolume === 1 && d.settings.quality === DEFAULT_SETTINGS.quality && d.settings.steerMode === DEFAULT_SETTINGS.steerMode && d.settings.muted === false);
  check('bindings: empty/invalid lists keep their defaults, duplicates and junk removed, reserved keys refused', JSON.stringify(d.bindings.accelerate) === JSON.stringify(DEFAULT_BINDINGS.accelerate) && JSON.stringify(d.bindings.left) === '["KeyA"]' && JSON.stringify(d.bindings.right) === JSON.stringify(DEFAULT_BINDINGS.right) && JSON.stringify(d.bindings.pause) === JSON.stringify(DEFAULT_BINDINGS.pause) && JSON.stringify(d.bindings.gearUp) === '["ShiftLeft"]');
  check('everything is valid afterwards', validData(d));
}

console.log('--- versions and migrations ---');
{
  // Pretend the game is at version 3 with migrations 1->2 (rename money to cash) and 2->3 (add a bonus).
  const migs = {
    1: (d: Record<string, unknown>) => {
      const p = { ...(d.profile as Record<string, unknown>) };
      p.money = p.cash;
      delete p.cash;
      return { ...d, profile: p };
    },
    2: (d: Record<string, unknown>) => ({ ...d, profile: { ...(d.profile as Record<string, unknown>), reputation: ((d.profile as Record<string, number>).reputation ?? 0) + 10 } }),
  };
  const v1 = JSON.stringify({ format: SAVE_FORMAT, version: 1, savedAt: 1, checksum: checksum(JSON.stringify({ profile: { cash: 777, reputation: 5 } })), data: { profile: { cash: 777, reputation: 5 } } });
  const r = decodeSave(v1, migs, 3);
  check('an old save is upgraded step by step through every migration', r.status === 'ok' && r.data.profile.money === 777 && r.data.profile.reputation === 15 && r.issues.includes('migrated') && r.version === 1, JSON.stringify(r.issues));
  const v2 = JSON.stringify({ format: SAVE_FORMAT, version: 2, savedAt: 1, checksum: checksum(JSON.stringify({ profile: { money: 400, reputation: 1 } })), data: { profile: { money: 400, reputation: 1 } } });
  check('only the later migrations run for a version 2 file', decodeSave(v2, migs, 3).data.profile.reputation === 11);
  const broken = decodeSave(v1, { 1: () => { throw new Error('boom'); } }, 2);
  check('a migration that throws does not crash loading', broken.status === 'repaired' && broken.issues.includes('migration_failed') && validData(broken.data));
  check('a missing migration step is reported, not fatal', decodeSave(v1, {}, 2).issues.includes('migration_failed'));
  const future = JSON.parse(encodeSave(richData()));
  future.version = SAVE_VERSION + 4;
  const fr = decodeSave(JSON.stringify(future));
  check('a save from a newer game loads what it can and is flagged', fr.status === 'repaired' && fr.issues.includes('newer_version') && fr.data.profile.money === 48210);
  check('the real migration table is consistent (a step for every version below current)', Array.from({ length: SAVE_VERSION - 1 }, (_, i) => i + 1).every((v) => typeof MIGRATIONS[v] === 'function'));
}

console.log('--- the save manager ---');
{
  // Clean start.
  const be = new MemoryBackend();
  const m = new SaveManager(be, () => 1000);
  setGame(defaultSaveData());
  const rep = m.load();
  check('first run: a fresh game, saved straight away', rep.source === 'fresh' && rep.notice === null && be.read(KEYS.main) !== null && getProfile().money === STARTING_MONEY);

  // Play, save, "restart".
  const d = richData();
  setGame(d);
  check('saving works', m.save() === true && m.lastError === null && m.lastSavedAt === 1000);
  setGame(defaultSaveData());
  const m2 = new SaveManager(be, () => 2000);
  const rep2 = m2.load();
  check('restart: everything comes back (money, rep, cars, upgrades, damage, scores, jobs, settings, bindings)', rep2.source === 'main' && sameData(m2.snapshot(), d) && rep2.notice === null);
  check('and the live game uses it', getProfile().money === 48210 && getSettings().masterVolume === 0.35 && getBindings().accelerate[0] === 'KeyE');

  // Skip unchanged saves.
  let writes = 0;
  const counting = new (class extends MemoryBackend {
    override write(k: string, v: string): void { writes++; super.write(k, v); }
  })();
  const mc = new SaveManager(counting, () => 5);
  setGame(defaultSaveData());
  mc.load();
  const w0 = writes;
  mc.save(); mc.save(); mc.save();
  check('saving with nothing changed writes nothing', writes === w0);
  getProfile().money += 1;
  mc.save();
  check('a change writes (main plus the backup of the previous save)', writes > w0);

  // Backup rotation and recovery.
  const be2 = new MemoryBackend();
  const m3 = new SaveManager(be2, () => 3000);
  setGame(defaultSaveData());
  m3.load();
  getProfile().money = 1111; m3.save();
  getProfile().money = 2222; m3.save();
  check('the previous good save is kept as a backup', decodeSave(be2.read(KEYS.backup)).data.profile.money === 1111 && decodeSave(be2.read(KEYS.main)).data.profile.money === 2222);
  const good = be2.read(KEYS.main)!;

  be2.store.set(KEYS.main, good.slice(0, 40)); // truncated by a crash
  setGame(defaultSaveData());
  const m4 = new SaveManager(be2, () => 4000);
  const rep4 = m4.load();
  check('truncated main save: restored from the backup, with a notice', rep4.source === 'backup' && getProfile().money === 1111 && !!rep4.notice);
  check('the damaged text is kept aside, and the main save is healthy again', be2.read(KEYS.corrupt) === good.slice(0, 40) && decodeSave(be2.read(KEYS.main)).status === 'ok');

  be2.store.set(KEYS.main, '%%% not json %%%');
  be2.store.set(KEYS.backup, 'also broken');
  setGame(richData());
  const m5 = new SaveManager(be2, () => 5000);
  const rep5 = m5.load();
  check('main and backup both unreadable: a new game, an explanation, the old text kept', rep5.source === 'fresh' && getProfile().money === STARTING_MONEY && !!rep5.notice && be2.read(KEYS.corrupt) === '%%% not json %%%');

  // Tampered main, no backup: salvaged.
  const be3 = new MemoryBackend();
  be3.store.set(KEYS.main, encodeSave(richData()).replace('"money":48210', '"money":50000'));
  setGame(defaultSaveData());
  const rep6 = new SaveManager(be3, () => 6000).load();
  check('bad checksum and no backup: the readable data is salvaged', rep6.source === 'salvaged' && getProfile().money === 50000 && !!rep6.notice);

  // Missing main, backup exists.
  const be4 = new MemoryBackend();
  be4.store.set(KEYS.backup, encodeSave(richData()));
  setGame(defaultSaveData());
  const rep7 = new SaveManager(be4, () => 7000).load();
  check('main save missing but a backup exists: restored', rep7.source === 'backup' && getProfile().money === 48210);

  // Newer version keeps a copy.
  const be5 = new MemoryBackend();
  const fut = JSON.parse(encodeSave(richData()));
  fut.version = SAVE_VERSION + 1;
  be5.store.set(KEYS.main, JSON.stringify(fut));
  setGame(defaultSaveData());
  const rep8 = new SaveManager(be5, () => 8000).load();
  check('a newer-version save is loaded and an untouched copy is kept before it is overwritten', rep8.issues.includes('newer_version') && be5.read(KEYS.future) === JSON.stringify(fut) && getProfile().money === 48210);

  // Legacy settings import.
  const be6 = new MemoryBackend();
  be6.store.set(KEYS.legacySettings, JSON.stringify({ steerMode: 'wheel', quality: 'low' }));
  setGame(defaultSaveData());
  const rep9 = new SaveManager(be6, () => 9000).load();
  check('settings from the old build are imported on first run', rep9.source === 'legacy' && getSettings().steerMode === 'wheel' && getSettings().quality === 'low' && decodeSave(be6.read(KEYS.main)).data.settings.quality === 'low');

  // Failed writes never lose the existing save.
  const be7 = new MemoryBackend();
  const m10 = new SaveManager(be7, () => 10000);
  setGame(defaultSaveData());
  m10.load();
  getProfile().money = 3333; m10.save();
  const before = be7.read(KEYS.main);
  be7.failWrites = true;
  getProfile().money = 4444;
  const okFail = m10.save();
  check('a full disk: save reports failure and remembers why', okFail === false && !!m10.lastError);
  check('and the existing save is untouched and still loads', be7.read(KEYS.main) === before && decodeSave(be7.read(KEYS.main)).data.profile.money === 3333);
  be7.failWrites = false;
  check('once space returns, saving works again', m10.save() === true && m10.lastError === null && decodeSave(be7.read(KEYS.main)).data.profile.money === 4444);

  // Export / import.
  const be8 = new MemoryBackend();
  const m11 = new SaveManager(be8, () => 11000);
  setGame(richData());
  m11.save(true);
  const exported = m11.exportText();
  setGame(defaultSaveData());
  const bad = m11.importText('this is not a save');
  check('importing garbage is refused and changes nothing', bad.ok === false && getProfile().money === STARTING_MONEY);
  const good2 = m11.importText(exported);
  check('importing an exported save restores it (and stores it)', good2.ok === true && getProfile().money === 48210 && sameData(decodeSave(be8.read(KEYS.main)).data, richData()));
  const tampered = m11.importText(exported.replace('"money":48210', '"money":1'));
  check('importing a tampered save works but says it was repaired', tampered.ok === true && /REPAIRED/.test(tampered.message));

  // Reset.
  setGame(richData());
  m11.save(true);
  m11.resetProgress();
  check('reset progress: starting money and car again, settings and key bindings kept', getProfile().money === STARTING_MONEY && Object.keys(getProfile().vehicles).length === 1 && getSettings().masterVolume === 0.35 && getBindings().accelerate[0] === 'KeyE');
  check('the progress from before the reset is still in the backup', decodeSave(be8.read(KEYS.backup)).data.profile.money === 48210);
  m11.resetAll();
  check('reset all: settings and bindings back to defaults too', getSettings().masterVolume === DEFAULT_SETTINGS.masterVolume && JSON.stringify(getBindings()) === JSON.stringify(DEFAULT_BINDINGS));
}

console.log('--- fuzzing: random damage never crashes loading ---');
{
  let seed = 424242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const original = encodeSave(richData());
  let thrown = 0, invalidData = 0, runs = 0;
  for (let i = 0; i < 600; i++) {
    let t = original;
    const kind = i % 4;
    if (kind === 0) t = t.slice(0, Math.floor(rnd() * t.length));
    else if (kind === 1) { const k = Math.floor(rnd() * t.length); t = t.slice(0, k) + String.fromCharCode(32 + Math.floor(rnd() * 90)) + t.slice(k + 1); }
    else if (kind === 2) { const a = Math.floor(rnd() * t.length), b = Math.floor(rnd() * 80); t = t.slice(0, a) + t.slice(a + b); }
    else { for (let j = 0; j < 12; j++) { const k = Math.floor(rnd() * t.length); t = t.slice(0, k) + ['0', '9', '-', 'null', '[]', '{}', '"x"', '1e999'][Math.floor(rnd() * 8)] + t.slice(k + 1); } }
    runs++;
    try {
      const r = decodeSave(t);
      if (!validData(r.data)) invalidData++;
      // Also through a manager: the game must always start.
      const be = new MemoryBackend();
      be.store.set(KEYS.main, t);
      setGame(defaultSaveData());
      new SaveManager(be, () => 1).load();
      if (!validData(m0())) invalidData++;
    } catch {
      thrown++;
    }
  }
  check(`${runs} randomly damaged saves: none throws`, thrown === 0, `(${thrown} threw)`);
  check(`${runs} randomly damaged saves: the game always ends up with valid data`, invalidData === 0, `(${invalidData} invalid)`);
}
function m0(): SaveData {
  return { profile: getProfile(), settings: getSettings(), bindings: getBindings() };
}

console.log('--- bindings ---');
{
  check('default bindings survive parsing', JSON.stringify(parseBindings(DEFAULT_BINDINGS)) === JSON.stringify(DEFAULT_BINDINGS) && JSON.stringify(parseBindings(null)) === JSON.stringify(DEFAULT_BINDINGS));
  const b = bindKey(DEFAULT_BINDINGS, 'brake', 'KeyE');
  check('rebinding makes the new key primary and keeps the old one as an alternative (max two)', b.brake[0] === 'KeyE' && b.brake.length === 2 && b.brake[1] === 'KeyS');
  const c = bindKey(DEFAULT_BINDINGS, 'brake', 'KeyW');
  check('taking a key from another action removes it there, and that action keeps another key', c.brake[0] === 'KeyW' && !c.accelerate.includes('KeyW') && c.accelerate.length >= 1 && c.accelerate[0] === 'ArrowUp');
  const d = bindKey(bindKey(DEFAULT_BINDINGS, 'pause', 'KeyP'), 'accelerate', 'KeyP');
  check('stealing the only key of an action restores a default for it', d.pause.length >= 1 && !d.pause.includes('KeyP') && d.pause[0] === 'Escape');
  const all = Object.values(c).flat();
  check('after rebinding no key is bound to two actions', new Set(all).size === all.length);
  check('reserved keys cannot be loaded from a save', RESERVED_KEYS.every((k) => !parseBindings({ accelerate: [k] }).accelerate.includes(k)));
  check('key labels are readable', keyLabel('KeyW') === 'W' && keyLabel('ArrowUp') === 'UP' && keyLabel('ShiftLeft') === 'L-SHIFT' && keyLabel('Digit5') === '5' && keyLabel('Space') === 'SPACE');
  let calls = 0;
  onSettingsChange(() => calls++);
  updateSettings({ masterVolume: 0.5 });
  replaceSettings({ masterVolume: 0.9 });
  check('settings changes notify the save system (loading a save does not)', calls === 1 && getSettings().masterVolume === 0.9);
}

console.log(failures === 0 ? '\nALL SAVE CHECKS PASSED' : `\n${failures} SAVE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
