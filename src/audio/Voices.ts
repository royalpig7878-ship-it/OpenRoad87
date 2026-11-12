import { EngineProfile, EngineTargets, MAX_ENGINE_HZ, clamp, sirenHz } from './audioMath';
import { loopingNoise } from './synth';

/** Continuous (looping) voices. Each exposes `set(...)` to glide toward new targets and `stop()` to tear down. */

const GLIDE = 0.04; // seconds: smoothing time constant for parameter changes

const glide = (p: AudioParam, v: number, ctx: BaseAudioContext) => p.setTargetAtTime(v, ctx.currentTime, GLIDE);

/** The engine: sawtooth + square + sub oscillators, intake noise, a low-pass filter, wobble and a turbo whistle. */
export class EngineVoice {
  private saw: OscillatorNode;
  private sq: OscillatorNode;
  private sub: OscillatorNode;
  private whistle: OscillatorNode;
  private noise: AudioBufferSourceNode;
  private noiseGain: GainNode;
  private whistleGain: GainNode;
  private filter: BiquadFilterNode;
  private wobble: GainNode;
  private wobbleOsc: OscillatorNode;
  private wobbleDepth: GainNode;
  readonly output: GainNode;

  constructor(private ctx: BaseAudioContext, dest: AudioNode, profile: EngineProfile) {
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1.2;
    this.filter.frequency.value = profile.cutoffIdle;

    const mix = ctx.createGain(); // sums the tone layers
    const mk = (type: OscillatorType, level: number, detune: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(mix);
      o.start();
      return o;
    };
    this.saw = mk('sawtooth', profile.saw * 0.5, -profile.detuneCents);
    this.sq = mk('square', profile.square * 0.22, profile.detuneCents);
    this.sub = mk('sine', profile.sub * 0.6, 0);

    this.noise = loopingNoise(ctx);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 500;
    nf.Q.value = 0.5;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(nf).connect(this.noiseGain).connect(mix);
    this.noise.start();

    mix.connect(this.filter);
    // Amplitude wobble: a gain stage modulated by a low-frequency oscillator (cylinder lumpiness / limiter stutter).
    this.wobble = ctx.createGain();
    this.wobble.gain.value = 1;
    this.wobbleOsc = ctx.createOscillator();
    this.wobbleOsc.frequency.value = 8;
    this.wobbleDepth = ctx.createGain();
    this.wobbleDepth.gain.value = 0;
    this.wobbleOsc.connect(this.wobbleDepth).connect(this.wobble.gain);
    this.wobbleOsc.start();
    this.filter.connect(this.wobble).connect(this.output);

    // Turbo whistle bypasses the filter.
    this.whistle = ctx.createOscillator();
    this.whistle.type = 'sine';
    this.whistle.frequency.value = 2000;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain).connect(this.output);
    this.whistle.start();

    this.output.connect(dest);
  }

  set(t: EngineTargets): void {
    const hz = clamp(t.hz, 8, MAX_ENGINE_HZ);
    const c = this.ctx;
    glide(this.saw.frequency, hz, c);
    glide(this.sq.frequency, hz * 2, c);
    glide(this.sub.frequency, hz * 0.5, c);
    glide(this.filter.frequency, clamp(t.cutoff, 80, 12000), c);
    glide(this.noiseGain.gain, t.noiseGain, c);
    glide(this.whistle.frequency, t.whistleHz, c);
    glide(this.whistleGain.gain, t.whistleGain, c);
    glide(this.wobbleOsc.frequency, clamp(t.wobbleHz, 2, 40), c);
    glide(this.wobbleDepth.gain, t.wobbleDepth, c);
    glide(this.output.gain, clamp(t.gain, 0, 1) * 0.55, c);
  }

  stop(): void {
    const t = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(t);
    this.output.gain.setTargetAtTime(0, t, 0.03);
    const end = t + 0.2;
    for (const o of [this.saw, this.sq, this.sub, this.whistle, this.wobbleOsc]) o.stop(end);
    this.noise.stop(end);
  }
}

/** Filtered looping noise with one gain control. Used for wind, rumble, rain and tyre squeal. */
export class NoiseLoop {
  private src: AudioBufferSourceNode;
  private filter: BiquadFilterNode;
  readonly gain: GainNode;
  private lfo?: OscillatorNode;
  private lfoDepth?: GainNode;

