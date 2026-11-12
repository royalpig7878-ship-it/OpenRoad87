import { audio } from './AudioManager';
import { DriveAudioFrame, EngineProfile, clamp, engineProfile, engineTargets, mixTargets } from './audioMath';
import { SfxName, SfxOpts } from './Sfx';
import { EngineVoice, NoiseLoop, SirenVoice, TireVoice, TrafficDrone } from './Voices';

export interface EngineInit {
  /** `VehicleSpec.engineSound` id. */
  engineSound: string;
  idleRpm: number;
  redlineRpm: number;
  topSpeedKph: number;
}

/**
 * Per-layer loudness trims, set by measuring offline renders so that at full effect each ambience sits well under the
 * engine (white-noise layers are far louder than their gain suggests).
 */
export const TRIM = { wind: 0.45, rumble: 1, rain: 0.18, rattle: 0.8, tire: 1, drone: 0.2, siren: 1 } as const;

/** How often the continuous sounds are re-targeted (they glide in between). */
const UPDATE_INTERVAL = 1 / 30;

/**
 * All the sound of one drive: the car's engine, tyres, wind, rumble strips, rain, traffic drone and sirens, plus
 * the effects triggered by events. Created when a drive scene starts, destroyed when it ends. Builds its voices
 * lazily so it works even if the browser only unlocks audio after the scene began.
 */
export class DriveAudio {
  private voices: {
    ctx: AudioContext;
    out: GainNode;
    engine: EngineVoice;
    wind: NoiseLoop;
    rumble: NoiseLoop;
    rain: NoiseLoop;
    rattle: NoiseLoop;
    tire: TireVoice;
    drone: TrafficDrone;
    siren: SirenVoice;
  } | null = null;
  private profile: EngineProfile;
  private acc = 0;
  private paused = false;
  private lastFrame: DriveAudioFrame | null = null;

  constructor(private init: EngineInit) {
    this.profile = engineProfile(init.engineSound);
  }

  /** Switches to another car's engine. */
  setEngine(init: EngineInit): void {
    this.init = init;
    this.profile = engineProfile(init.engineSound);
    const v = this.voices;
    if (v) {
      v.engine.stop();
      v.engine = new EngineVoice(v.ctx, v.out, this.profile);
    }
  }

  private ensure(): boolean {
    if (this.voices) return true;
    const e = audio.engine;
    if (!e) return false;
    const out = e.ctx.createGain();
    out.gain.value = this.paused ? 0 : 1;
    out.connect(e.bus);
    const c = e.ctx;
    this.voices = {
      ctx: c,
      out,
      engine: new EngineVoice(c, out, this.profile),
      wind: new NoiseLoop(c, out, 'lowpass', 600, 0.5),
      rumble: new NoiseLoop(c, out, 'lowpass', 160, 0.7, true),
      rain: new NoiseLoop(c, out, 'highpass', 1800, 0.4),
      rattle: new NoiseLoop(c, out, 'bandpass', 900, 3, true),
      tire: new TireVoice(c, out),
      drone: new TrafficDrone(c, out),
      siren: new SirenVoice(c, out),
    };
    return true;
  }

  /** Silences/restores everything (pause menu). */
  setPaused(p: boolean): void {
    this.paused = p;
    const v = this.voices;
    if (v) v.out.gain.setTargetAtTime(p ? 0 : 1, v.ctx.currentTime, 0.02);
  }

  /** Feeds the current driving state; call every frame. */
  update(dt: number, f: DriveAudioFrame): void {
    this.lastFrame = f;
    this.acc += dt;
    if (this.acc < UPDATE_INTERVAL) return;
    const step = this.acc;
    this.acc = 0;
    if (!this.ensure() || !this.voices) return;
    const v = this.voices;
    const speedN = clamp(f.speedKph / Math.max(1, this.init.topSpeedKph), 0, 1);

    // Out of fuel: the engine dies (no sound), everything else carries on.
    const idle = this.init.idleRpm, red = this.init.redlineRpm;
    const et = engineTargets(this.profile, f.rpm, idle, red, f.outOfFuel ? 0 : f.throttle, f.shifting);
    if (f.outOfFuel) et.gain = 0;
    v.engine.set(et);

    const m = mixTargets(f);
    v.wind.set(m.windGain * TRIM.wind, m.windCutoff);
    v.rumble.set(m.rumbleGain * TRIM.rumble, undefined, m.rumbleRateHz);
    v.rain.set(m.rainGain * TRIM.rain);
    v.rattle.set(m.rattleGain * TRIM.rattle, undefined, 14);
    v.tire.set(m.tireGain * TRIM.tire, m.tireHz);
    v.drone.set(m.trafficGain * TRIM.drone, speedN);
    v.siren.set(step, m.sirenGain * TRIM.siren, m.sirenPitch, m.sirenPan);
  }

  /** Plays an effect through the same bus (respects pause). */
  sfx(name: SfxName, opts?: SfxOpts): void {
    if (this.paused) return;
    audio.sfx(name, opts);
  }

  /** Effect for a gear change; turbo cars also blow off. */
  shift(): void {
    this.sfx('shift');
    if (this.profile.whistle > 0 && (this.lastFrame?.throttle ?? 0) > 0.5) this.sfx('turboBlow');
  }

  destroy(): void {
    const v = this.voices;
    if (!v) return;
    v.engine.stop();
    v.wind.stop();
    v.rumble.stop();
    v.rain.stop();
    v.rattle.stop();
    v.tire.stop();
    v.drone.stop();
    v.siren.stop();
    setTimeout(() => v.out.disconnect(), 500);
    this.voices = null;
  }
}
