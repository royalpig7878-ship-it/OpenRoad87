import { midiHz } from './audioMath';

/** Small WebAudio helpers. Everything takes a BaseAudioContext so it also runs in an OfflineAudioContext (used by tests). */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, created once per context and shared. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Small deterministic generator so offline renders are repeatable.
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** A looping noise source (not yet started). */
export function loopingNoise(ctx: BaseAudioContext): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  return src;
}

/** Gain envelope: ramp up to `peak` over `attack`, then fade to silence over `decay`. */
function envelope(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(attack, 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Optional end frequency for a slide. */
  freqEnd?: number;
  t: number;
  /** Total length in seconds. */
  dur: number;
  gain: number;
  attack?: number;
  /** Low-pass cutoff (Hz); omitted = none. */
  lowpass?: number;
  detuneCents?: number;
}

/** One oscillator note with a quick attack and exponential fade. */
export function tone(ctx: BaseAudioContext, dest: AudioNode, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.t);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), o.t + o.dur);
  if (o.detuneCents) osc.detune.value = o.detuneCents;
  const g = ctx.createGain();
  const attack = o.attack ?? 0.006;
  envelope(g, o.t, attack, o.gain, Math.max(0.01, o.dur - attack));
  let tail: AudioNode = osc;
  if (o.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    osc.connect(f);
    tail = f;
  }
  tail.connect(g).connect(dest);
  osc.start(o.t);
  osc.stop(o.t + o.dur + 0.05);
}

export interface NoiseOpts {
  t: number;
  dur: number;
  gain: number;
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  attack?: number;
}

/** A burst of filtered noise (drums, impacts, whooshes). */
export function noiseHit(ctx: BaseAudioContext, dest: AudioNode, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.freq, o.t);
  if (o.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), o.t + o.dur);
  f.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  const attack = o.attack ?? 0.003;
  envelope(g, o.t, attack, o.gain, Math.max(0.01, o.dur - attack));
  src.connect(f).connect(g).connect(dest);
  // Start at a varying offset so repeated hits do not sound identical.
  src.start(o.t, (o.t * 7.31) % 1.5);
  src.stop(o.t + o.dur + 0.05);
}

// ---- Drum and instrument voices used by the music player and effects ----

export function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  tone(ctx, dest, { type: 'sine', freq: 150, freqEnd: 42, t, dur: 0.22, gain: 0.9 * vel });
  noiseHit(ctx, dest, { t, dur: 0.03, gain: 0.25 * vel, filter: 'lowpass', freq: 1200 });
}

export function snare(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  noiseHit(ctx, dest, { t, dur: 0.17, gain: 0.55 * vel, filter: 'bandpass', freq: 1900, q: 0.6 });
  tone(ctx, dest, { type: 'triangle', freq: 210, freqEnd: 140, t, dur: 0.1, gain: 0.4 * vel });
}

export function hat(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number, open = false): void {
  noiseHit(ctx, dest, { t, dur: open ? 0.16 : 0.04, gain: 0.4 * vel, filter: 'highpass', freq: 7500 });
}

export function clap(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  for (let i = 0; i < 3; i++) noiseHit(ctx, dest, { t: t + i * 0.011, dur: 0.07, gain: 0.35 * vel, filter: 'bandpass', freq: 1500, q: 0.9 });
}

export function bassNote(ctx: BaseAudioContext, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  tone(ctx, dest, { type: 'sawtooth', freq: midiHz(midi), t, dur, gain: 0.5 * vel, lowpass: 700, attack: 0.004 });
  tone(ctx, dest, { type: 'sine', freq: midiHz(midi - 12), t, dur, gain: 0.45 * vel, attack: 0.004 });
}

export function arpNote(ctx: BaseAudioContext, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  tone(ctx, dest, { type: 'square', freq: midiHz(midi), t, dur: Math.max(0.06, dur * 0.9), gain: 0.16 * vel, lowpass: 3200 });
}

export function leadNote(ctx: BaseAudioContext, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const f = midiHz(midi);
  tone(ctx, dest, { type: 'sawtooth', freq: f, t, dur, gain: 0.2 * vel, lowpass: 2600, detuneCents: -7, attack: 0.012 });
  tone(ctx, dest, { type: 'sawtooth', freq: f, t, dur, gain: 0.2 * vel, lowpass: 2600, detuneCents: 7, attack: 0.012 });
}

export function padNote(ctx: BaseAudioContext, dest: AudioNode, t: number, midi: number, dur: number, vel: number): void {
  const f = midiHz(midi);
  tone(ctx, dest, { type: 'sawtooth', freq: f, t, dur, gain: 0.07 * vel, lowpass: 1400, detuneCents: -9, attack: Math.min(0.6, dur * 0.3) });
  tone(ctx, dest, { type: 'sawtooth', freq: f, t, dur, gain: 0.07 * vel, lowpass: 1400, detuneCents: 9, attack: Math.min(0.6, dur * 0.3) });
}