  constructor(private ctx: BaseAudioContext, dest: AudioNode, type: BiquadFilterType, freq: number, q = 0.7, rumble = false) {
    this.src = loopingNoise(ctx);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = freq;
    this.filter.Q.value = q;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.src.connect(this.filter).connect(this.gain).connect(dest);
    this.src.start();
    if (rumble) {
      // Wheel-on-rough-surface flutter: amplitude modulated at a rate that follows speed.
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 8;
      this.lfoDepth = ctx.createGain();
      this.lfoDepth.gain.value = 0.5;
      this.lfo.connect(this.lfoDepth).connect(this.gain.gain);
      this.lfo.start();
    }
  }

  set(gain: number, freq?: number, lfoHz?: number): void {
    const g = Math.max(0, gain);
    glide(this.gain.gain, g, this.ctx);
    if (this.lfoDepth) glide(this.lfoDepth.gain, g * 0.6, this.ctx);
    if (freq !== undefined) glide(this.filter.frequency, clamp(freq, 40, 16000), this.ctx);
    if (lfoHz !== undefined && this.lfo) glide(this.lfo.frequency, clamp(lfoHz, 1, 40), this.ctx);
  }

  stop(): void {
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.03);
    this.src.stop(t + 0.2);
    this.lfo?.stop(t + 0.2);
  }
}

/** Tyre squeal: band-passed noise plus a thin screech tone. */
export class TireVoice {
  private noise: NoiseLoop;
  private screech: OscillatorNode;
  private screechGain: GainNode;

  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    this.noise = new NoiseLoop(ctx, dest, 'bandpass', 1800, 6);
    this.screech = ctx.createOscillator();
    this.screech.type = 'sawtooth';
    this.screech.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    this.screech.connect(lp).connect(this.screechGain).connect(dest);
    this.screech.start();
  }

  set(gain: number, hz: number): void {
    this.noise.set(gain * 0.55, hz);
    glide(this.screech.frequency, hz * 0.55, this.ctx);
    glide(this.screechGain.gain, gain * 0.05, this.ctx);
  }

  stop(): void {
    this.noise.stop();
    this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    this.screech.stop(this.ctx.currentTime + 0.2);
  }
}

/** Police siren: a two-tone yelp (see `sirenHz`) with distance, Doppler and stereo pan. */
export class SirenVoice {
  private osc: OscillatorNode;
  private body: OscillatorNode;
  private gain: GainNode;
  private pan: StereoPannerNode | null;
  private clock = 0;

  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    this.osc = ctx.createOscillator();
    this.osc.type = 'square';
    this.body = ctx.createOscillator();
    this.body.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.osc.connect(mix);
    this.body.connect(mix);
    mix.connect(lp).connect(this.gain);
    this.pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (this.pan) this.gain.connect(this.pan).connect(dest);
    else this.gain.connect(dest);
    this.osc.start();
    this.body.start();
  }

  set(dt: number, gain: number, pitch: number, pan: number): void {
    this.clock += dt;
    const hz = sirenHz(this.clock) * pitch;
    glide(this.osc.frequency, hz, this.ctx);
    glide(this.body.frequency, hz * 1.003, this.ctx);
    glide(this.gain.gain, gain * 0.35, this.ctx);
    if (this.pan) glide(this.pan.pan, clamp(pan, -1, 1), this.ctx);
  }

  stop(): void {
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.osc.stop(this.ctx.currentTime + 0.3);
    this.body.stop(this.ctx.currentTime + 0.3);
  }
}

/** Low drone of neighbouring traffic engines: two detuned saws through a dark low-pass. */
export class TrafficDrone {
  private a: OscillatorNode;
  private b: OscillatorNode;
  private gain: GainNode;

  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    this.a = ctx.createOscillator();
    this.a.type = 'sawtooth';
    this.a.frequency.value = 62;
    this.b = ctx.createOscillator();
    this.b.type = 'sawtooth';
    this.b.frequency.value = 65.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.a.connect(lp);
    this.b.connect(lp);
    lp.connect(this.gain).connect(dest);
    this.a.start();
    this.b.start();
  }

  set(gain: number, speedN: number): void {
    glide(this.gain.gain, gain * 0.5, this.ctx);
    glide(this.a.frequency, 55 + speedN * 25, this.ctx);
    glide(this.b.frequency, 58 + speedN * 26, this.ctx);
  }

  stop(): void {
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.a.stop(this.ctx.currentTime + 0.3);
    this.b.stop(this.ctx.currentTime + 0.3);
  }
}
