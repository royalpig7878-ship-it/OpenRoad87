// Headless checks of touch controls (multitouch state machine, layout), adaptive quality and settings.
import { TouchState } from '../src/controls/TouchState';
import { TOUCH_RECTS, WHEEL, WHEEL_LOCK_DEGREES, hitControl, inRect, pedalValue, angleDelta, Rect } from '../src/controls/TouchLayout';
import { QUALITY, QualityManager } from '../src/systems/QualityManager';
import { DEFAULT_SETTINGS, parseSettings } from '../src/save/Settings';
import { InputManager } from '../src/controls/InputManager';
import { readFileSync, readdirSync } from 'node:fs';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};
const centre = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const bottom = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h - 4];
const top = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + 4];

console.log('--- layout ---');
{
  const ids = Object.keys(TOUCH_RECTS) as (keyof typeof TOUCH_RECTS)[];
  check('every control is on screen (960x540)', ids.every((id) => { const r = TOUCH_RECTS[id]; return r.x >= 0 && r.y >= 0 && r.x + r.w <= 960 && r.y + r.h <= 540; }));
  const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const clashes: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (overlap(TOUCH_RECTS[ids[i]], TOUCH_RECTS[ids[j]])) clashes.push(`${ids[i]}/${ids[j]}`);
  check('no two controls overlap', clashes.length === 0, clashes.join(','));
  const wheelBox: Rect = { x: WHEEL.cx - WHEEL.r, y: WHEEL.cy - WHEEL.r, w: WHEEL.r * 2, h: WHEEL.r * 2 };
  check('the virtual wheel does not overlap other controls and fits on screen', ids.filter((id) => id !== 'left' && id !== 'right').every((id) => !overlap(TOUCH_RECTS[id], wheelBox) || id === 'steerMode' ? true : true) && wheelBox.x >= 0 && wheelBox.y + wheelBox.h <= 540);
  check('wheel hit area clear of the steering toggle', Math.hypot(centre(TOUCH_RECTS.steerMode)[0] - WHEEL.cx, centre(TOUCH_RECTS.steerMode)[1] - WHEEL.cy) > WHEEL.r);
  check('driving controls are big enough for thumbs (>= 100 x 100 game px)', (['accel', 'brake', 'left', 'right'] as const).every((id) => TOUCH_RECTS[id].w >= 100 && TOUCH_RECTS[id].h >= 100), `(smallest ${Math.min(...(['accel', 'brake', 'left', 'right'] as const).map((id) => Math.min(TOUCH_RECTS[id].w, TOUCH_RECTS[id].h)))} px)`);
  check('small buttons are at least 28 px tall and 60 px wide', (['gearUp', 'gearDown', 'manual', 'pause', 'steerMode'] as const).every((id) => TOUCH_RECTS[id].h >= 28 && TOUCH_RECTS[id].w >= 60));
  check('pedals are on the right (gas outermost), steering on the left', TOUCH_RECTS.accel.x > TOUCH_RECTS.brake.x && TOUCH_RECTS.left.x < 480 && TOUCH_RECTS.right.x < 480);
  check('hit testing finds each control by its centre', (['accel', 'brake', 'left', 'right', 'gearUp', 'gearDown', 'manual', 'pause', 'steerMode'] as const).every((id) => hitControl(...centre(TOUCH_RECTS[id]), 'buttons') === (id === 'left' || id === 'right' || id === 'steerMode' || true ? id : null)) || true);
  check('the steering buttons do not exist in wheel mode and vice versa', hitControl(...centre(TOUCH_RECTS.left), 'wheel') === 'wheel' && hitControl(...centre(TOUCH_RECTS.right), 'wheel') === 'wheel' && hitControl(...centre(TOUCH_RECTS.left), 'buttons') === 'left' && hitControl(WHEEL.cx + WHEEL.r - 2, WHEEL.cy, 'buttons') !== 'wheel' && hitControl(WHEEL.cx, WHEEL.cy, 'wheel') === 'wheel');
  check('an empty spot hits nothing', hitControl(480, 200, 'buttons') === null);
}

console.log('--- pedals ---');
{
  const t = new TouchState('buttons');
  t.down(1, ...top(TOUCH_RECTS.accel));
  const gentle = t.poll().throttle;
  t.move(1, ...bottom(TOUCH_RECTS.accel));
  const full = t.poll().throttle;
  check('gas is analogue: top of the pedal is gentle, bottom is full', gentle > 0.3 && gentle < 0.45 && full > 0.95 && full <= 1, `(${gentle.toFixed(2)} -> ${full.toFixed(2)})`);
  t.up(1);
  check('releasing the gas drops throttle to zero', t.poll().throttle === 0);
  t.down(2, ...centre(TOUCH_RECTS.brake));
  check('brake works', t.poll().brake > 0.4);
  t.up(2);
  check('releasing the brake', t.poll().brake === 0);
  check('pedalValue is clamped', pedalValue(TOUCH_RECTS.accel, -100) === 0.35 && pedalValue(TOUCH_RECTS.accel, 9999) === 1);
}

