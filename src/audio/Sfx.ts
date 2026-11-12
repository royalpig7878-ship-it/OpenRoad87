import { impactLevel, midiHz } from './audioMath';
import { noiseHit, tone } from './synth';

/** One-shot sound effects, synthesised on demand. Names are the public vocabulary used by scenes. */
export type SfxName =
  | 'shift' | 'turboBlow' | 'crash' | 'scrape' | 'nearMiss' | 'passBy' | 'sputter' | 'tick'
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'uiError' | 'cash'
  | 'countBeep' | 'go' | 'checkpoint' | 'fanfare' | 'busted' | 'escaped' | 'rankUp';

export interface SfxOpts {
  /** 0..1 strength (impact speed, etc.) */
  level?: number;
  /** -1 left .. 1 right (for passing sounds) */
  pan?: number;
  /** Doppler-ish relative speed in km/h for passing sounds. */
  speedKph?: number;
  /** Which tick of a pair (turn signal) or countdown number. */
  n?: number;
}

/** Wraps `dest` in a stereo panner when pan is given and the context supports it. */
function panned(ctx: BaseAudioContext, dest: AudioNode, pan: number | undefined): AudioNode {
  if (pan === undefined || typeof ctx.createStereoPanner !== 'function') return dest;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  return p;
}

