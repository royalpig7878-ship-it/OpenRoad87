// Headless checks of the even-pixel ("sharp bilinear") screen scaling plan and its setting.
import { SHARP_MAX_SCALE, deviceScale, nearestUnevenness, planSharpScale } from '../src/core/sharpPlan';
import { DEFAULT_SETTINGS, parseSettings } from '../src/save/Settings';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

console.log('--- device scale ---');
check('1280x720 CSS at 1x is 1.333; 1536 CSS at 1.25x is exactly 2', Math.abs(deviceScale(1280, 1, 960) - 1.3333) < 1e-3 && deviceScale(1536, 1.25, 960) === 2);
check('retina MacBook: 1440 CSS at 2x is exactly 3', deviceScale(1440, 2, 960) === 3);

console.log('--- when the scaler is used ---');
check('whole scales (1x 2x 3x, and within 2%) are left alone', [1, 2, 3, 2.01, 1.99, 2.019].every((s) => !planSharpScale(s).active));
const cases: [string, number][] = [
  ['1366x768 laptop', 1366 / 960],
  ['1280x720 window', 1280 / 960],
  ['1600x900 window', 1600 / 960],
  ['1920x1080 window with a title bar (1.89)', 1.89],
  ['2560x1440 monitor', 2560 / 960],
  ['iPhone landscape (desktop rules)', 2.1667],
];
for (const [name, s] of cases) {
  const p = planSharpScale(s);
  check(`${name} (scale ${s.toFixed(2)}): on, enlarges by ${Math.ceil(s)}`, p.active && p.factor === Math.ceil(s) && p.factor >= s);
}
check('plain scaling is uneven at fractional scales and even at whole ones', nearestUnevenness(1.4229) === 1 && nearestUnevenness(2.6667) === 1 && nearestUnevenness(2) === 0 && nearestUnevenness(4) === 0);
check('at 3x and above the extra work is skipped (uneven pixels are too small to see)', !planSharpScale(SHARP_MAX_SCALE).active && !planSharpScale(3.4).active && !planSharpScale(5.5).active);
check('below 1x the scaler is not used', !planSharpScale(0.9).active && !planSharpScale(0.5).active);
check('touch screens skip it from 2x up (phones already sit near a whole number), but not below', !planSharpScale(2.17, true).active && planSharpScale(1.6, true).active && planSharpScale(2.17, false).active);
check('bad input is safe', !planSharpScale(NaN).active && !planSharpScale(Infinity).active && !planSharpScale(-3).active && !planSharpScale(0).active);
{
  let ok = true;
  for (let i = 0; i < 400; i++) {
    const s = 0.95 + i * 0.006;
    const p = planSharpScale(s);
    if (p.active && (p.factor < s || p.factor < 2 || p.factor > 3)) ok = false; // the second step must only shrink, never stretch
  }
  check('across 400 scales the enlargement is always a whole number between 2 and 3 and never smaller than the scale', ok);
}

console.log('--- the setting ---');
check('defaults to even pixels', DEFAULT_SETTINGS.pixelScaling === 'even');
check('the original (plain) mode can be chosen and saved', parseSettings('{"pixelScaling":"original"}').pixelScaling === 'original');
check('junk values fall back to even', parseSettings('{"pixelScaling":"blurry"}').pixelScaling === 'even' && parseSettings('{"pixelScaling":5}').pixelScaling === 'even' && parseSettings('{}').pixelScaling === 'even');

console.log(failures === 0 ? '\nALL SCALING CHECKS PASSED' : `\n${failures} SCALING CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