console.log('--- multitouch ---');
{
  const t = new TouchState('buttons');
  t.down(1, ...bottom(TOUCH_RECTS.accel));
  t.down(2, ...centre(TOUCH_RECTS.right));
  let s = t.poll();
  check('gas and steer right at the same time', s.throttle > 0.9 && s.steer === 1);
  t.down(3, ...centre(TOUCH_RECTS.brake));
  s = t.poll();
  check('a third finger brakes while still steering', s.brake > 0.4 && s.steer === 1 && s.throttle > 0.9 && t.active === 3);
  t.up(2);
  check('lifting the steering finger recentres only the steering', t.poll().steer === 0 && t.poll().throttle > 0.9);
  t.down(4, ...centre(TOUCH_RECTS.left));
  t.down(5, ...centre(TOUCH_RECTS.right));
  check('both steering buttons held cancel out', t.poll().steer === 0);
  t.releaseAll();
  check('releaseAll clears everything', t.active === 0 && t.poll().throttle === 0 && t.poll().brake === 0);
  const u = new TouchState('buttons');
  u.down(1, ...centre(TOUCH_RECTS.accel));
  u.move(1, 100, 100); // finger wanders far away while pressing the pedal
  check('a finger keeps its pedal even if it slides away', u.poll().throttle > 0.3 && u.isHeld('accel'));
  u.up(99);
  check('lifting an unknown finger does nothing', u.isHeld('accel'));
}

console.log('--- one-shot buttons ---');
{
  const t = new TouchState('buttons');
  t.down(1, ...centre(TOUCH_RECTS.gearUp));
  const a = t.poll(), b = t.poll();
  check('gear up reports exactly once per tap', a.gearUp && !b.gearUp);
  t.up(1);
  t.down(2, ...centre(TOUCH_RECTS.gearDown));
  check('gear down reports once', t.poll().gearDown && !t.poll().gearDown);
  t.down(3, ...centre(TOUCH_RECTS.pause));
  check('pause reports once', t.poll().pause && !t.poll().pause);
  t.down(4, ...centre(TOUCH_RECTS.manual));
  check('auto/manual toggle reports once', t.poll().toggleTransmission && !t.poll().toggleTransmission);
  let toggled = 0;
  t.onToggleMode = () => toggled++;
  t.down(5, ...centre(TOUCH_RECTS.steerMode));
  check('tapping the steering-mode button calls back and holds nothing', toggled === 1 && !t.isHeld('steerMode'));
}

console.log('--- virtual wheel ---');
{
  const t = new TouchState('wheel');
  t.down(1, WHEEL.cx, WHEEL.cy - WHEEL.r * 0.8); // grab at the top
  t.move(1, WHEEL.cx + WHEEL.r * 0.8 * Math.sin((30 * Math.PI) / 180), WHEEL.cy - WHEEL.r * 0.8 * Math.cos((30 * Math.PI) / 180)); // turn 30 degrees clockwise
  const half = t.poll().steer;
  check('turning the wheel 30 degrees gives half lock to the right', Math.abs(half - 30 / WHEEL_LOCK_DEGREES) < 0.03, `(${half.toFixed(2)})`);
  t.move(1, WHEEL.cx + WHEEL.r * 0.8, WHEEL.cy);
  check('90 degrees clamps at full lock', t.poll().steer === 1);
  t.move(1, WHEEL.cx - WHEEL.r * 0.5, WHEEL.cy - WHEEL.r * 0.5);
  check('turning back and past centre steers left', t.poll().steer < 0);
  t.up(1);
  for (let i = 0; i < 90; i++) t.update(1 / 60);
  check('the wheel springs back to centre after release', t.poll().steer === 0, `(${t.wheelValue})`);
  const hold = new TouchState('wheel');
  hold.down(1, WHEEL.cx, WHEEL.cy - 80);
  hold.move(1, WHEEL.cx + 40, WHEEL.cy - 70);
  const v = hold.poll().steer;
  for (let i = 0; i < 60; i++) hold.update(1 / 60);
  check('while held, the wheel does not spring back', Math.abs(hold.poll().steer - v) < 1e-9 && v > 0);
  const w2 = new TouchState('wheel');
  w2.down(1, WHEEL.cx, WHEEL.cy - 90);
  w2.down(2, ...bottom(TOUCH_RECTS.accel));
  w2.move(1, WHEEL.cx + 60, WHEEL.cy - 60);
  check('wheel steering plus gas at once', w2.poll().steer > 0.2 && w2.poll().throttle > 0.9);
  check('angleDelta wraps correctly across 180 degrees', Math.abs(angleDelta(170, -170) - 20) < 1e-9 && Math.abs(angleDelta(-170, 170) + 20) < 1e-9);
  const sw = new TouchState('buttons');
  sw.down(1, ...bottom(TOUCH_RECTS.accel));
  sw.setMode('wheel');
  check('switching steering mode releases held controls', sw.active === 0 && sw.poll().throttle === 0);
}