/** Plays one effect starting at the context's current time. */
export function playSfx(ctx: BaseAudioContext, dest: AudioNode, name: SfxName, o: SfxOpts = {}): void {
  const t = ctx.currentTime + 0.005;
  const lvl = o.level ?? 1;
  switch (name) {
    case 'shift': // clunk of the gearbox
      tone(ctx, dest, { type: 'square', freq: 130, freqEnd: 70, t, dur: 0.07, gain: 0.3, lowpass: 600 });
      noiseHit(ctx, dest, { t, dur: 0.05, gain: 0.25, filter: 'bandpass', freq: 1200, q: 1.5 });
      break;
    case 'turboBlow': // blow-off valve "pshh"
      noiseHit(ctx, dest, { t, dur: 0.35, gain: 0.3, filter: 'highpass', freq: 2500, freqEnd: 1200 });
      break;
    case 'crash': {
      const L = impactLevel(lvl * 90);
      const d = panned(ctx, dest, o.pan);
      tone(ctx, d, { type: 'sine', freq: 110, freqEnd: 35, t, dur: 0.45, gain: 0.9 * L });
      noiseHit(ctx, d, { t, dur: 0.5, gain: 0.8 * L, filter: 'lowpass', freq: 3500, freqEnd: 300 });
      noiseHit(ctx, d, { t: t + 0.02, dur: 0.25, gain: 0.5 * L, filter: 'bandpass', freq: 2400, freqEnd: 900, q: 1.2 }); // metal crunch
      tone(ctx, d, { type: 'square', freq: 320, freqEnd: 90, t, dur: 0.2, gain: 0.25 * L, lowpass: 1800 });
      break;
    }
    case 'scrape': // guardrail grind
      noiseHit(ctx, dest, { t, dur: 0.55, gain: 0.8 * lvl, filter: 'bandpass', freq: 1800, freqEnd: 700, q: 2.5 });
      tone(ctx, dest, { type: 'sawtooth', freq: 480, freqEnd: 260, t, dur: 0.45, gain: 0.14 * lvl, lowpass: 1500 });
      break;
    case 'nearMiss': // fast whoosh with a pitch drop (the "doppler" of a car flashing past)
    case 'passBy': {
      const d = panned(ctx, dest, o.pan);
      const v = Math.min(1, (o.speedKph ?? 120) / 200);
      const g = (name === 'nearMiss' ? 1 : 0.55) * (0.5 + 0.5 * v);
      noiseHit(ctx, d, { t, dur: 0.45, gain: g, filter: 'bandpass', freq: 1500 + 1200 * v, freqEnd: 350, q: 0.9, attack: 0.08 });
      tone(ctx, d, { type: 'sawtooth', freq: 170 + 90 * v, freqEnd: 95, t, dur: 0.5, gain: g * 0.25, lowpass: 500, attack: 0.1 });
      break;
    }
    case 'sputter': // engine dying: a few stuttering coughs
      for (let i = 0; i < 4; i++) tone(ctx, dest, { type: 'sawtooth', freq: 70 - i * 6, t: t + i * 0.12, dur: 0.09, gain: 0.35, lowpass: 300 });
      break;
    case 'tick': // turn-signal relay
      tone(ctx, dest, { type: 'square', freq: (o.n ?? 0) % 2 ? 1500 : 1100, t, dur: 0.025, gain: 0.1 });
      break;
    case 'uiMove':
      tone(ctx, dest, { type: 'square', freq: 880, t, dur: 0.05, gain: 0.12, lowpass: 3000 });
      break;
    case 'uiSelect':
      tone(ctx, dest, { type: 'square', freq: 660, t, dur: 0.06, gain: 0.15, lowpass: 3000 });
      tone(ctx, dest, { type: 'square', freq: 990, t: t + 0.06, dur: 0.09, gain: 0.15, lowpass: 3000 });
      break;
    case 'uiBack':
      tone(ctx, dest, { type: 'square', freq: 700, t, dur: 0.05, gain: 0.13, lowpass: 3000 });
      tone(ctx, dest, { type: 'square', freq: 460, t: t + 0.05, dur: 0.08, gain: 0.13, lowpass: 3000 });
      break;
    case 'uiError':
      tone(ctx, dest, { type: 'sawtooth', freq: 150, t, dur: 0.18, gain: 0.22, lowpass: 700 });
      break;
    case 'cash': // register "ka-ching"
      noiseHit(ctx, dest, { t, dur: 0.05, gain: 0.2, filter: 'highpass', freq: 5000 });
      tone(ctx, dest, { type: 'triangle', freq: 1568, t: t + 0.05, dur: 0.12, gain: 0.18 });
      tone(ctx, dest, { type: 'triangle', freq: 2093, t: t + 0.13, dur: 0.35, gain: 0.18 });
      break;
    case 'countBeep': // pre-race beeps: low for 3-2-1
      tone(ctx, dest, { type: 'square', freq: 440, t, dur: 0.2, gain: 0.14, lowpass: 2500 });
      break;
    case 'go':
      tone(ctx, dest, { type: 'square', freq: 880, t, dur: 0.5, gain: 0.16, lowpass: 3500 });
      tone(ctx, dest, { type: 'sawtooth', freq: 1320, t, dur: 0.5, gain: 0.07, lowpass: 3500 });
      break;
    case 'checkpoint':
      tone(ctx, dest, { type: 'triangle', freq: 1046, t, dur: 0.1, gain: 0.2 });
      tone(ctx, dest, { type: 'triangle', freq: 1568, t: t + 0.09, dur: 0.25, gain: 0.2 });
      break;
    case 'fanfare': // C major arpeggio and a held chord
      [60, 64, 67, 72].forEach((m, i) => tone(ctx, dest, { type: 'square', freq: midiHz(m), t: t + i * 0.1, dur: 0.14, gain: 0.12, lowpass: 3500 }));
      [72, 76, 79].forEach((m) => tone(ctx, dest, { type: 'sawtooth', freq: midiHz(m), t: t + 0.4, dur: 0.9, gain: 0.07, lowpass: 2800 }));
      break;
    case 'rankUp':
      [67, 72, 76, 79, 84].forEach((m, i) => tone(ctx, dest, { type: 'square', freq: midiHz(m), t: t + i * 0.08, dur: 0.16, gain: 0.11, lowpass: 3500 }));
      break;
    case 'busted': // descending sad stinger
      [67, 63, 60, 55].forEach((m, i) => tone(ctx, dest, { type: 'sawtooth', freq: midiHz(m), t: t + i * 0.18, dur: 0.3, gain: 0.12, lowpass: 1800 }));
      noiseHit(ctx, dest, { t, dur: 0.15, gain: 0.3, filter: 'lowpass', freq: 800 });
      break;
    case 'escaped': // quick upbeat run
      [60, 64, 67, 72, 76].forEach((m, i) => tone(ctx, dest, { type: 'square', freq: midiHz(m), t: t + i * 0.07, dur: 0.12, gain: 0.11, lowpass: 3500 }));
      break;
  }
}