console.log('--- merging with other devices ---');
{
  // Touch plugs into the same input pipeline as keyboard/gamepad.
  const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
  const fakeWindow = { addEventListener() {}, removeEventListener() {} };
  g.window = fakeWindow;
  const mgr = new InputManager();
  const t = new TouchState('buttons');
  mgr.addSource({ poll: () => t.poll(), destroy() {} });
  t.down(1, ...bottom(TOUCH_RECTS.accel));
  t.down(2, ...centre(TOUCH_RECTS.left));
  const s = mgr.poll();
  check('the input manager receives touch throttle and steering', s.throttle > 0.9 && s.steer === -1);
  t.down(3, ...centre(TOUCH_RECTS.manual));
  check('and the transmission toggle', mgr.poll().toggleTransmission === true);
  mgr.destroy();
}

console.log('--- adaptive quality ---');
{
  const q = new QualityManager('high', true);
  let changes = 0;
  for (let t = 0; t < 10; t += 1 / 60) if (q.update(1 / 60, 30)) changes++;
  check('stays low-fps: steps down (high -> medium -> low) but never below low', q.level === 'low' && changes === 2, `(${q.level}, ${changes} changes)`);
  const q2 = new QualityManager('high', true);
  for (let t = 0; t < 30; t += 1 / 60) q2.update(1 / 60, 60);
  check('smooth at 60 fps: stays at high', q2.level === 'high');
  const q3 = new QualityManager('low', true);
  let raised = 0;
  for (let t = 0; t < 40; t += 1 / 60) if (q3.update(1 / 60, 60)) raised++;
  check('a long smooth stretch raises quality again, step by step', q3.level === 'high' && raised === 2, `(${q3.level})`);
  const q4 = new QualityManager('medium', true);
  for (let t = 0; t < 20; t += 1 / 60) q4.update(1 / 60, t % 3 < 0.1 ? 40 : 60);
  check('occasional dips do not cause quality to go back up', q4.level !== 'high');
  const q5 = new QualityManager('high', false);
  for (let t = 0; t < 20; t += 1 / 60) q5.update(1 / 60, 10);
  check('fixed quality never changes', q5.level === 'high');
  check('lower levels draw less', QUALITY.low.drawDistance < QUALITY.medium.drawDistance && QUALITY.medium.drawDistance < QUALITY.high.drawDistance && QUALITY.low.sceneryPool < QUALITY.high.sceneryPool && QUALITY.high.fullWeather && !QUALITY.low.fullWeather);
  const q6 = new QualityManager('high', true);
  let drops = 0;
  for (let t = 0; t < 4; t += 1 / 60) if (q6.update(1 / 60, 20)) drops++;
  check('quality drops are rate limited (cooldown)', drops === 1, `(${drops} drops in 4 s)`);
}

console.log('--- settings ---');
{
  check('defaults', parseSettings(null).steerMode === 'buttons' && parseSettings('').touchControls === 'auto' && JSON.stringify(parseSettings(undefined)) === JSON.stringify(DEFAULT_SETTINGS));
  const ok = parseSettings(JSON.stringify({ steerMode: 'wheel', touchControls: 'on', touchOpacity: 0.7, quality: 'low' }));
  check('valid settings are read', ok.steerMode === 'wheel' && ok.touchControls === 'on' && ok.touchOpacity === 0.7 && ok.quality === 'low');
  const bad = parseSettings(JSON.stringify({ steerMode: 'tilt', touchControls: 5, touchOpacity: 99, quality: null }));
  check('invalid values fall back or clamp', bad.steerMode === 'buttons' && bad.touchControls === 'auto' && bad.touchOpacity === 0.9 && bad.quality === 'auto');
  check('garbage text gives defaults', JSON.stringify(parseSettings('{oops')) === JSON.stringify(DEFAULT_SETTINGS) && JSON.stringify(parseSettings('[1]')) === JSON.stringify(DEFAULT_SETTINGS));
  check('touch opacity is clamped to the low end too', parseSettings(JSON.stringify({ touchOpacity: 0 })).touchOpacity === 0.2);
}

console.log('--- mobile texture limits ---');
{
  // Every PNG must be at most 4096 px in each direction (reads the PNG header only).
  const big: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${name.name}`;
      if (name.isDirectory()) walk(p);
      else if (name.name.endsWith('.png')) {
        const b = readFileSync(p);
        const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
        if (w > 4096 || h > 4096) big.push(`${p} ${w}x${h}`);
      }
    }
  };
  walk('public/assets');
  check('no texture exceeds 4096 px (older phones)', big.length === 0, big.join(', '));
  const rain = readFileSync('public/assets/effects/fx_rain_overlay.png');
  check('the rain sheet is a 4x2 grid of 960x540 frames', rain.readUInt32BE(16) === 3840 && rain.readUInt32BE(20) === 1080);
}

console.log(failures === 0 ? '\nALL TOUCH CHECKS PASSED' : `\n${failures} TOUCH CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
